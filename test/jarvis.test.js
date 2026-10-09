import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { runTool, takeDueReminders } from '../lib/tools.js';
import { chat, localIso } from '../lib/agent.js';
import { createServer } from '../server.js';

const NOW = Date.parse('2026-10-09T08:00:00Z');

test('Aufgaben anlegen und erledigen', async () => {
  const s = new Store(null);
  const msg = await runTool(s, 'add_task', { text: 'Milch kaufen' });
  const id = msg.match(/ID (\w+)/)[1];
  assert.equal(s.data.tasks.length, 1);
  assert.match(await runTool(s, 'complete_task', { id }), /Erledigt/);
  assert.equal(s.data.tasks[0].done, true);
  assert.match(await runTool(s, 'complete_task', { id: 'nope' }), /nicht gefunden/);
});

test('Erinnerungen: Vergangenheit wird abgelehnt, fällige werden einmal geliefert', async () => {
  const s = new Store(null);
  assert.match(await runTool(s, 'set_reminder', { text: 'x', at: '2026-10-09T09:00:00+02:00' }, { now: NOW }), /Vergangenheit/);
  assert.match(await runTool(s, 'set_reminder', { text: 'x', at: 'quatsch' }, { now: NOW }), /Ungültige/);
  await runTool(s, 'set_reminder', { text: 'Anruf', at: '2026-10-09T11:00:00+02:00' }, { now: NOW });
  assert.equal(takeDueReminders(s, NOW).length, 0);
  assert.equal(takeDueReminders(s, NOW + 2 * 3600e3).length, 1);
  assert.equal(takeDueReminders(s, NOW + 2 * 3600e3).length, 0);
});

test('localIso formatiert Offset wie die Browser-Zeitzone', () => {
  assert.equal(localIso(NOW, -120), '2026-10-09T10:00+02:00');
  assert.equal(localIso(NOW, 300), '2026-10-09T03:00-05:00');
});

test('Agent führt Werkzeug aus und speichert den Verlauf', async () => {
  const s = new Store(null);
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const body = calls.length === 1
      ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'add_task', input: { text: 'Test' } }] }
      : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Augustin, erledigt.' }] };
    return { ok: true, status: 200, json: async () => body };
  };
  const reply = await chat({ store: s, message: 'Merk dir Test', apiKey: 'k', model: 'm', userName: 'Augustin', fetchFn: fakeFetch, now: NOW });
  assert.equal(reply, 'Augustin, erledigt.');
  assert.equal(s.data.tasks[0].text, 'Test');
  assert.equal(s.data.history.length, 2);
  assert.equal(calls[1].messages.at(-1).content[0].type, 'tool_result');
  assert.ok(!calls[0].tools.some(t => t.name === 'external_action'));
});

async function withServer(opts, fn) {
  const { server } = createServer({ store: new Store(null), ...opts });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise(r => server.close(r)); }
}

test('Server: Token wird erzwungen, Chat funktioniert mit Token', async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hallo.' }] }) });
  await withServer({ token: 'geheim', apiKey: 'k', fetchFn: fakeFetch }, async (base) => {
    assert.equal((await fetch(base + '/api/state')).status, 401);
    assert.equal((await fetch(base + '/api/state', { headers: { Authorization: 'Bearer falsch' } })).status, 401);
    const ok = await fetch(base + '/api/chat', { method: 'POST', headers: { Authorization: 'Bearer geheim' }, body: JSON.stringify({ message: 'Hi' }) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).reply, 'Hallo.');
    assert.equal((await fetch(base + '/api/health')).status, 200);
  });
});

test('Server: Pfad-Traversal und leere Nachricht werden abgewiesen', async () => {
  await withServer({ apiKey: 'k' }, async (base) => {
    const res = await fetch(base + '/%2e%2e/package.json');
    assert.ok([403, 404].includes(res.status));
    assert.equal((await fetch(base + '/')).status, 200);
    const bad = await fetch(base + '/api/chat', { method: 'POST', body: JSON.stringify({ message: '  ' }) });
    assert.equal(bad.status, 400);
  });
});
