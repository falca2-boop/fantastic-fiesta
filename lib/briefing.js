/**
 * Automatisches Morgenbriefing: zur eingestellten Uhrzeit (Zeit des Geräts, auf dem Jarvis läuft) beauftragt Jarvis den Agenten
 * "morgenbriefing", speichert das Ergebnis (und als Obsidian-Notiz) und liefert es der offenen Seite beim nächsten Abruf.
 * Jarvis muss dafür laufen. Wird er später gestartet, holt er das Briefing bis zu 3 Stunden nach der Zeit nach.
 */
import { runAgent } from './agents.js';
import { addNote } from './vault.js';

export const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const CATCH_UP_MS = 3 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Aktive Einstellung: Sprachbefehl (store) vor .env. time '' = aus. */
export function briefingConfig(store, env = process.env) {
  const c = store.data.briefingConfig;
  if (c && typeof c.time === 'string') return { time: c.time, topics: c.topics || '' };
  const t = (env.MORNING_BRIEFING_TIME || '').trim();
  return { time: TIME_RE.test(t) ? t.padStart(5, '0') : '', topics: (env.MORNING_BRIEFING_TOPICS || '').trim() };
}

/** Ist jetzt ein Briefing fällig? (Zeit erreicht, heute noch nicht erstellt, höchstens 3 Stunden zu spät) */
export function briefingDue({ config, lastDate, now = new Date() }) {
  const m = TIME_RE.exec(config && config.time || '');
  if (!m) return false;
  if (lastDate === dateKey(now)) return false;
  const at = new Date(now); at.setHours(Number(m[1]), Number(m[2]), 0, 0);
  const late = now.getTime() - at.getTime();
  return late >= 0 && late <= CATCH_UP_MS;
}

export async function runBriefing({ store, apiKey, model, fetchFn = fetch, baseUrl = '', topics = '', now = new Date() }) {
  const task = 'Erstelle mein Morgenbriefing für heute, ' + now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }) + '.'
    + (topics ? ' Meine Schwerpunkte: ' + topics + '.' : '');
  const text = await runAgent({ store, name: 'morgenbriefing', task, apiKey, model, fetchFn, baseUrl, now: now.getTime() });
  store.data.briefing = { date: dateKey(now), ts: now.toISOString(), text, delivered: false };
  store.save();
  if (store.vaultDir) { try { addNote(store.vaultDir, 'Morgenbriefing ' + dateKey(now) + '\n\n' + text, now.getTime()); } catch (e) { /* Notiz ist nur ein Extra */ } }
  return text;
}

/** Gibt ein noch nicht ausgeliefertes Briefing einmal zurück. */
export function takeBriefing(store) {
  const b = store.data.briefing;
  if (!b || b.delivered) return null;
  b.delivered = true; store.save();
  return { date: b.date, text: b.text };
}

export function startBriefingScheduler({ store, getRun, log = console, intervalMs = 30000, clock = () => new Date() }) {
  let running = false;
  const tick = async () => {
    if (running) return;
    const config = briefingConfig(store);
    const now = clock();
    if (!briefingDue({ config, lastDate: store.data.briefing && store.data.briefing.date, now })) return;
    running = true;
    try { await getRun()({ topics: config.topics, now }); log.log('Morgenbriefing erstellt (' + dateKey(now) + ').'); }
    catch (err) {
      log.warn('Morgenbriefing fehlgeschlagen:', err.message);
      // heute nicht endlos wiederholen: als versucht markieren, Fehler steht im Briefing
      store.data.briefing = { date: dateKey(now), ts: now.toISOString(), text: 'Das Morgenbriefing konnte nicht erstellt werden: ' + err.message, delivered: false }; store.save();
    } finally { running = false; }
  };
  tick();
  const timer = setInterval(tick, intervalMs); timer.unref?.();
  return () => clearInterval(timer);
}
