/** Hintergrundaufträge: JARVIS recherchiert im Web, während du etwas anderes tust, und meldet sich mit dem Ergebnis. */
import { randomBytes } from 'node:crypto';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_RUNNING = 2;
const MAX_JOBS = 12;   // Produkte können groß sein; der Speicher soll unter dem 1-MB-Limit von Upstash bleiben
const DEADLINE_MS = 5 * 60 * 1000;

const uid = () => randomBytes(3).toString('hex');
export const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

/** Beim Start: Aufträge, die ein Neustart unterbrochen hat, als fehlgeschlagen markieren. */
export function recoverJobs(store) {
  let changed = false;
  for (const j of store.data.jobs) {
    if (j.status === 'running') { j.status = 'failed'; j.result = 'Der Server wurde währenddessen neu gestartet. Bitte den Auftrag noch einmal erteilen.'; j.finishedAt = new Date().toISOString(); changed = true; }
  }
  if (changed) store.save();
}

export function runningCount(store) { return store.data.jobs.filter(j => j.status === 'running').length; }

function researchSystem(now) {
  return `Du bist ein gründlicher Recherche-Assistent. Recherchiere den Auftrag mit web_search (mehrere gezielte Suchen, Quellen vergleichen) und antworte auf Deutsch mit einer klaren Zusammenfassung von höchstens 250 Wörtern: zuerst das Ergebnis in 2 bis 3 Sätzen, danach die wichtigsten Punkte als kurze Zeilen, am Ende die genutzten Quellen als URLs. Nenne nur, was du in den Quellen gefunden hast, und sage ehrlich, was unklar oder nicht auffindbar ist. Heutiges Datum: ${new Date(now).toISOString().slice(0, 10)}.`;
}

/** Ein Claude-Aufruf mit Websuche; setzt `pause_turn` fort. Gemeinsam für Recherchen und Produkte. */
export async function callWithSearch({ system, user, apiKey, model, fetchFn = fetch, now = Date.now, maxTokens = 2000, maxUses = 8 }) {
  const messages = [{ role: 'user', content: user }];
  const deadline = now() + DEADLINE_MS;
  let data;
  for (let i = 0; i < 6; i++) {
    if (now() > deadline) throw new Error('Zeitlimit erreicht');
    const res = await fetchFn(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }], messages }),
    });
    if (!res.ok) throw new Error('Anthropic API Fehler ' + res.status);
    data = await res.json();
    if (data.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: data.content }); continue; }
    break;
  }
  const text = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) throw new Error('Keine Antwort erhalten');
  return text;
}

export function runResearch({ request, apiKey, model, fetchFn, now = Date.now }) {
  return callWithSearch({ system: researchSystem(now()), user: request, apiKey, model, fetchFn, now });
}

/**
 * Legt einen Auftrag an und startet ihn im Hintergrund. Gibt sofort zurück.
 * `run` liefert den Ergebnistext. `done` löst nach Abschluss auf (nützlich für Tests).
 */
export function startJob({ store, kind = 'research', title, request, run, notify = async () => {}, now = Date.now, maxResult = 20000 }) {
  if (runningCount(store) >= MAX_RUNNING) return { error: `Es laufen schon ${MAX_RUNNING} Aufträge. Bitte warte, bis einer fertig ist.` };
  const job = { id: uid(), kind, title: clip(title, 70), request: clip(request, 1000), status: 'running', result: '', createdAt: new Date(now()).toISOString(), finishedAt: null, seen: false };
  store.data.jobs.push(job);
  store.data.jobs = store.data.jobs.slice(-MAX_JOBS);
  store.save();

  const done = (async () => {
    try {
      job.result = String(await run()).slice(0, maxResult);
      job.status = 'done';
      if (kind === 'research') store.data.notes.push({ id: uid(), text: `Recherche „${job.title}“: ${clip(job.result, 1500)}`, ts: new Date(now()).toISOString() });
    } catch (err) {
      job.status = 'failed';
      job.result = 'Fehlgeschlagen: ' + err.message;
    }
    job.finishedAt = new Date(now()).toISOString();
    store.save();
    try { await notify(job); } catch (e) { /* Push ist optional; das Ergebnis liegt trotzdem im Speicher */ }
  })();
  return { job, done };
}

export function startResearch({ store, request, apiKey, model, fetchFn = fetch, notify, now = Date.now }) {
  const text = String(request || '').trim();
  if (!text) return { error: 'Der Auftrag ist leer.' };
  return startJob({ store, kind: 'research', title: text, request: text, notify, now, run: () => runResearch({ request: clip(text, 1000), apiKey, model, fetchFn, now }) });
}

/** Fertige, noch nicht gemeldete Aufträge: werden einmal geliefert. */
export function takeFinishedJobs(store) {
  const fin = store.data.jobs.filter(j => j.status !== 'running' && !j.seen);
  if (fin.length) { fin.forEach(j => { j.seen = true; }); store.save(); }
  return fin;
}
