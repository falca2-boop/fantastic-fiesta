/**
 * Verbrauch und geschätzte Kosten: zählt Token und Websuchen aus den echten Antworten der Anthropic-API, pro Tag und Verwendung
 * (Gespräch, Agenten). Preise in US-Dollar pro Million Token laut Anthropic-Preisliste; unbekannte Modelle bleiben ohne Kostenangabe.
 * Optionales Tageslimit: JARVIS_DAILY_LIMIT_USD (leer = kein Limit).
 */

// in = Eingabe, out = Ausgabe, cr = Cache-Treffer, cw = Cache schreiben (5 Min.)  – $ pro Million Token
export const PRICES = {
  'claude-sonnet-5-5': { in: 2, out: 10, cr: 0.2, cw: 2.5 },
  'claude-sonnet-5': { in: 2, out: 10, cr: 0.2, cw: 2.5 },
  'claude-opus-5-5': { in: 4, out: 20, cr: 0.2, cw: 5 },
  'claude-opus-5': { in: 5, out: 25, cr: 0.5, cw: 6.25 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cr: 0.01, cw: 0.125 },
  'claude-fable-5-1': { in: 10, out: 50, cr: 0.25, cw: 12.5 },
};
export const SEARCH_USD = 0.01;     // 10 $ pro 1.000 Websuchen

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function costOf(model, t) {
  const p = PRICES[model];
  if (!p) return null;
  return ((t.input || 0) * p.in + (t.output || 0) * p.out + (t.cacheRead || 0) * p.cr + (t.cacheWrite || 0) * p.cw) / 1e6 + (t.searches || 0) * SEARCH_USD;
}

const blank = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0, calls: 0, cost: 0, unpriced: 0 });

/** Verbucht eine API-Antwort (data.usage) unter der Verwendung `kind` ("chat", "agent:recherche" …). */
export function recordUsage(store, { model, usage, kind = 'chat', now = new Date() }) {
  if (!usage) return;
  const t = {
    input: usage.input_tokens || 0, output: usage.output_tokens || 0,
    cacheRead: usage.cache_read_input_tokens || 0, cacheWrite: usage.cache_creation_input_tokens || 0,
    searches: (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0,
  };
  const all = store.data.usage = store.data.usage || {};
  const day = all[dayKey(now)] = all[dayKey(now)] || { total: blank(), kinds: {} };
  const c = costOf(model, t);
  for (const bucket of [day.total, (day.kinds[kind] = day.kinds[kind] || blank())]) {
    bucket.input += t.input; bucket.output += t.output; bucket.cacheRead += t.cacheRead; bucket.cacheWrite += t.cacheWrite; bucket.searches += t.searches; bucket.calls += 1;
    if (c == null) bucket.unpriced += 1; else bucket.cost += c;
  }
  for (const k of Object.keys(all).sort().slice(0, -40)) delete all[k];     // nur die letzten 40 Tage behalten
  store.save();
}

const tokens = (b) => b.input + b.output + b.cacheRead + b.cacheWrite;

/** Zusammenfassung für die Oberfläche. */
export function usageSummary(store, now = new Date(), env = process.env) {
  const all = store.data.usage || {};
  const today = all[dayKey(now)] || { total: blank(), kinds: {} };
  const prefix = dayKey(now).slice(0, 7);
  const month = blank();
  for (const [k, d] of Object.entries(all)) if (k.startsWith(prefix)) { month.cost += d.total.cost; month.calls += d.total.calls; month.unpriced += d.total.unpriced; }
  const limit = Number(env.JARVIS_DAILY_LIMIT_USD) || 0;
  return {
    today: { tokens: tokens(today.total), cost: today.total.cost, calls: today.total.calls, searches: today.total.searches, unpriced: today.total.unpriced },
    month: { cost: month.cost, calls: month.calls, unpriced: month.unpriced },
    kinds: Object.entries(today.kinds).map(([name, b]) => ({ name, cost: b.cost, calls: b.calls })).sort((a, b) => b.cost - a.cost).slice(0, 4),
    limit, limitReached: !!limit && today.total.cost >= limit,
  };
}

/** Wirft, wenn das Tageslimit erreicht ist (nur wenn JARVIS_DAILY_LIMIT_USD gesetzt ist). */
export function checkLimit(store, now = new Date(), env = process.env) {
  const s = usageSummary(store, now, env);
  if (s.limitReached) { const e = new Error('Das Tageslimit von ' + s.limit.toFixed(2) + ' $ ist erreicht (JARVIS_DAILY_LIMIT_USD). Morgen geht es weiter, oder erhöhe das Limit in der .env.'); e.status = 429; throw e; }
}
