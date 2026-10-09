import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { systemPrompt, summarizeOld, chat } from '../lib/agent.js';

/** Minimaler Upstash-Ersatz: POST [BEFEHL, key, value]. */
function fakeRedis() {
  const db = new Map(); const log = [];
  const fetchFn = async (url, init) => {
    const [cmd, key, value] = JSON.parse(init.body);
    log.push(cmd);
    if (init.headers.Authorization !== 'Bearer tok') return { ok: false, status: 401 };
    if (cmd === 'SET') { db.set(key, value); return { ok: true, json: async () => ({ result: 'OK' }) }; }
    return { ok: true, json: async () => ({ result: db.get(key) ?? null }) };
  };
  return { db, log, fetchFn };
}
const remote = { url: 'https://r.example', token: 'tok' };

test('Gedächtnis überlebt einen Neustart über die Datenbank', async () => {
  const redis = fakeRedis();
  const a = new Store(null, { remote, fetchFn: redis.fetchFn, debounceMs: 5 });
  await a.init();                                   // leer: lädt den (leeren) Stand hoch
  a.data.facts.push('Augustin mag Espresso');
  a.save();
  await a.flush();

  const b = new Store(null, { remote, fetchFn: redis.fetchFn });   // "neuer Server", leeres Dateisystem
  await b.init();
  assert.deepEqual(b.data.facts, ['Augustin mag Espresso']);
});

test('Datenbank nicht erreichbar: Start mit lokalem Stand, kein Absturz', async () => {
  const s = new Store(null, { remote: { ...remote, token: 'falsch' }, fetchFn: fakeRedis().fetchFn });
  s.data.facts.push('lokal');
  await s.init();
  assert.deepEqual(s.data.facts, ['lokal']);
});

test('Systemprompt enthält Fakten und Zusammenfassung', () => {
  const s = new Store(null);
  s.data.facts.push('Die Katze heißt Mia'); s.data.summary = 'Plant einen Umzug nach Würzburg.';
  const p = systemPrompt(s, { userName: 'Augustin', now: Date.UTC(2026, 9, 9), offsetMinutes: -120 });
  assert.match(p, /Die Katze heißt Mia/);
  assert.match(p, /Umzug nach Würzburg/);
  assert.match(p, /von dir aus mit remember/);
});

const history = (n) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'Nachricht ' + i }));

test('Zusammenfassung: nur bei langem Verlauf, älteste Nachrichten werden ersetzt', async () => {
  const s = new Store(null);
  s.data.history = history(20);
  let called = 0;
  const fetchFn = async (url, init) => { called++; return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Kurzfassung des Verlaufs.' }] }) }; };
  assert.equal(await summarizeOld({ store: s, apiKey: 'k', model: 'm', fetchFn }), false);
  assert.equal(called, 0);

  s.data.history = history(30);
  assert.equal(await summarizeOld({ store: s, apiKey: 'k', model: 'm', fetchFn }), true);
  assert.equal(s.data.summary, 'Kurzfassung des Verlaufs.');
  assert.equal(s.data.history.length, 10);
  assert.equal(s.data.history[0].role, 'user');
  assert.equal(s.data.history[0].content, 'Nachricht 20');
});

test('Zusammenfassung schlägt fehl: Verlauf bleibt unverändert', async () => {
  const s = new Store(null); s.data.history = history(30);
  assert.equal(await summarizeOld({ store: s, apiKey: 'k', model: 'm', fetchFn: async () => ({ ok: false, status: 500 }) }), false);
  assert.equal(s.data.history.length, 30);
  assert.equal(s.summarizing, false);
});

test('chat() startet die Zusammenfassung im Hintergrund, ohne die Antwort zu verzögern', async () => {
  const s = new Store(null); s.data.history = history(28);
  const bodies = [];
  const fetchFn = async (url, init) => {
    const b = JSON.parse(init.body); bodies.push(b);
    const text = b.tools ? 'Antwort.' : 'Neue Zusammenfassung.';
    return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) };
  };
  const reply = await chat({ store: s, message: 'Hi', apiKey: 'k', model: 'm', userName: 'A', fetchFn });
  assert.equal(reply, 'Antwort.');
  await new Promise(r => setTimeout(r, 20));
  assert.equal(s.data.summary, 'Neue Zusammenfassung.');
  assert.ok(s.data.history.length <= 12);
});
