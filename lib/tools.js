import { randomBytes } from 'node:crypto';

const uid = () => randomBytes(3).toString('hex');

export function toolDefinitions({ webhookEnabled, mailEnabled }) {
  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: 4 },
    { name: 'add_task', description: 'Fügt eine Aufgabe zur To-do-Liste hinzu.',
      input_schema: { type: 'object', properties: { text: { type: 'string' }, due: { type: 'string', description: 'Optional: Fälligkeit, z. B. "morgen" oder 2026-10-12' } }, required: ['text'] } },
    { name: 'list_tasks', description: 'Listet alle Aufgaben mit IDs und Status.', input_schema: { type: 'object', properties: {} } },
    { name: 'complete_task', description: 'Markiert eine Aufgabe als erledigt.',
      input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'add_note', description: 'Speichert eine Notiz.', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    { name: 'list_notes', description: 'Listet alle gespeicherten Notizen.', input_schema: { type: 'object', properties: {} } },
    { name: 'set_reminder', description: 'Setzt eine Erinnerung, die JARVIS zur Zeit ausspricht. "at" ist ISO 8601 MIT Zeitzonen-Offset im Format der aktuellen Zeit aus dem Systemkontext, z. B. 2026-10-09T15:00+02:00.',
      input_schema: { type: 'object', properties: { text: { type: 'string' }, at: { type: 'string' } }, required: ['text', 'at'] } },
    { name: 'remember', description: 'Merkt dauerhaft einen Fakt über den Nutzer (Vorlieben, Namen, Routinen).',
      input_schema: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] } },
    { name: 'forget', description: 'Vergisst gespeicherte Fakten, die den Suchtext enthalten.',
      input_schema: { type: 'object', properties: { contains: { type: 'string' } }, required: ['contains'] } },
    { name: 'set_goal', description: 'Setzt das aktuelle Hauptziel des Nutzers mit Plan.',
      input_schema: { type: 'object', properties: { text: { type: 'string' }, schritte: { type: 'array', items: { type: 'string' } }, realisierbarkeit: { type: 'number', description: '0-100' } }, required: ['text'] } },
  ];
  if (webhookEnabled) {
    tools.push({ name: 'external_action',
      description: 'Führt eine Aktion in externen Diensten über n8n aus (E-Mail senden, Kalendereintrag, Notion-Seite …). Vorher IMMER den Inhalt mit dem Nutzer bestätigen, nie ungefragt senden.',
      input_schema: { type: 'object', properties: { action: { type: 'string', description: 'z. B. send_email, create_event, create_notion_page' }, details: { type: 'object' } }, required: ['action', 'details'] } });
  }
  if (mailEnabled) {
    tools.push({ name: 'get_mail_filters', description: 'Zeigt, bei welchen Absendern und Stichwörtern im Betreff JARVIS per Push-Nachricht auf das Handy meldet.', input_schema: { type: 'object', properties: {} } });
    tools.push({ name: 'set_mail_filters',
      description: 'Legt fest, bei welchen neuen E-Mails der Nutzer eine Push-Nachricht bekommt. Ersetzt die bisherige Liste komplett. Absender: Teil des Namens oder der Adresse (z. B. "finanzamt"). Stichwörter: Teil des Betreffs. Vorher mit get_mail_filters die alte Liste holen, wenn nur etwas hinzukommen soll.',
      input_schema: { type: 'object', properties: { senders: { type: 'array', items: { type: 'string' } }, keywords: { type: 'array', items: { type: 'string' } } }, required: ['senders', 'keywords'] } });
  }
  return tools;
}

const fmt = (iso) => new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export async function runTool(store, name, input, { webhookUrl, fetchFn = fetch, now = Date.now() } = {}) {
  const d = store.data;
  switch (name) {
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
      d.notes.push({ id: uid(), text: String(input.text), ts: new Date(now).toISOString() }); store.save();
      return 'Notiz gespeichert.';
    case 'list_notes':
      return d.notes.length ? d.notes.map(n => `- ${n.text} (${fmt(n.ts)})`).join('\n') : 'Keine Notizen.';
    case 'set_reminder': {
      const at = new Date(input.at);
      if (isNaN(at)) return 'Ungültige Zeit. Format: 2026-10-09T15:00+02:00';
      if (at.getTime() <= now) return 'Die Zeit liegt in der Vergangenheit.';
      d.reminders.push({ id: uid(), text: String(input.text), at: at.toISOString(), fired: false });
      store.save();
      return 'Erinnerung gesetzt für ' + fmt(at.toISOString()) + '.';
    }
    case 'remember':
      if (!d.facts.includes(input.fact)) d.facts.push(String(input.fact));
      store.save();
      return 'Gemerkt.';
    case 'forget': {
      const before = d.facts.length;
      const needle = String(input.contains).toLowerCase();
      d.facts = d.facts.filter(f => !f.toLowerCase().includes(needle));
      store.save();
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
export function takeDueReminders(store, now = Date.now()) {
  const due = store.data.reminders.filter(r => !r.fired && new Date(r.at).getTime() <= now);
  if (due.length) { due.forEach(r => { r.fired = true; }); store.save(); }
  return due;
}
