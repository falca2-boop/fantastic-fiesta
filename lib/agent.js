import { toolDefinitions, runTool } from './tools.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

/** Aktuelle Zeit als ISO mit Offset, z. B. 2026-10-09T10:22+02:00 (offsetMinutes wie Date#getTimezoneOffset). */
export function localIso(now, offsetMinutes = 0) {
  const shifted = new Date(now - offsetMinutes * 60000).toISOString().slice(0, 16);
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${shifted}${sign}${hh}:${mm}`;
}

export function systemPrompt(store, { userName, now, offsetMinutes }) {
  const d = store.data;
  const open = d.tasks.filter(t => !t.done).map(t => `${t.id}: ${t.text}${t.due ? ' (' + t.due + ')' : ''}`).join('; ') || 'keine';
  return `Du bist JARVIS, der persönliche KI-Assistent von ${userName} (so heißt der Nutzer; sprich ihn am Anfang deiner Antwort oder bei Bestätigungen mit seinem Namen an, aber nicht in jedem Satz) im Stil von Iron Man: souverän, trocken-höflich, effizient. Du arbeitest FÜR den Nutzer und erledigst Dinge aktiv mit deinen Werkzeugen, statt nur Ratschläge zu geben.
Antworte auf Deutsch, gesprochen und kurz (1-3 Sätze), ohne Markdown, Listen oder Emojis, weil deine Antwort vorgelesen wird. Nutze Werkzeuge direkt, wenn der Nutzer etwas speichern, planen, erinnern oder recherchieren will. Für aktuelle Fakten nutze web_search und fasse knapp zusammen. Fürs Tagesplanen: lies Aufgaben und Erinnerungen und schlage eine konkrete Reihenfolge vor. Dein Gedächtnis: Speichere dauerhaft relevante Infos über den Nutzer (Name, Familie, Arbeit, Vorlieben, Gewohnheiten, Entscheidungen, Pläne) von dir aus mit remember, ohne zu fragen, jeweils als kurzen eigenständigen Satz. Prüfe vorher die bekannten Fakten, damit nichts doppelt gespeichert wird, und ersetze Veraltetes mit forget und remember. Nutze Fakten und Zusammenfassung natürlich im Gespräch. Fragt der Nutzer, was du über ihn weißt, nenne die Fakten. Hintergrundaufträge: Dauert eine Recherche länger oder soll sie gründlicher sein (Vergleiche, Angebote, Hintergründe), starte sie mit start_research und sag kurz, dass du dich meldest; du kannst währenddessen weiter mit dem Nutzer sprechen. Fertige Ergebnisse trägst du mit get_job vor. Gespeicherte Seiten: ${d.links.map(l => l.name).join(', ') || 'keine'}. Will der Nutzer eine davon öffnen oder dort suchen („öffne Amazon“, „such bei Amazon nach Kaffeemaschinen“), nutze open_link (mit query für die Suche) und sag kurz, dass der Öffnen-Button bereitsteht; neue Seiten speicherst du mit add_link. Fragt der Nutzer, ob alles eingerichtet ist oder was noch fehlt, nutze system_status und erkläre knapp, was zu tun ist (nenne Variablennamen, nie Werte). Vor externen Aktionen (E-Mail senden usw.) bestätige den Inhalt erst mit dem Nutzer. Wenn Mail-Filter-Werkzeuge vorhanden sind, meldest du dem Nutzer wichtige neue E-Mails per Push aufs Handy oder Anruf; den Inhalt der Mails kannst du nicht lesen. Erfinde keine Ergebnisse; wenn ein Werkzeug fehlt, sage es ehrlich.
Aktuelle Zeit des Nutzers: ${localIso(now, offsetMinutes)}.
Bekannte Fakten über den Nutzer: ${d.facts.slice(-100).join('; ') || 'noch keine'}.
Zusammenfassung früherer Gespräche: ${d.summary || 'noch keine'}.
Offene Aufgaben: ${open}.
Aktuelles Ziel: ${d.goal ? d.goal.text : 'keins'}.`;
}

export class AgentError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/**
 * Ein Gesprächsschritt: schickt die Nachricht an Claude, führt Werkzeuge aus, speichert den Verlauf.
 * Gibt den gesprochenen Antworttext zurück.
 */
export async function chat({ store, message, apiKey, model, userName, webhookUrl, mailEnabled = false, startResearch, actions, systemStatus, offsetMinutes = 0, fetchFn = fetch, now = Date.now() }) {
  if (!apiKey) throw new AgentError('ANTHROPIC_API_KEY fehlt auf dem Server.', 500);
  const tools = toolDefinitions({ webhookEnabled: !!webhookUrl, mailEnabled, researchEnabled: !!startResearch });
  const system = systemPrompt(store, { userName, now, offsetMinutes });
  const messages = store.data.history.concat([{ role: 'user', content: message }]);

  let data;
  for (let i = 0; i < 8; i++) {
    const res = await fetchFn(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 800, system, tools, messages }),
    });
    if (!res.ok) throw new AgentError('Anthropic API Fehler ' + res.status, res.status === 401 ? 500 : 502);
    data = await res.json();

    if (data.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: data.content });
      const results = [];
      for (const block of data.content) {
        if (block.type !== 'tool_use') continue;
        let out;
        try { out = await runTool(store, block.name, block.input || {}, { webhookUrl, fetchFn, now, startResearch, actions, systemStatus }); }
        catch (e) { out = 'Fehler: ' + e.message; }
        results.push({ type: 'tool_result', tool_use_id: block.id, content: String(out) });
      }
      messages.push({ role: 'user', content: results });
    } else if (data.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: data.content });
    } else break;
  }

  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim() || 'Erledigt.';
  store.data.history.push({ role: 'user', content: message }, { role: 'assistant', content: text });
  store.data.history = store.data.history.slice(-40);
  store.save();
  // Zusammenfassen läuft im Hintergrund, die Antwort wartet nicht darauf
  summarizeOld({ store, apiKey, model, fetchFn }).catch(() => {});
  return text;
}

const KEEP_MESSAGES = 10;
const SUMMARIZE_ABOVE = 24;

/** Ältere Gesprächsteile zu einer kurzen Zusammenfassung verdichten, damit das Gedächtnis nicht abreißt und die Anfragen klein bleiben. */
export async function summarizeOld({ store, apiKey, model, fetchFn = fetch }) {
  const d = store.data;
  if (store.summarizing || d.history.length <= SUMMARIZE_ABOVE) return false;
  store.summarizing = true;
  try {
    const n = d.history.length - KEEP_MESSAGES;     // immer gerade, damit der Verlauf wieder mit dem Nutzer beginnt
    const old = d.history.slice(0, n);
    const transcript = old.map(m => `${m.role === 'user' ? 'Nutzer' : 'JARVIS'}: ${m.content}`).join('\n');
    const prompt = `Aktualisiere die Zusammenfassung des Langzeitgedächtnisses eines Assistenten. Schreibe höchstens 150 Wörter auf Deutsch. Behalte nur Dauerhaftes: Vorhaben, Entscheidungen, offene Themen, wichtige Ereignisse. Keine Floskeln, keine Anrede.\n\nBisherige Zusammenfassung: ${d.summary || 'keine'}\n\nNeue Gesprächsteile:\n${transcript}`;
    const res = await fetchFn(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
    if (!text) return false;
    d.summary = text.slice(0, 1500);
    d.history = d.history.slice(n);                 // nur die zusammengefassten vorderen Nachrichten entfernen
    store.save();
    return true;
  } finally { store.summarizing = false; }
}
