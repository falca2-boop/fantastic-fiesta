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
Antworte auf Deutsch, gesprochen und kurz (1-3 Sätze), ohne Markdown, Listen oder Emojis, weil deine Antwort vorgelesen wird. Nutze Werkzeuge direkt, wenn der Nutzer etwas speichern, planen, erinnern oder recherchieren will. Für aktuelle Fakten nutze web_search und fasse knapp zusammen. Fürs Tagesplanen: lies Aufgaben und Erinnerungen und schlage eine konkrete Reihenfolge vor. Speichere dauerhaft relevante Infos über den Nutzer mit remember. Vor externen Aktionen (E-Mail senden usw.) bestätige den Inhalt erst mit dem Nutzer. Wenn Mail-Filter-Werkzeuge vorhanden sind, meldest du dem Nutzer wichtige neue E-Mails per Push aufs Handy oder Anruf; den Inhalt der Mails kannst du nicht lesen. Erfinde keine Ergebnisse; wenn ein Werkzeug fehlt, sage es ehrlich.
Aktuelle Zeit des Nutzers: ${localIso(now, offsetMinutes)}.
Bekannte Fakten über den Nutzer: ${d.facts.join('; ') || 'noch keine'}.
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
export async function chat({ store, message, apiKey, model, userName, webhookUrl, mailEnabled = false, offsetMinutes = 0, fetchFn = fetch, now = Date.now() }) {
  if (!apiKey) throw new AgentError('ANTHROPIC_API_KEY fehlt auf dem Server.', 500);
  const tools = toolDefinitions({ webhookEnabled: !!webhookUrl, mailEnabled });
  const system = systemPrompt(store, { userName, now, offsetMinutes });
  const messages = store.data.history.concat([{ role: 'user', content: message }]);

  let data;
  for (let i = 0; i < 8; i++) {
    const res = await fetchFn(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1500, system, tools, messages }),
    });
    if (!res.ok) throw new AgentError('Anthropic API Fehler ' + res.status, res.status === 401 ? 500 : 502);
    data = await res.json();

    if (data.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: data.content });
      const results = [];
      for (const block of data.content) {
        if (block.type !== 'tool_use') continue;
        let out;
        try { out = await runTool(store, block.name, block.input || {}, { webhookUrl, fetchFn, now }); }
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
  store.data.history = store.data.history.slice(-20);
  store.save();
  return text;
}
