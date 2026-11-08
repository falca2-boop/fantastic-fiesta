/**
 * Spezial-Agenten für Jarvis: eigene Rolle, eigene (nur lesende) Werkzeuge, ein abgeschlossener Auftrag, ein Ergebnis.
 * Jarvis beauftragt sie mit ask_agent. Neue Agenten legt der Nutzer per Sprache an (create_agent).
 * Sicherheit: Agenten dürfen nur lesen/recherchieren, nichts speichern, senden oder öffnen und keine anderen Agenten rufen.
 */
import { toolDefinitions, runTool } from './tools.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

/** Werkzeuge, die ein Agent bekommen darf (alle nur lesend). */
export const AGENT_TOOLS = ['web_search', 'world_news', 'search_vault', 'read_vault_note', 'list_tasks', 'list_notes', 'find_businesses'];

export const BUILTIN_AGENTS = {
  recherche: { role: 'Du recherchierst gründlich im Web: mehrere Suchen, Quellen vergleichen, Widersprüche nennen, Datum der Quellen beachten. Liefere Kernergebnis, 3 Belege mit Quelle und was unsicher bleibt.', tools: ['web_search'] },
  nachrichten: { role: 'Du bist Nachrichten-Analyst. Hole Schlagzeilen (world_news), ergänze bei Bedarf per Websuche, ordne ein: Was ist passiert, warum wichtig, was kommt als Nächstes. Trenne Fakten von Einschätzungen.', tools: ['world_news', 'web_search'] },
  analyst: { role: 'Du bist Strategie-Analyst und denkst zugleich als Systemarchitekt, kritischer Denker, kreativer Innovator und Mentor: Optionen, Risiken, eine ungewöhnliche Idee, klare Empfehlung mit konkreten nächsten Schritten.', tools: [] },
  notizen: { role: 'Du bist Wissensassistent für die Obsidian-Notizen des Nutzers: suche, lies, fasse zusammen und nenne verwandte Notizen über Links und Rückverweise.', tools: ['search_vault', 'read_vault_note', 'list_notes'] },
  firmensucher: { role: 'Du bist Firmen-Scout. Du findest lokale Betriebe, die KEINE Webseite haben oder deren Webseite KEINEN Chat-/KI-Assistenten hat. Nutze find_businesses (mode ohne_webseite oder ohne_chatbot) für die genannte Stadt und Branche; frage nicht nach, nimm bei fehlender Angabe die naheliegende Annahme und sage sie. Prüfe vielversprechende Treffer zusätzlich per Websuche (gibt es doch eine Webseite oder Facebook-Seite?). Liefere eine nach Chancen sortierte Liste: Name, Adresse, Telefon/Mail, warum sie ein Fall ist und ein Satz, was man ihnen anbieten könnte (z. B. einfache Webseite, Terminbuchung, Chat-Assistent). Standardmäßig lieferst du 3 bis 5 Treffer (limit 5), mehr nur auf ausdrücklichen Wunsch. Du kontaktierst niemanden. Weise darauf hin, dass Daten unvollständig sein können.', tools: ['find_businesses', 'web_search'] },
  briefschreiber: { role: 'Du bist Brief-Texter für Akquise an lokale Betriebe (Auftraggeber: der Nutzer, ein Webdesign- und KI-Assistenten-Anbieter). Du bekommst Betriebe (meist aus dem Firmensucher) und schreibst pro Betrieb einen kurzen, höflichen, persönlichen Brief (höchstens 110 Wörter) mit: persönliche Anrede mit Firmenname, ein ehrlicher konkreter Anlass (z. B. „ich habe gesehen, dass Sie noch keine eigene Webseite haben“, nur wenn der Auftrag das sagt, nie erfundene Details), ein konkretes Angebot, ein unverbindlicher nächster Schritt (Rückruf oder Termin), Platzhalter [Absender] für Name und Kontakt. Keine Übertreibungen, keine falschen Behauptungen, keine Druck-Formulierungen, kein „Sie verlieren Kunden“. Du entwirfst nur Texte, du sendest nichts. Schreibe standardmäßig für höchstens 5 Betriebe. Wenn Branche oder Angebot unklar sind, wähle die naheliegende Annahme und nenne sie in einer Zeile.', tools: ['web_search'] },
  morgenbriefing: { role: 'Du bist Morgen-Briefing-Redakteur. Hole mit world_news die aktuellen Schlagzeilen und ergänze bei Bedarf per Websuche. Liefere ein Briefing: 1) die 3 wichtigsten Meldungen der Welt, 2) Europa, 3) Wirtschaft/Technik, 4) ein Satz „Was heute zu beobachten ist“. Jede Meldung in 1-2 Sätzen, mit Quelle. Trenne Fakten von Einschätzungen und nenne, wenn Quellen sich widersprechen. Wenn der Nutzer Themen genannt hat, gewichte sie höher.', tools: ['world_news', 'web_search'] },
  marktbeobachter: { role: 'Du bist Markt- und Konkurrenzbeobachter. Du bekommst Themen (Preise, Aktien, Konkurrenten, Produkte) und recherchierst den aktuellen Stand per Websuche mit Datum der Quelle. Gibt es in den Notizen des Nutzers einen früheren Stand (search_vault nach „Markt“ und dem Thema), vergleiche und nenne, was sich geändert hat (neu, teurer, billiger, weggefallen). Ohne früheren Stand lieferst du den Ausgangswert und empfiehlst, ihn als Notiz zu speichern. Keine Anlageberatung, keine Kauf-/Verkaufsempfehlung; nenne Unsicherheit offen.', tools: ['web_search', 'search_vault', 'read_vault_note'] },
  planer: { role: 'Du bist Tagesplaner. Schau auf die offenen Aufgaben und Notizen, schlage eine realistische Reihenfolge mit Zeitfenstern vor und nenne, was verschoben werden kann.', tools: ['list_tasks', 'list_notes'] },
};

