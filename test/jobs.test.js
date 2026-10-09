import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { startResearch, takeFinishedJobs, recoverJobs, runningCount } from '../lib/jobs.js';
import { runTool, toolDefinitions } from '../lib/tools.js';
import { createServer } from '../server.js';

const reply = (content, stop_reason = 'end_turn') => ({ ok: true, status: 200, json: async () => ({ stop_reason, content }) });

test('Recherche läuft im Hintergrund, speichert Notiz, meldet einmal und benachrichtigt', async () => {
  const s = new Store(null);
  let n = 0; const bodies = [];
  const fetchFn = async (url, init) => { bodies.push(JSON.parse(init.body)); return ++n === 1 ? reply([{ type: 'server_tool_use', id: 'x', name: 'web_search', input: {} }], 'pause_turn') : reply([{ type: 'text', text: 'Ergebnis: A ist am günstigsten.\nQuelle: https://example.org' }]); };
  const notified = [];
  const r = startResearch({ store: s, request: 'Finde den günstigsten Anbieter für A', apiKey: 'k', model: 'm', fetchFn, notify: async (j) => notified.push(j.status) });
  assert.equal(r.job.status, 'running');
  assert.equal(runningCount(s), 1);
  await r.done;
  assert.equal(s.data.jobs[0].status, 'done');
  assert.match(s.data.jobs[0].result, /günstigsten/);
  assert.match(s.data.notes[0].text, /Recherche/);
  assert.deepEqual(notified, ['done']);
  assert.equal(bodies[0].tools[0].name, 'web_search');
  assert.equal(bodies[1].messages.at(-1).role, 'assistant');          // pause_turn wird fortgesetzt
  assert.equal(takeFinishedJobs(s).length, 1);
  assert.equal(takeFinishedJobs(s).length, 0);
});

test('Fehler und leere Aufträge, Limit gleichzeitiger Aufträge', async () => {
  const s = new Store(null);
  assert.ok(startResearch({ store: s, request: '  ', apiKey: 'k', model: 'm' }).error);
  const r = startResearch({ store: s, request: 'x', apiKey: 'k', model: 'm', fetchFn: async () => ({ ok: false, status: 500 }), notify: async () => { throw new Error('ntfy down'); } });
  await r.done;
  assert.equal(s.data.jobs[0].status, 'failed');
  assert.match(s.data.jobs[0].result, /500/);
  const never = () => new Promise(() => {});
  startResearch({ store: s, request: 'a', apiKey: 'k', model: 'm', fetchFn: never });
  startResearch({ store: s, request: 'b', apiKey: 'k', model: 'm', fetchFn: never });
  assert.match(startResearch({ store: s, request: 'c', apiKey: 'k', model: 'm', fetchFn: never }).error, /laufen schon/);
});

test('Neustart: laufende Aufträge werden als fehlgeschlagen markiert', () => {
  const s = new Store(null);
  s.data.jobs.push({ id: 'a', title: 't', status: 'running', result: '', seen: false });
  recoverJobs(s);
  assert.equal(s.data.jobs[0].status, 'failed');
});

test('Werkzeuge start_research, list_jobs, get_job', async () => {
  const s = new Store(null);
  assert.ok(!toolDefinitions({ researchEnabled: false }).some(t => t.name === 'start_research'));
  assert.ok(toolDefinitions({ researchEnabled: true }).some(t => t.name === 'start_research'));
  const startResearchFn = (req) => ({ job: { id: 'j1' } });
  assert.match(await runTool(s, 'start_research', { request: 'x' }, { startResearch: startResearchFn }), /ID j1/);
  s.data.jobs.push({ id: 'j2', title: 'Titel', status: 'done', result: 'Volltext' });
  assert.match(await runTool(s, 'list_jobs', {}), /j2 \[done\] Titel/);
  assert.match(await runTool(s, 'get_job', { id: 'j2' }), /Volltext/);
});

test('Server: Chat startet Recherche, /api/poll liefert das Ergebnis genau einmal, Push ohne Ergebnistext', async () => {
  const pushes = [];
  let step = 0;
  const fetchFn = async (url, init) => {
    if (url === 'https://ntfy.example') { pushes.push(JSON.parse(init.body)); return { ok: true }; }
    const b = JSON.parse(init.body);
    if (b.tools?.some(t => t.name === 'start_research')) {               // Chat
      return ++step === 1
        ? reply([{ type: 'tool_use', id: 't1', name: 'start_research', input: { request: 'Finde Angebote' } }], 'tool_use')
        : reply([{ type: 'text', text: 'Augustin, ich recherchiere und melde mich.' }]);
    }
    return reply([{ type: 'text', text: 'Geheimes Ergebnis' }]);          // Recherche
  };
  const { server, store } = createServer({ store: new Store(null), apiKey: 'k', fetchFn, ntfy: { server: 'https://ntfy.example', topic: 't' }, mail: null, voice: null });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const chat = await (await fetch(base + '/api/chat', { method: 'POST', body: JSON.stringify({ message: 'Such mir Angebote raus' }) })).json();
    assert.match(chat.reply, /recherchiere/);
    await new Promise(r => setTimeout(r, 50));
    const poll = await (await fetch(base + '/api/poll')).json();
    assert.equal(poll.jobs.length, 1);
    assert.match(poll.jobs[0].result, /Geheimes Ergebnis/);
    assert.equal((await (await fetch(base + '/api/poll')).json()).jobs.length, 0);
    assert.equal(pushes.length, 1);
    assert.ok(!pushes[0].message.includes('Geheimes'));
    assert.equal(pushes[0].title, 'Recherche fertig');
  } finally { await new Promise(r => server.close(r)); }
});
