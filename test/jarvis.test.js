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

test('Server: /api/speak ruft ElevenLabs mit Stimme und Key auf und liefert Audio', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; };
  await withServer({ token: 'geheim', voice: { apiKey: 'xk', voiceId: 'VOICE1', model: 'm1' }, fetchFn: fakeFetch }, async (base) => {
    const h = { Authorization: 'Bearer geheim' };
    assert.equal((await fetch(base + '/api/speak', { method: 'POST', body: '{"text":"Hallo"}' })).status, 401);
    assert.equal((await (await fetch(base + '/api/health')).json()).voice, true);
    const res = await fetch(base + '/api/speak', { method: 'POST', headers: h, body: JSON.stringify({ text: 'Hallo Augustin' }) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/mpeg');
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3]);
    assert.match(calls[0].url, /text-to-speech\/VOICE1\?/);
    assert.equal(calls[0].init.headers['xi-api-key'], 'xk');
    assert.equal(JSON.parse(calls[0].init.body).model_id, 'm1');
    assert.equal((await fetch(base + '/api/speak', { method: 'POST', headers: h, body: JSON.stringify({ text: 'x'.repeat(801) }) })).status, 400);
  });
});

test('Server: /api/speak ohne Stimme-Konfiguration meldet 501, ElevenLabs-Fehler wird zu 502', async () => {
  await withServer({ voice: null }, async (base) => {
    assert.equal((await fetch(base + '/api/speak', { method: 'POST', body: '{"text":"Hallo"}' })).status, 501);
    assert.equal((await (await fetch(base + '/api/health')).json()).voice, false);
  });
  await withServer({ voice: { apiKey: 'k', voiceId: 'v', model: 'm' }, fetchFn: async () => ({ ok: false, status: 401 }) }, async (base) => {
    assert.equal((await fetch(base + '/api/speak', { method: 'POST', body: '{"text":"Hallo"}' })).status, 502);
  });
});

test('Obsidian: Notizen und Gedächtnis liegen als Markdown im Vault', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
  const s = new Store(null, { vaultDir: vault });
  assert.match(await runTool(s, 'add_note', { text: 'Idee: Podcast / Folge #1' }, { now: NOW }), /Obsidian/);
  const files = fs.readdirSync(path.join(vault, 'Jarvis', 'Notizen'));
  assert.deepEqual(files, ['2026-10-09 Idee Podcast Folge 1.md']);
  fs.writeFileSync(path.join(vault, 'Jarvis', 'Notizen', 'Eigene.md'), 'von Hand geschrieben');
  const list = await runTool(s, 'list_notes', {});
  assert.match(list, /Podcast/); assert.match(list, /von Hand/);
  assert.equal(s.data.notes.length, 0);

  await runTool(s, 'remember', { fact: 'Trinkt Kaffee schwarz' });
  assert.match(fs.readFileSync(path.join(vault, 'Jarvis', 'Gedächtnis.md'), 'utf8'), /- Trinkt Kaffee schwarz/);
  fs.appendFileSync(path.join(vault, 'Jarvis', 'Gedächtnis.md'), '- Wohnt in Köln\n');
  await runTool(s, 'remember', { fact: 'Mag Tee nicht' });
  assert.deepEqual(s.data.facts, ['Trinkt Kaffee schwarz', 'Wohnt in Köln', 'Mag Tee nicht']);
  await runTool(s, 'forget', { contains: 'köln' });
  assert.doesNotMatch(fs.readFileSync(path.join(vault, 'Jarvis', 'Gedächtnis.md'), 'utf8'), /Köln/);

  const pre = new Store(null); pre.data.facts = ['Alt'];
  pre.vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-')); pre.syncFacts();
  assert.match(fs.readFileSync(path.join(pre.vaultDir, 'Jarvis', 'Gedächtnis.md'), 'utf8'), /- Alt/);
});
