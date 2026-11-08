import test from 'node:test';
import assert from 'node:assert/strict';
import { costOf, recordUsage, usageSummary, checkLimit, dayKey } from '../lib/usage.js';
import { chat } from '../lib/agent.js';
import { runAgent } from '../lib/agents.js';
import { Store } from '../lib/store.js';
import { createServer } from '../server.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' vs ' + b);
const day = new Date(2026, 10, 9, 12, 0, 0);

test('Kosten: Sonnet 5.5 = 2 $ Eingabe, 10 $ Ausgabe, 0,20 $ Cache-Treffer, 1 Cent pro Websuche; unbekanntes Modell = null', () => {
  near(costOf('claude-sonnet-5-5', { input: 1e6 }), 2);
  near(costOf('claude-sonnet-5-5', { output: 1e6 }), 10);
  near(costOf('claude-sonnet-5-5', { cacheRead: 1e6 }), 0.2);
  near(costOf('claude-sonnet-5-5', { input: 10000, output: 300, searches: 2 }), 0.02 + 0.003 + 0.02);
  assert.equal(costOf('modell-xyz', { input: 100 }), null);
});

test('Verbuchen pro Tag und Verwendung, Monatssumme, nur 40 Tage behalten', () => {
  const s = new Store(null);
  recordUsage(s, { model: 'claude-sonnet-5-5', kind: 'Gespräch', now: day, usage: { input_tokens: 10000, output_tokens: 500, server_tool_use: { web_search_requests: 1 } } });
  recordUsage(s, { model: 'claude-sonnet-5-5', kind: 'Agent recherche', now: day, usage: { input_tokens: 20000, output_tokens: 1000, cache_read_input_tokens: 5000 } });
  recordUsage(s, { model: 'claude-sonnet-5-5', kind: 'Gespräch', now: new Date(2026, 10, 2), usage: { input_tokens: 1000000 } });   // früher im Monat
  recordUsage(s, { model: 'claude-sonnet-5-5', kind: 'Gespräch', now: new Date(2026, 9, 30), usage: { input_tokens: 1000000 } });  // Vormonat
  const u = usageSummary(s, day, {});
  assert.equal(u.today.calls, 2); assert.equal(u.today.searches, 1); assert.equal(u.today.tokens, 36500);
  near(u.today.cost, (0.02 + 0.005 + 0.01) + (0.04 + 0.01 + 0.001));
  near(u.month.cost, u.today.cost + 2);                                    // Vormonat zählt nicht
  assert.deepEqual(u.kinds.map((k) => k.name), ['Agent recherche', 'Gespräch']);          // nach Kosten sortiert
  assert.equal(u.limit, 0); assert.equal(u.limitReached, false);
  for (let i = 0; i < 60; i++) recordUsage(s, { model: 'claude-sonnet-5-5', now: new Date(2026, 0, 1 + i), usage: { input_tokens: 1 } });
  assert.ok(Object.keys(s.data.usage).length <= 40);
});

test('Unbekanntes Modell wird gezählt, aber als „ohne Preis“ markiert', () => {
  const s = new Store(null);
  recordUsage(s, { model: 'eigenes-modell', now: day, usage: { input_tokens: 500, output_tokens: 50 } });
  const u = usageSummary(s, day, {});
  assert.equal(u.today.tokens, 550); assert.equal(u.today.cost, 0); assert.equal(u.today.unpriced, 1);
});

test('Tageslimit stoppt weitere KI-Aufrufe (Gespräch und Agent), ohne Limit nie', async () => {
  const s = new Store(null);
  recordUsage(s, { model: 'claude-sonnet-5-5', now: new Date(), usage: { input_tokens: 1000000 } });   // 2 $
  assert.doesNotThrow(() => checkLimit(s, new Date(), {}));
  assert.doesNotThrow(() => checkLimit(s, new Date(), { JARVIS_DAILY_LIMIT_USD: '5' }));
  assert.throws(() => checkLimit(s, new Date(), { JARVIS_DAILY_LIMIT_USD: '1.5' }), /Tageslimit von 1.50 \$ ist erreicht/);
  process.env.JARVIS_DAILY_LIMIT_USD = '1';
  let called = 0; const fetchFn = async () => { called++; return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'x' }] }) }; };
  try {
    await assert.rejects(chat({ store: s, message: 'hi', apiKey: 'k', model: 'claude-sonnet-5-5', userName: 'A', fetchFn }), /Tageslimit/);
    await assert.rejects(runAgent({ store: s, name: 'recherche', task: 'x', apiKey: 'k', model: 'claude-sonnet-5-5', fetchFn }), /Tageslimit/);
    assert.equal(called, 0);
  } finally { delete process.env.JARVIS_DAILY_LIMIT_USD; }
});

test('Gespräch und Agent verbuchen den echten Verbrauch aus der API-Antwort; /api/state liefert die Summe', async () => {
  const s = new Store(null);
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hallo' }], usage: { input_tokens: 8000, output_tokens: 200, server_tool_use: { web_search_requests: 1 } } }) });
  await chat({ store: s, message: 'Hi', apiKey: 'k', model: 'claude-sonnet-5-5', userName: 'A', fetchFn });
  await runAgent({ store: s, name: 'analyst', task: 'Lage?', apiKey: 'k', model: 'claude-sonnet-5-5', fetchFn });
  const u = usageSummary(s);
  assert.equal(u.today.calls, 2); assert.equal(u.today.searches, 2);
  near(u.today.cost, 2 * (0.016 + 0.002 + 0.01));
  assert.deepEqual(u.kinds.map((k) => k.name).sort(), ['Agent analyst', 'Gespräch']);
  const { server } = createServer({ store: s, apiKey: 'k', fetchFn, voice: null, mail: null });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const st = await (await fetch('http://127.0.0.1:' + server.address().port + '/api/state')).json();
  assert.equal(st.usage.today.calls, 2); near(st.usage.today.cost, u.today.cost);
  server.close();
});
