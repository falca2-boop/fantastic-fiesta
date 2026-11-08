import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { TIME_RE } from './briefing.js';
import { forgetLearned } from './learning.js';
import { findBusinesses, leadsText } from './leads.js';
import { loadNews, headlinesText } from './world.js';
import { findAgent, listAgents, createAgent, deleteAgent, AGENT_TOOLS } from './agents.js';
import { addNote, listNotes, deleteVaultNote, writeFacts, searchVault, readVaultNote } from './vault.js';

const uid = () => randomBytes(3).toString('hex');

export function toolDefinitions({ webhookEnabled, mailEnabled, obsidianEnabled = false }) {
  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: 4 },
    { name: 'add_task', description: 'Fügt eine Aufgabe zur To-do-Liste hinzu.',
      input_schema: { type: 'object', properties: { text: { type: 'string' }, due: { type: 'string', description: 'Optional: Fälligkeit, z. B. "morgen" oder 2026-10-12' } }, required: ['text'] } },
    { name: 'list_tasks', description: 'Listet alle Aufgaben mit IDs und Status.', input_schema: { type: 'object', properties: {} } },
    { name: 'complete_task', description: 'Markiert eine Aufgabe als erledigt.',
      input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'add_note', description: 'Speichert eine Notiz.', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    { name: 'list_notes', description: 'Listet alle gespeicherten Notizen.', input_schema: { type: 'object', properties: {} } },
    { name: 'set_reminder', description: 'Setzt eine Erinnerung, die JARVIS zur Zeit ausspricht (einmalig oder mit repeat täglich, werktags, wöchentlich; bei Wiederholung genau EINE Erinnerung anlegen). "at" ist ISO 8601 MIT Zeitzonen-Offset im Format der aktuellen Zeit aus dem Systemkontext, z. B. 2026-10-09T15:00+02:00.',
      input_schema: { type: 'object', properties: { text: { type: 'string' }, at: { type: 'string' }, repeat: { type: 'string', enum: ['taeglich', 'werktags', 'woechentlich'], description: 'optional: wiederholt die Erinnerung (statt mehrere einzelne anzulegen)' } }, required: ['text', 'at'] } },
    { name: 'remember', description: 'Merkt dauerhaft einen Fakt über den Nutzer (Vorlieben, Namen, Routinen).',
      input_schema: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] } },
    { name: 'forget', description: 'Vergisst gespeicherte Fakten, die den Suchtext enthalten.',
      input_schema: { type: 'object', properties: { contains: { type: 'string' } }, required: ['contains'] } },
    { name: 'set_goal', description: 'Setzt das aktuelle Hauptziel des Nutzers mit Plan.',
      input_schema: { type: 'object', properties: { text: { type: 'string' }, schritte: { type: 'array', items: { type: 'string' } }, realisierbarkeit: { type: 'number', description: '0-100' } }, required: ['text'] } },
  ];
  tools.push({ name: 'list_agents', description: 'Zeigt alle Spezial-Agenten (eingebaute und selbst erstellte) mit Rolle und Werkzeugen.', input_schema: { type: 'object', properties: {} } });
  tools.push({ name: 'ask_agent', description: 'Beauftragt einen Spezial-Agenten (recherche, nachrichten, analyst, notizen, planer oder ein selbst erstellter) mit einer in sich abgeschlossenen Aufgabe. Gib die Aufgabe vollständig an, der Agent kennt das Gespräch nicht. Das Ergebnis trägst du dem Nutzer kurz vor.',
    input_schema: { type: 'object', properties: { agent: { type: 'string' }, task: { type: 'string', description: 'Vollständiger Auftrag mit allem nötigen Kontext' } }, required: ['agent', 'task'] } });
  tools.push({ name: 'create_agent', description: 'Legt einen neuen eigenen Spezial-Agenten an, wenn der Nutzer das wünscht. Der Agent bekommt nur lesende Werkzeuge. Rolle: konkret beschreiben, was er tut und wie er antwortet.',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' }, tools: { type: 'array', items: { type: 'string', enum: AGENT_TOOLS } } }, required: ['name', 'role'] } });
  tools.push({ name: 'delete_agent', description: 'Löscht einen selbst erstellten Agenten.', input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } });
  tools.push({ name: 'find_businesses', description: 'Findet lokale Betriebe in einer Stadt: mode "ohne_webseite" = Betriebe ohne eingetragene Webseite (OpenStreetMap), mode "ohne_chatbot" = Betriebe mit Webseite, auf der kein Chat-/KI-Assistent erkannt wird. Branche z. B. friseur, restaurant, zahnarzt, bäckerei, elektriker, hotel (oder shop=hairdresser). Nur lesen, es wird niemand kontaktiert.',
    input_schema: { type: 'object', properties: { city: { type: 'string', description: 'Stadt oder Region, z. B. Graz' }, category: { type: 'string' }, mode: { type: 'string', enum: ['ohne_webseite', 'ohne_chatbot'] }, limit: { type: 'number', description: 'Standard 5 (der Nutzer will 3 bis 5 Treffer), höchstens 40' } }, required: ['city', 'category'] } });
  tools.push({ name: 'set_briefing', description: 'Stellt das automatische Morgenbriefing ein: jeden Tag zur Uhrzeit (24-Stunden, z. B. 07:30) erstellt Jarvis die Nachrichtenübersicht und sagt sie an, sobald die Seite offen ist. time "aus" schaltet es ab. Optional topics (Schwerpunkte).',
    input_schema: { type: 'object', properties: { time: { type: 'string', description: 'HH:MM oder "aus"' }, topics: { type: 'string' } }, required: ['time'] } });
  tools.push({ name: 'list_reminders', description: 'Zeigt alle offenen Erinnerungen (mit ID und Wiederholung) und die zuletzt ausgesprochenen.', input_schema: { type: 'object', properties: {} } });
  tools.push({ name: 'cancel_reminder', description: 'Löscht eine Erinnerung (offene, auch wiederholende) per ID oder Textteil. Vorher mit list_reminders nachsehen.', input_schema: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } } } });
  tools.push({ name: 'search_notes', description: 'Sucht in den gespeicherten Notizen des Nutzers (Jarvis-Notizen, mit Obsidian auch dort) nach einem Stichwort. Nutze es, bevor du sagst, du wüsstest etwas nicht.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } });
  tools.push({ name: 'delete_note', description: 'Löscht eine Notiz (Titel/Textteil oder ID). Frage VORHER den Nutzer und setze confirmed erst nach seinem Ja auf true.', input_schema: { type: 'object', properties: { note: { type: 'string' }, confirmed: { type: 'boolean' } }, required: ['note'] } });
  tools.push({ name: 'learn_now', description: 'Startet sofort eine Lernrunde: Jarvis wertet Feedback und Gespräche aus und aktualisiert, was er über den Nutzer gelernt hat.', input_schema: { type: 'object', properties: {} } });
  tools.push({ name: 'forget_learned', description: 'Vergisst gelernte Vorlieben, die den Suchtext enthalten.', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } });
  tools.push({ name: 'set_learning', description: 'Stellt die tägliche Lernrunde ein: time als HH:MM (z. B. 22:30) oder "aus".', input_schema: { type: 'object', properties: { time: { type: 'string' } }, required: ['time'] } });
  tools.push({ name: 'list_agent_proposals', description: 'Zeigt Verbesserungsvorschläge für Agenten, die aus dem Feedback entstanden sind (warten auf Zustimmung).', input_schema: { type: 'object', properties: {} } });
  tools.push({ name: 'apply_agent_proposal', description: 'Übernimmt einen Verbesserungsvorschlag für einen Agenten, NUR nachdem der Nutzer zugestimmt hat.', input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } });
  tools.push({ name: 'dismiss_agent_proposal', description: 'Verwirft einen Verbesserungsvorschlag.', input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } });
  tools.push({ name: 'world_news', description: 'Holt aktuelle Weltnachrichten-Schlagzeilen (DW, Tagesschau, BBC, Al Jazeera). Danach die wichtigsten 3-5 kurz zusammenfassen. Mit "topic" werden nur passende Schlagzeilen gezeigt (z. B. Ukraine, Europa, Nahost).',
    input_schema: { type: 'object', properties: { topic: { type: 'string', description: 'optional: Stichwort zum Filtern' } } } });
  tools.push({ name: 'open_world', description: 'Öffnet die Welt-Ansicht von Jarvis im Browser: realistische Weltkugel mit Live-Cams und Krisenmeldungen, Nachrichten-Livestream und Schlagzeilen. Optional mit region: welt, europa, asien, afrika, nordamerika, suedamerika, ozeanien, antarktis, ukraine oder nahost (Kontinente werden hervorgehoben).',
    input_schema: { type: 'object', properties: { region: { type: 'string', enum: ['welt', 'europa', 'asien', 'afrika', 'nordamerika', 'suedamerika', 'ozeanien', 'antarktis', 'ukraine', 'nahost'] } } } });
  tools.push({ name: 'open_website',
    description: 'Öffnet eine Webseite im Chrome-Browser des Nutzers (neuer Tab). Entweder eine konkrete https-Adresse (url) oder eine Google-Suche (search). Nutze es bei „öffne YouTube“, „suche bei Google nach …“ usw. Du kannst bereits offene Tabs weder lesen noch steuern.',
    input_schema: { type: 'object', properties: { url: { type: 'string', description: 'z. B. https://www.youtube.com' }, search: { type: 'string', description: 'Suchbegriff für Google' } } } });
  if (obsidianEnabled) {
    tools.push({ name: 'search_vault', description: 'Sucht in allen Obsidian-Notizen des Nutzers (Titel und Inhalt). Gibt die besten Treffer zurück.',
      input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } });
    tools.push({ name: 'read_vault_note', description: 'Liest eine Obsidian-Notiz (beste Übereinstimmung mit dem Titel/Suchtext) samt Tags, Links und Rückverweisen, damit du sie zusammenfassen oder vorlesen und verwandte Notizen nennen kannst.',
      input_schema: { type: 'object', properties: { title: { type: 'string', description: 'Titel oder Stichwort der Notiz' } }, required: ['title'] } });
    tools.push({ name: 'open_universe', description: 'Öffnet in Obsidian die 3D-Ansicht Knowledge Universe (der Wissens-Graph). Mit "note" wird zusätzlich diese Notiz im Graphen angesteuert und markiert.',
      input_schema: { type: 'object', properties: { note: { type: 'string', description: 'optional: Titel der Notiz, die angesteuert werden soll' } } } });
  }
  if (webhookEnabled) {
    tools.push({ name: 'external_action',
      description: 'Führt eine Aktion in externen Diensten über n8n aus (E-Mail senden, Kalendereintrag, Notion-Seite …). Vorher IMMER den Inhalt mit dem Nutzer bestätigen, nie ungefragt senden.',
      input_schema: { type: 'object', properties: { action: { type: 'string', description: 'z. B. send_email, create_event, create_notion_page' }, details: { type: 'object' } }, required: ['action', 'details'] } });
  }
  if (mailEnabled) {
    tools.push({ name: 'get_mail_filters', description: 'Zeigt, bei welchen Absendern und Stichwörtern im Betreff JARVIS wichtige neue E-Mails meldet (Push aufs Handy und/oder Anruf).', input_schema: { type: 'object', properties: {} } });
    tools.push({ name: 'set_mail_filters',
      description: 'Legt fest, bei welchen neuen E-Mails der Nutzer gemeldet wird (Push und/oder Anruf). Ersetzt die bisherige Liste komplett. Absender: Teil des Namens oder der Adresse (z. B. "finanzamt"). Stichwörter: Teil des Betreffs. Vorher mit get_mail_filters die alte Liste holen, wenn nur etwas hinzukommen soll.',
      input_schema: { type: 'object', properties: { senders: { type: 'array', items: { type: 'string' } }, keywords: { type: 'array', items: { type: 'string' } } }, required: ['senders', 'keywords'] } });
  }
  return tools;
}

