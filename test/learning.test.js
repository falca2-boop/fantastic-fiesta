import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordFeedback, parseLearning, runLearning, learnedBlock, forgetLearned, deleteLearnedAt, learningConfig, startLearningScheduler } from '../lib/learning.js';
import { runTool } from '../lib/tools.js';
import { systemPrompt } from '../lib/agent.js';
import { runAgent } from '../lib/agents.js';
import { Store } from '../lib/store.js';
import { createServer } from '../server.js';

const reply = (obj, usage = { input_tokens: 2000, output_tokens: 300 }) => async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '```json\n' + JSON.stringify(obj) + '\n```' }], usage }) });
const now = new Date(2026, 10, 9, 22, 31);

test('Feedback wird gespeichert, begrenzt und nur up/down angenommen', () => {
  const s = new Store(null);
  assert.throws(() => recordFeedback(s, { rating: 'meh' }), /Ungültige Bewertung/);
  for (let i = 0; i < 230; i++) recordFeedback(s, { rating: i % 2 ? 'up' : 'down', user: 'frage ' + i, reply: 'x'.repeat(600) });
  assert.equal(s.data.feedback.length, 200); assert.equal(s.data.feedback[0].reply.length, 400);
});

test('parseLearning: Codeblock-JSON, filtert Geheimnisse, Links und Zu-Kurzes, begrenzt Mengen', () => {
  const r = parseLearning('Hier: ```json\n' + JSON.stringify({
    learned: ['Antwortet gern kurz am Morgen', 'Mein api key ist abc', 'Siehe https://x.example', 'kurz', ...Array.from({ length: 20 }, (_, i) => 'Vorliebe Nummer ' + i)],
    facts: ['Wohnt in Graz'], agent_tips: [{ agent: 'recherche', tip: 'Immer Quellen mit Datum nennen' }, { agent: 'x', tip: 'mein Passwort lautet 123' }], summary: 'Kurz gelernt.',
  }) + '\n```');
  assert.ok(r.learned.includes('Antwortet gern kurz am Morgen'));
  assert.ok(!r.learned.some((t) => /api key|https/.test(t))); assert.ok(r.learned.length <= 12);
  assert.deepEqual(r.agentTips, [{ agent: 'recherche', tip: 'Immer Quellen mit Datum nennen' }]);
  assert.throws(() => parseLearning('kein json'), /Keine Lernergebnisse/);
});

test('Lernrunde: nutzt Feedback und Nutzernachrichten, speichert Gelerntes, Fakten, Vorschläge, Notiz, Verbrauch', async () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
  const s = new Store(null, { vaultDir: vault });
  s.data.history = [{ role: 'user', content: 'Fass dich bitte kürzer' }, { role: 'assistant', content: 'Okay.' }];
  recordFeedback(s, { rating: 'down', user: 'Wetter?', reply: 'Ein sehr langer Text …' });
  let sent;
  const fetchFn = async (u, o) => { sent = JSON.parse(o.body); return reply({ learned: ['Mag kurze Antworten'], facts: ['Nennt sich Augustin'], agent_tips: [{ agent: 'nachrichten', tip: 'Höchstens 3 Meldungen' }], summary: 'Du magst es kurz.' })(); };
  const r = await runLearning({ store: s, apiKey: 'k', model: 'claude-sonnet-5-5', fetchFn, now });
  assert.match(sent.messages[0].content, /Fass dich bitte kürzer/); assert.match(sent.messages[0].content, /"bewertung":"down"/);
  assert.match(sent.system, /NUR aus dem, was der Nutzer selbst gesagt/);
  assert.deepEqual(s.data.learned, ['Mag kurze Antworten']);
  assert.ok(s.data.facts.includes('Nennt sich Augustin'));
  assert.equal(s.data.agentProposals.length, 1); assert.equal(s.data.feedback[0].used, true);
  assert.equal(r.summary, 'Du magst es kurz.');
  assert.ok(s.data.usage && Object.values(s.data.usage)[0].kinds['Lernrunde'].calls === 1);
  const notes = fs.readdirSync(path.join(vault, 'Jarvis', 'Notizen'));
  assert.match(fs.readFileSync(path.join(vault, 'Jarvis', 'Notizen', notes[0]), 'utf8'), /Lernnotiz 2026-11-09/);
  // zweiter Lauf ohne neues Feedback: bisherige Nachrichten gelten weiter, Vorschläge nicht doppelt
  await runLearning({ store: s, apiKey: 'k', model: 'claude-sonnet-5-5', fetchFn, now });
  assert.equal(s.data.agentProposals.length, 1);
});

