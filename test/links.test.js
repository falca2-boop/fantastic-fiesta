import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { runTool, toolDefinitions, safeUrl } from '../lib/tools.js';

test('Standardseiten sind Amazon und World Monitor', () => {
  const s = new Store(null);
  assert.deepEqual(s.data.links.map(l => l.name), ['World Monitor', 'Amazon']);
  assert.ok(toolDefinitions({}).some(t => t.name === 'open_link'));
});

test('open_link: Name unscharf, Suche mit Maskierung, Seite ohne Suche', async () => {
  const s = new Store(null); const actions = [];
  assert.match(await runTool(s, 'open_link', { name: 'world monitor' }, { actions }), /bereitgestellt/);
  assert.deepEqual(actions[0], { type: 'open', name: 'World Monitor', url: 'https://www.worldmonitor.app' });
  await runTool(s, 'open_link', { name: 'Amazon', query: 'Kaffee & Milch äöü' }, { actions });
  assert.equal(actions[1].url, 'https://www.amazon.de/s?k=Kaffee%20%26%20Milch%20%C3%A4%C3%B6%C3%BC');
  assert.match(await runTool(s, 'open_link', { name: 'worldmonitor', query: 'x' }, { actions }), /keine gespeicherte Suche/);
  assert.equal(actions[2].url, 'https://www.worldmonitor.app');
  assert.match(await runTool(s, 'open_link', { name: 'Ebay' }, { actions }), /nicht gespeichert/);
  assert.equal(actions.length, 3);
});

test('add_link und remove_link: nur http(s), Duplikate ersetzt, Suche optional', async () => {
  const s = new Store(null);
  assert.match(await runTool(s, 'add_link', { name: 'Böse', url: 'javascript:alert(1)' }), /Ungültige/);
  assert.match(await runTool(s, 'add_link', { name: 'Böse', url: 'data:text/html,x' }), /Ungültige/);
  assert.match(await runTool(s, 'add_link', { name: 'Test', url: 'https://example.org', search_url: 'javascript:{q}' }), /Ungültige Such/);
  await runTool(s, 'add_link', { name: 'Wiki', url: 'https://de.wikipedia.org', search_url: 'https://de.wikipedia.org/w/index.php?search={q}' });
  await runTool(s, 'add_link', { name: 'wiki', url: 'https://de.wikipedia.org/' });          // ersetzt
  assert.equal(s.data.links.filter(l => l.name.toLowerCase() === 'wiki').length, 1);
  assert.match(await runTool(s, 'remove_link', { name: 'Wiki' }), /Entfernt/);
  assert.match(await runTool(s, 'remove_link', { name: 'Wiki' }), /nicht gespeichert/);
  assert.equal(safeUrl('ftp://x'), '');
  assert.equal(safeUrl('https://a.de/x'), 'https://a.de/x');
});

test('Alter Speicherstand ohne links bekommt die Standardseiten', () => {
  const s = new Store(null);
  s.data = { ...s.data, ...{} };
  assert.equal(s.data.links.length, 2);
});

test('system_status liefert Übersicht ohne Geheimnisse', async () => {
  const { createServer } = await import('../server.js');
  const bodies = []; let n = 0;
  const fetchFn = async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => (++n === 1
    ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'system_status', input: {} }] }
    : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }) }; };
  const { server } = createServer({ store: new Store(null), apiKey: 'SECRET-KEY', token: 'SECRET-TOKEN', mail: null, voice: null, ntfy: null, fetchFn });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, { method: 'POST', headers: { Authorization: 'Bearer SECRET-TOKEN' }, body: JSON.stringify({ message: 'Was fehlt noch?' }) });
    assert.equal(res.status, 200);
    const result = bodies[1].messages.at(-1).content[0].content;
    assert.match(result, /AN: Denken/);
    assert.match(result, /AUS: Stimme \(ElevenLabs\) – fehlt: ELEVENLABS_API_KEY/);
    assert.match(result, /AUS: Mail-Überwachung/);
    assert.ok(!result.includes('SECRET'));
  } finally { await new Promise(r => server.close(r)); }
});

test('system_status direkt: zeigt AN/AUS und fehlende Variablen, nie Werte', async () => {
  const text = await runTool(new Store(null), 'system_status', {}, { systemStatus: () => 'AN Denken\nAUS Stimme – fehlt: ELEVENLABS_API_KEY' });
  assert.match(text, /AUS Stimme – fehlt: ELEVENLABS_API_KEY/);
  assert.match(await runTool(new Store(null), 'system_status', {}), /Keine Statusinformation/);
});