const key = (n) => String(n || '').trim().toLowerCase();

export function listAgents(store) {
  const custom = (store.data.agents || []).map((a) => ({ name: a.name, role: a.role, tools: a.tools, builtin: false }));
  return [...Object.entries(BUILTIN_AGENTS).map(([name, a]) => ({ name, role: a.role, tools: a.tools, builtin: true })), ...custom];
}

export function findAgent(store, name) {
  const k = key(name);
  return listAgents(store).find((a) => key(a.name) === k) || null;
}

/** Legt einen eigenen Agenten an. Gibt eine Meldung für Jarvis zurück (Fehler als Text, nicht als Ausnahme). */
export function createAgent(store, { name, role, tools = [] }) {
  const n = String(name || '').trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{1,29}$/u.test(n)) return 'Ungültiger Name. 2 bis 30 Zeichen: Buchstaben, Zahlen, Leerzeichen, - und _.';
  if (findAgent(store, n)) return 'Einen Agenten namens „' + n + '“ gibt es schon.';
  const r = String(role || '').trim();
  if (r.length < 15) return 'Die Rollenbeschreibung ist zu kurz. Beschreibe, was der Agent tun soll und wie er antworten soll.';
  if (r.length > 800) return 'Die Rollenbeschreibung ist zu lang (höchstens 800 Zeichen).';
  const bad = (Array.isArray(tools) ? tools : []).filter((t) => !AGENT_TOOLS.includes(t));
  if (bad.length) return 'Diese Werkzeuge darf ein Agent nicht haben: ' + bad.join(', ') + '. Erlaubt: ' + AGENT_TOOLS.join(', ') + '.';
  if ((store.data.agents || []).length >= 8) return 'Es gibt schon 8 eigene Agenten. Lösche zuerst einen.';
  (store.data.agents = store.data.agents || []).push({ name: n, role: r, tools: [...new Set(tools)] });
  store.save();
  return 'Agent „' + n + '“ ist angelegt. Du kannst ihn jetzt beauftragen.';
}

export function deleteAgent(store, name) {
  const a = findAgent(store, name);
  if (!a) return 'Diesen Agenten gibt es nicht.';
  if (a.builtin) return 'Die eingebauten Agenten lassen sich nicht löschen.';
  store.data.agents = store.data.agents.filter((x) => key(x.name) !== key(name));
  store.save();
  return 'Agent „' + a.name + '“ ist gelöscht.';
}

/**
 * Führt einen Auftrag mit dem Agenten aus (eigene Konversation, höchstens 6 Runden) und gibt dessen Ergebnistext zurück.
 */
export async function runAgent({ store, name, task, apiKey, model, fetchFn = fetch, baseUrl = '', now = Date.now() }) {
  const agent = findAgent(store, name);
  if (!agent) throw new Error('Unbekannter Agent: ' + name + '. Vorhanden: ' + listAgents(store).map((a) => a.name).join(', '));
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY fehlt.');
  const all = toolDefinitions({ webhookEnabled: false, mailEnabled: false, obsidianEnabled: !!store.vaultDir });
  const tools = all.filter((t) => agent.tools.includes(t.name) && AGENT_TOOLS.includes(t.name));
  const system = `Du bist der Spezial-Agent „${agent.name}“ von JARVIS. ${agent.role}\n`
    + 'Du bekommst genau einen Auftrag und lieferst ein Ergebnis für Jarvis, der es dem Nutzer vorträgt. Antworte auf Deutsch, konkret und knapp (höchstens 150 Wörter), ohne Markdown. '
    + 'Nutze nur deine Werkzeuge und erfinde nichts: Was du nicht weißt oder nicht findest, sagst du. Du führst keine Aktionen aus, die etwas verändern.';
  const messages = [{ role: 'user', content: String(task || '').slice(0, 2000) }];
  let data;
  for (let i = 0; i < 6; i++) {
    const res = await fetchFn(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1500, system, ...(tools.length ? { tools } : {}), messages }),
    });
    if (!res.ok) throw new Error('Anthropic API Fehler ' + res.status);
    data = await res.json();
    if (data.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: data.content });
      const results = [];
      for (const b of data.content) {
        if (b.type !== 'tool_use') continue;
        let out;
        if (!agent.tools.includes(b.name)) out = 'Dieses Werkzeug darf dieser Agent nicht benutzen.';
        else { try { out = await runTool(store, b.name, b.input || {}, { fetchFn, baseUrl, now }); } catch (e) { out = 'Fehler: ' + e.message; } }
        results.push({ type: 'tool_result', tool_use_id: b.id, content: String(out) });
      }
      messages.push({ role: 'user', content: results });
    } else if (data.stop_reason === 'pause_turn') messages.push({ role: 'assistant', content: data.content });
    else break;
  }
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim() || 'Der Agent hat kein Ergebnis geliefert.';
}