test('Ohne Anlass kein API-Aufruf; Lernstand erscheint im System-Prompt und lässt sich vergessen/löschen', async () => {
  const s = new Store(null); let called = 0;
  const r = await runLearning({ store: s, apiKey: 'k', model: 'm', fetchFn: async () => { called++; }, now });
  assert.equal(called, 0); assert.match(r.summary, /nichts zu lernen/);
  s.data.learned = ['Mag trockenen Humor', 'Antwortet gern kurz'];
  assert.match(systemPrompt(s, { userName: 'A', now: Date.now(), offsetMinutes: 0 }), /Gelernte Vorlieben.*Mag trockenen Humor; Antwortet gern kurz/);
  assert.match(forgetLearned(s, 'humor'), /Vergessen: 1/); assert.deepEqual(s.data.learned, ['Antwortet gern kurz']);
  assert.equal(deleteLearnedAt(s, 0), true); assert.equal(learnedBlock(s), '');
});

test('Agenten-Vorschläge: erst nach Zustimmung wirksam, wirken dann im Agenten', async () => {
  const s = new Store(null);
  s.data.agentProposals = [{ id: 'abc12', agent: 'recherche', tip: 'Immer Quellen mit Datum nennen' }];
  assert.match(await runTool(s, 'list_agent_proposals', {}), /abc12: Agent recherche/);
  let sys; const fetchFn = async (u, o) => { sys = JSON.parse(o.body).system; return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }) }; };
  await runAgent({ store: s, name: 'recherche', task: 'x', apiKey: 'k', model: 'm', fetchFn }); assert.doesNotMatch(sys, /Gelernte Hinweise/);
  assert.match(await runTool(s, 'apply_agent_proposal', { id: 'abc12' }), /Übernommen/);
  await runAgent({ store: s, name: 'recherche', task: 'x', apiKey: 'k', model: 'm', fetchFn }); assert.match(sys, /Gelernte Hinweise.*Quellen mit Datum/);
  assert.match(await runTool(s, 'apply_agent_proposal', { id: 'abc12' }), /gibt es nicht/);
  s.data.agentProposals = [{ id: 'zzz99', agent: 'recherche', tip: 'x' }];
  assert.match(await runTool(s, 'dismiss_agent_proposal', { id: 'zzz99' }), /verworfen/);
  assert.match(await runTool(s, 'learn_now', {}), /nicht verfügbar/);
  assert.match(await runTool(s, 'set_learning', { time: '25:00' }), /Ungültig/);
  assert.match(await runTool(s, 'set_learning', { time: '21:00' }), /21:00/); assert.equal(learningConfig(s).time, '21:00');
  assert.match(await runTool(s, 'set_learning', { time: 'aus' }), /ausgeschaltet/); assert.equal(learningConfig(s).time, '');
});

test('Zeitplan: Standard 22:30, JARVIS_LEARNING=off aus; Planer läuft einmal pro Tag', async () => {
  const s = new Store(null);
  assert.equal(learningConfig(s, {}).time, '22:30'); assert.equal(learningConfig(s, { JARVIS_LEARNING: 'off' }).time, ''); assert.equal(learningConfig(s, { LEARN_TIME: '6:15' }).time, '06:15');
  let runs = 0, t = new Date(2026, 10, 9, 22, 29); const log = { log() {}, warn() {} };
  const stop = startLearningScheduler({ store: s, log, intervalMs: 5, clock: () => t, getRun: () => async ({ now: n }) => { runs++; s.data.learning = { date: '2026-11-09' }; } });
  await new Promise((r) => setTimeout(r, 30)); assert.equal(runs, 0);
  t = new Date(2026, 10, 9, 22, 31); await new Promise((r) => setTimeout(r, 40)); assert.equal(runs, 1);
  await new Promise((r) => setTimeout(r, 40)); assert.equal(runs, 1); stop();
});

test('API: Feedback speichern, ungültig = 400, Gelerntes löschen; Zustand zeigt Lernstand', async () => {
  const s = new Store(null); s.data.learned = ['Mag kurze Antworten', 'Mag Humor'];
  const { server } = createServer({ store: s, apiKey: 'k', fetchFn: async () => ({ ok: false, status: 500 }), voice: null, mail: null });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port; const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  assert.equal((await post('/api/feedback', { rating: 'up', user: 'Hi', reply: 'Hallo' })).status, 200);
  assert.equal((await post('/api/feedback', { rating: 'x' })).status, 400);
  assert.equal(s.data.feedback.length, 1);
  const st = await (await fetch(base + '/api/state')).json();
  assert.deepEqual(st.learned.map((l) => l.text), ['Mag kurze Antworten', 'Mag Humor']); assert.equal(st.learning.time, '22:30');
  const del = await (await post('/api/learned/delete', { index: 0 })).json();
  assert.deepEqual(del.state.learned.map((l) => l.text), ['Mag Humor']);
  server.close();
});
