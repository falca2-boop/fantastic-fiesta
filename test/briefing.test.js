import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { briefingDue, briefingConfig, runBriefing, takeBriefing, startBriefingScheduler, dateKey } from '../lib/briefing.js';
import { runTool } from '../lib/tools.js';
import { Store } from '../lib/store.js';
import { createServer } from '../server.js';

const at = (h, m, day = 9) => new Date(2026, 10, day, h, m, 0);
const fakeFetch = (text = 'Briefing: Lage ruhig.') => async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) });

test('briefingDue: vor der Zeit nein, danach ja, nur einmal pro Tag, höchstens 3 Stunden zu spät, aus = nie', () => {
  const config = { time: '07:30' };
  assert.equal(briefingDue({ config, lastDate: null, now: at(7, 29) }), false);
  assert.equal(briefingDue({ config, lastDate: null, now: at(7, 30) }), true);
  assert.equal(briefingDue({ config, lastDate: null, now: at(10, 29) }), true);
  assert.equal(briefingDue({ config, lastDate: null, now: at(10, 31) }), false);
  assert.equal(briefingDue({ config, lastDate: dateKey(at(7, 30)), now: at(8, 0) }), false);
  assert.equal(briefingDue({ config, lastDate: dateKey(at(7, 30, 8)), now: at(8, 0) }), true);   // gestern erstellt, heute neu
  assert.equal(briefingDue({ config: { time: '' }, lastDate: null, now: at(8, 0) }), false);
});

test('Einstellung per Sprache: set_briefing prüft die Zeit; Sprachbefehl geht vor .env', async () => {
  const s = new Store(null);
  assert.deepEqual(briefingConfig(s, { MORNING_BRIEFING_TIME: '6:45', MORNING_BRIEFING_TOPICS: 'Europa' }), { time: '06:45', topics: 'Europa' });
  assert.equal(briefingConfig(s, { MORNING_BRIEFING_TIME: 'abends' }).time, '');
  assert.deepEqual(briefingConfig(s, { MORNING_BRIEFING_TIME: '06:45' }).time, '06:45');
  assert.match(await runTool(s, 'set_briefing', { time: '25:99' }), /Ungültige Uhrzeit/);
  assert.match(await runTool(s, 'set_briefing', { time: '7:30', topics: 'Technik' }), /täglich um 07:30 Uhr.*Schwerpunkt Technik/);
  assert.deepEqual(briefingConfig(s, { MORNING_BRIEFING_TIME: '06:45' }), { time: '07:30', topics: 'Technik' });
  assert.match(await runTool(s, 'set_briefing', { time: 'aus' }), /ausgeschaltet/);
  assert.equal(briefingConfig(s, { MORNING_BRIEFING_TIME: '06:45' }).time, '');
});

test('runBriefing: Agent läuft, Ergebnis wird einmal ausgeliefert und als Notiz abgelegt', async () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
  const s = new Store(null, { vaultDir: vault });
  const now = at(7, 31);
  const text = await runBriefing({ store: s, apiKey: 'k', model: 'm', fetchFn: fakeFetch(), topics: 'Technik', now });
  assert.equal(text, 'Briefing: Lage ruhig.');
  assert.deepEqual(takeBriefing(s), { date: dateKey(now), text });
  assert.equal(takeBriefing(s), null);
  const notes = fs.readdirSync(path.join(vault, 'Jarvis', 'Notizen'));
  assert.equal(notes.length, 1);
  assert.match(fs.readFileSync(path.join(vault, 'Jarvis', 'Notizen', notes[0]), 'utf8'), /Lage ruhig/);
});

test('Zeitplaner: läuft genau einmal pro Tag; Fehler werden gemeldet und nicht endlos wiederholt', async () => {
  const s = new Store(null); s.data.briefingConfig = { time: '07:30', topics: '' };
  let runs = 0, clockNow = at(7, 29);
  const log = { log() {}, warn() {} };
  const stop = startBriefingScheduler({ store: s, log, intervalMs: 5, clock: () => clockNow,
    getRun: () => async ({ now }) => { runs++; s.data.briefing = { date: dateKey(now), text: 'fertig', delivered: false }; } });
  await new Promise((r) => setTimeout(r, 40)); assert.equal(runs, 0);
  clockNow = at(7, 30); await new Promise((r) => setTimeout(r, 60)); assert.equal(runs, 1);
  clockNow = at(9, 0); await new Promise((r) => setTimeout(r, 40)); assert.equal(runs, 1);
  stop();
  const s2 = new Store(null); s2.data.briefingConfig = { time: '07:30', topics: '' };
  let n2 = 0;
  const stop2 = startBriefingScheduler({ store: s2, log, intervalMs: 5, clock: () => at(7, 31), getRun: () => async () => { n2++; throw new Error('kein Netz'); } });
  await new Promise((r) => setTimeout(r, 60)); stop2();
  assert.equal(n2, 1);
  assert.match(takeBriefing(s2).text, /konnte nicht erstellt werden: kein Netz/);
});

test('API /api/poll liefert das Briefing genau einmal', async () => {
  const s = new Store(null);
  s.data.briefing = { date: '2026-11-09', ts: 'x', text: 'Guten Morgen Lage', delivered: false };
  const { server } = createServer({ store: s, apiKey: 'k', fetchFn: fakeFetch(), voice: null, mail: null });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const a = await (await fetch(base + '/api/poll')).json(); const b = await (await fetch(base + '/api/poll')).json();
  assert.equal(a.briefing.text, 'Guten Morgen Lage'); assert.equal(b.briefing, null);
  server.close();
});