/** Baut aus Eingabe eine sichere http(s)-Adresse; null, wenn ungültig. */
export function websiteUrl({ url, search } = {}) {
  if (search && String(search).trim()) return 'https://www.google.com/search?q=' + encodeURIComponent(String(search).trim());
  if (!url) return null;
  let u = String(url).trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch (e) { return null; }
}

/** Öffnet die Adresse im Standardbrowser (ChromeOS: Chrome). JARVIS_OPEN_CMD überschreibt den Befehl. Kein Shell-Aufruf. */
export function openInBrowser(url) {
  return new Promise((resolve) => {
    const cmd = process.env.JARVIS_OPEN_CMD || 'xdg-open';
    let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const c = spawn(cmd, [url], { detached: true, stdio: 'ignore' });
      c.on('error', () => fin(false));
      c.on('spawn', () => { c.unref(); setTimeout(() => fin(true), 150); });
    } catch (e) { fin(false); }
  });
}

const fmt = (iso) => new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export async function runTool(store, name, input, { webhookUrl, fetchFn = fetch, now = Date.now(), webSearch, openUrl = openInBrowser, baseUrl = '', agentRunner, learnRunner } = {}) {
  const d = store.data;
  switch (name) {
    case 'search_vault': {
      if (!store.vaultDir) return 'Kein Obsidian-Vault verbunden.';
      const hits = searchVault(store.vaultDir, String(input.query || ''));
      return hits.length ? hits.map((h) => `${h.title} (${h.rel})`).join('\n') : 'Keine passende Notiz gefunden.';
    }
    case 'read_vault_note': {
      if (!store.vaultDir) return 'Kein Obsidian-Vault verbunden.';
      const n = readVaultNote(store.vaultDir, String(input.title || ''));
      if (!n) return 'Keine passende Notiz gefunden.';
      return `Notiz: ${n.title} (${n.path})\nTags: ${n.tags.join(', ') || '–'}\nVerlinkt auf: ${n.links.join(', ') || '–'}\nVerlinkt von: ${n.backlinks.join(', ') || '–'}\n---\n${n.content}${n.truncated ? '\n[gekürzt]' : ''}`;
    }
    case 'open_universe': {
      if (!store.vaultDir) return 'Kein Obsidian-Vault verbunden.';
      const note = input.note ? String(input.note) : '';
      const url = 'obsidian://knowledge-universe?vault=' + encodeURIComponent(path.basename(store.vaultDir)) + (note ? '&note=' + encodeURIComponent(note) : '');
      return (await openUrl(url)) ? 'Knowledge Universe wird geöffnet' + (note ? ' und steuert „' + note + '“ an.' : '.') : 'Obsidian ließ sich nicht öffnen (läuft Obsidian, ist xdg-open vorhanden?).';
    }
    case 'find_businesses': {
      try { return leadsText(await findBusinesses({ city: input.city, category: input.category, mode: input.mode === 'ohne_chatbot' ? 'ohne_chatbot' : 'ohne_webseite', limit: input.limit, fetchFn })); }
      catch (e) { return 'Firmensuche fehlgeschlagen: ' + e.message; }
    }
    case 'set_briefing': {
      const t = String(input.time || '').trim().toLowerCase();
      if (['aus', 'off', 'nein', ''].includes(t)) { d.briefingConfig = { time: '', topics: '' }; store.save(); return 'Das automatische Morgenbriefing ist ausgeschaltet.'; }
      if (!TIME_RE.test(t)) return 'Ungültige Uhrzeit. Format: 07:30';
      d.briefingConfig = { time: t.padStart(5, '0'), topics: String(input.topics || '').slice(0, 200) };
      store.save();
      return 'Morgenbriefing eingestellt: täglich um ' + d.briefingConfig.time + ' Uhr (Uhrzeit des Geräts, auf dem Jarvis läuft)' + (d.briefingConfig.topics ? ', Schwerpunkt ' + d.briefingConfig.topics : '') + '. Jarvis muss dafür laufen; wird er später gestartet, holt er es bis zu 3 Stunden nach.';
    }
    case 'list_reminders': {
      const open = d.reminders.filter(r => !r.fired).sort((a, b) => new Date(a.at) - new Date(b.at));
      const done = d.reminders.filter(r => r.fired).slice(-5);
      return (open.length ? 'Offen:\n' + open.map(r => `${r.id}: ${r.text} – ${fmt(r.at)}${r.repeat ? ' (' + REPEAT_LABEL[r.repeat] + ')' : ''}`).join('\n') : 'Keine offenen Erinnerungen.')
        + (done.length ? '\nZuletzt ausgesprochen:\n' + done.map(r => `${r.text} – ${fmt(r.at)}`).join('\n') : '');
    }
    case 'cancel_reminder': {
      const q = String(input.text || '').trim().toLowerCase();
      const hit = d.reminders.filter(r => !r.fired && ((input.id && r.id === input.id) || (q && r.text.toLowerCase().includes(q))));
      if (!hit.length) return 'Keine passende offene Erinnerung gefunden.';
      d.reminders = d.reminders.filter(r => !hit.includes(r)); store.save();
      return hit.length + ' Erinnerung' + (hit.length > 1 ? 'en' : '') + ' gelöscht: ' + hit.map(r => r.text).join('; ');
    }
    case 'search_notes': {
      const q = String(input.query || '').trim().toLowerCase(); if (!q) return 'Wonach soll ich suchen?';
      const words = q.split(/\s+/);
      const pool = [...d.notes.map(n => ({ title: fmt(n.ts), text: n.text, ts: new Date(n.ts).getTime() })), ...(store.vaultDir ? listNotes(store.vaultDir) : [])];
      const hits = pool.filter(n => words.every(w => (n.title + ' ' + n.text).toLowerCase().includes(w))).sort((a, b) => b.ts - a.ts).slice(0, 8);
      return hits.length ? hits.map(n => `- ${n.title}: ${n.text.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n') : 'Keine Notiz dazu gefunden.';
    }
    case 'delete_note': {
      const q = String(input.note || '').trim().toLowerCase(); if (!q) return 'Welche Notiz?';
      if (store.vaultDir) {
        const hits = listNotes(store.vaultDir).filter(n => n.title.toLowerCase().includes(q) || n.text.toLowerCase().includes(q));
        if (!hits.length) return 'Keine passende Notiz gefunden.';
        if (hits.length > 1) return 'Mehrere Notizen passen, präzisiere: ' + hits.slice(0, 5).map(n => n.title).join(' | ');
        if (input.confirmed !== true) return 'Bestätige zuerst mit dem Nutzer: Notiz „' + hits[0].title + '“ löschen?';
        return deleteVaultNote(store.vaultDir, hits[0].title) ? 'Notiz gelöscht: ' + hits[0].title : 'Löschen nicht möglich.';
      }
      const hits = d.notes.filter(n => n.id === input.note || n.text.toLowerCase().includes(q));
      if (!hits.length) return 'Keine passende Notiz gefunden.';
      if (hits.length > 1) return 'Mehrere Notizen passen, präzisiere: ' + hits.slice(0, 5).map(n => n.text.slice(0, 40)).join(' | ');
      if (input.confirmed !== true) return 'Bestätige zuerst mit dem Nutzer: Notiz „' + hits[0].text.slice(0, 60) + '“ löschen?';
      d.notes = d.notes.filter(n => n !== hits[0]); store.save(); return 'Notiz gelöscht.';
    }
    case 'learn_now': {
      if (!learnRunner) return 'Lernen ist mit diesem KI-Anbieter nicht verfügbar (nur mit Claude).';
      try { const r = await learnRunner(); return r.summary + (r.learned.length ? ' Gelernt: ' + r.learned.join('; ') + '.' : ''); } catch (e) { return 'Die Lernrunde ist gescheitert: ' + e.message; }
    }
    case 'forget_learned':
      return forgetLearned(store, input.text);
    case 'set_learning': {
      const t = String(input.time || '').trim().toLowerCase();
      if (['aus', 'off', 'nein', ''].includes(t)) { d.learningConfig = { time: '' }; store.save(); return 'Die tägliche Lernrunde ist ausgeschaltet.'; }
      if (!TIME_RE.test(t)) return 'Ungültige Uhrzeit. Format: 22:30';
      d.learningConfig = { time: t.padStart(5, '0') }; store.save();
      return 'Tägliche Lernrunde um ' + d.learningConfig.time + ' Uhr (Uhrzeit des Geräts, Jarvis muss laufen).';
    }
    case 'list_agent_proposals': {
      const l = d.agentProposals || [];
      return l.length ? l.map((p) => `${p.id}: Agent ${p.agent}: ${p.tip}`).join('\n') : 'Keine Vorschläge offen.';
    }
    case 'apply_agent_proposal': {
      const p = (d.agentProposals || []).find((x) => x.id === input.id);
      if (!p) return 'Diesen Vorschlag gibt es nicht.';
      if (!findAgent(store, p.agent)) { d.agentProposals = d.agentProposals.filter((x) => x.id !== p.id); store.save(); return 'Den Agenten „' + p.agent + '“ gibt es nicht (mehr). Vorschlag verworfen.'; }
      const tips = d.agentTips = d.agentTips || {}; const k = p.agent.toLowerCase();
      tips[k] = [...(tips[k] || []), p.tip].slice(-5);
      d.agentProposals = d.agentProposals.filter((x) => x.id !== p.id); store.save();
      return 'Übernommen: Agent „' + p.agent + '“ beachtet künftig: ' + p.tip;
    }
    case 'dismiss_agent_proposal': {
      const n = (d.agentProposals || []).length;
      d.agentProposals = (d.agentProposals || []).filter((x) => x.id !== input.id); store.save();
      return n === d.agentProposals.length ? 'Diesen Vorschlag gibt es nicht.' : 'Vorschlag verworfen.';
    }
    case 'list_agents':
      return listAgents(store).map((a) => `${a.name}${a.builtin ? '' : ' (eigen)'}: ${a.role.slice(0, 110)}… Werkzeuge: ${a.tools.join(', ') || 'keine'}`).join('\n');
    case 'ask_agent': {
      if (!findAgent(store, input.agent)) return 'Diesen Agenten gibt es nicht. Vorhanden: ' + listAgents(store).map((a) => a.name).join(', ');
      if (!agentRunner) return 'Agenten sind mit diesem KI-Anbieter nicht verfügbar (nur mit Claude).';
      try { return await agentRunner(String(input.agent), String(input.task || '')); } catch (e) { return 'Der Agent ist gescheitert: ' + e.message; }
    }
    case 'create_agent':
      return createAgent(store, { name: input.name, role: input.role, tools: input.tools || [] });
    case 'delete_agent':
      return deleteAgent(store, input.name);
    case 'world_news': {
      let items; try { items = await loadNews(fetchFn); } catch (e) { return 'Nachrichten gerade nicht erreichbar: ' + e.message; }
      const t = String(input.topic || '').trim().toLowerCase();
      const pick = t ? items.filter((i) => i.title.toLowerCase().includes(t)) : items;
      return pick.length ? headlinesText(pick) : 'Keine Schlagzeilen zu „' + input.topic + '“ gefunden. Aktuell allgemein:\n' + headlinesText(items, 5);
    }
    case 'open_world': {
      if (!baseUrl) return 'Die Adresse des Servers ist unbekannt. Öffne http://127.0.0.1:8000/welt.html selbst.';
      const region = ['welt', 'europa', 'asien', 'afrika', 'nordamerika', 'suedamerika', 'ozeanien', 'antarktis', 'ukraine', 'nahost'].includes(input.region) ? input.region : 'europa';
      const url = baseUrl.replace(/\/+$/, '') + '/welt.html?region=' + region;
      return (await openUrl(url)) ? 'Welt-Ansicht wird geöffnet (' + region + ').' : 'Der Browser ließ sich nicht öffnen.';
    }
    case 'open_website': {
      const url = websiteUrl(input);
      if (!url) return 'Ungültige Adresse.';
      return (await openUrl(url)) ? 'Geöffnet: ' + url : 'Der Browser ließ sich nicht öffnen. Auf dem Gerät fehlt xdg-open oder ein Standardbrowser.';
    }
    case 'web_search':
      return webSearch ? await webSearch(input.query) : 'Websuche nicht verfügbar.';
    case 'add_task': {
      const t = { id: uid(), text: String(input.text), due: input.due ? String(input.due) : '', done: false };
      d.tasks.push(t); store.save();
      return `Aufgabe gespeichert (ID ${t.id}).`;
    }
    case 'list_tasks':
      return d.tasks.length ? d.tasks.map(t => `${t.id} [${t.done ? 'x' : ' '}] ${t.text}${t.due ? ' (' + t.due + ')' : ''}`).join('\n') : 'Keine Aufgaben.';
    case 'complete_task': {
      const t = d.tasks.find(x => x.id === input.id);
      if (!t) return 'Aufgabe nicht gefunden.';
      t.done = true; store.save();
      return 'Erledigt: ' + t.text;
    }
    case 'add_note':
      if (store.vaultDir) { addNote(store.vaultDir, String(input.text), now); return 'Notiz in Obsidian gespeichert.'; }
      d.notes.push({ id: uid(), text: String(input.text), ts: new Date(now).toISOString() }); store.save();
      return 'Notiz gespeichert.';
    case 'list_notes':
      if (store.vaultDir) {
        const notes = listNotes(store.vaultDir);
        return notes.length ? (notes.length > 12 ? `(${notes.length} Notizen, hier die neuesten 12; für ältere search_notes nutzen)\n` : '') + notes.slice(-12).map(n => `- ${n.title}: ${n.text.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n') : 'Keine Notizen.';
      }
      return d.notes.length ? (d.notes.length > 12 ? `(${d.notes.length} Notizen, hier die neuesten 12; für ältere search_notes nutzen)\n` : '') + d.notes.slice(-12).map(n => `- ${n.text} (${fmt(n.ts)})`).join('\n') : 'Keine Notizen.';
    case 'set_reminder': {
      const at = new Date(input.at);
      if (isNaN(at)) return 'Ungültige Zeit. Format: 2026-10-09T15:00+02:00';
      if (at.getTime() <= now) return 'Die Zeit liegt in der Vergangenheit.';
      const text = String(input.text).trim();
      const repeat = ['taeglich', 'werktags', 'woechentlich'].includes(input.repeat) ? input.repeat : '';
      const dup = d.reminders.find(r => !r.fired && r.text.trim().toLowerCase() === text.toLowerCase() && (repeat ? (r.repeat || '') === repeat : r.at === at.toISOString()));
      if (dup) return 'Diese Erinnerung gibt es schon' + (dup.repeat ? ' (' + REPEAT_LABEL[dup.repeat] + ')' : ' für ' + fmt(dup.at)) + '. Nicht doppelt angelegt.';
      d.reminders.push({ id: uid(), text, at: at.toISOString(), fired: false, ...(repeat ? { repeat } : {}) });
      store.save();
      return 'Erinnerung gesetzt für ' + fmt(at.toISOString()) + (repeat ? ', ' + REPEAT_LABEL[repeat] : '') + '.';
    }
    case 'remember':
      store.syncFacts();
      if (!d.facts.includes(input.fact)) d.facts.push(String(input.fact));
      store.save();
      if (store.vaultDir) writeFacts(store.vaultDir, d.facts);
      return 'Gemerkt.';
    case 'forget': {
      store.syncFacts();
      const before = d.facts.length;
      const needle = String(input.contains).toLowerCase();
      d.facts = d.facts.filter(f => !f.toLowerCase().includes(needle));
      store.save();
      if (store.vaultDir) writeFacts(store.vaultDir, d.facts);
      return `${before - d.facts.length} Fakt(en) vergessen.`;
    }
    case 'set_goal':
      d.goal = { text: String(input.text), schritte: input.schritte || [], realisierbarkeit: input.realisierbarkeit ?? null };
      store.save();
      return 'Ziel gesetzt.';
    case 'external_action': {
      if (!webhookUrl) return 'Kein Webhook konfiguriert.';
      const res = await fetchFn(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const body = await res.text();
      return res.ok ? (body.slice(0, 1500) || 'Ausgeführt.') : 'Fehler vom Workflow: HTTP ' + res.status;
    }
    case 'get_mail_filters': {
      const f = d.mailFilters || { senders: [], keywords: [] };
      return `Absender: ${f.senders.join(', ') || 'keine'}. Stichwörter im Betreff: ${f.keywords.join(', ') || 'keine'}.`;
    }
    case 'set_mail_filters': {
      const clean = (a) => [...new Set((Array.isArray(a) ? a : []).map(x => String(x).trim()).filter(Boolean))].slice(0, 50);
      d.mailFilters = { senders: clean(input.senders), keywords: clean(input.keywords) };
      store.save();
      return 'Mail-Filter gespeichert.';
    }
    default:
      return 'Unbekanntes Werkzeug.';
  }
}

/** Erinnerungen, deren Zeit erreicht ist: werden als erledigt markiert und zurückgegeben. */
export const REPEAT_LABEL = { taeglich: 'täglich', werktags: 'werktags', woechentlich: 'wöchentlich' };

/** Nächster Termin nach "now" bei gleicher Uhrzeit (täglich, werktags Mo-Fr, wöchentlich). */
export function nextOccurrence(iso, repeat, now) {
  const t = new Date(iso);
  do { t.setDate(t.getDate() + (repeat === 'woechentlich' ? 7 : 1)); } while (t.getTime() <= now || (repeat === 'werktags' && [0, 6].includes(t.getDay())));
  return t;
}

/** Fällige Erinnerungen abholen. Wiederholende rücken auf den nächsten Termin, einmalige gelten als ausgesprochen. late = Minuten Verspätung (z. B. Jarvis war aus). */
export function takeDueReminders(store, now = Date.now()) {
  const due = store.data.reminders.filter(r => !r.fired && new Date(r.at).getTime() <= now);
  if (!due.length) return due;
  const out = due.map(r => ({ id: r.id, text: r.text, at: r.at, late: Math.round((now - new Date(r.at).getTime()) / 60000) }));
  for (const r of due) {
    if (r.repeat) r.at = nextOccurrence(r.at, r.repeat, now).toISOString(); else r.fired = true;
  }
  const done = store.data.reminders.filter(r => r.fired);
  if (done.length > 40) store.data.reminders = store.data.reminders.filter(r => !r.fired || done.slice(-40).includes(r));   // alte, ausgesprochene aufräumen
  store.save();
  return out;
}
