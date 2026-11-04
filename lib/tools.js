/**
 * JARVIS – Werkzeuge für den Claude-Agenten.
 * Jedes Werkzeug: { name, description, input_schema, run(input) → string }
 */
import { withStore } from './store.js';

function ts() { return new Date().toISOString(); }
function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── Aufgaben ────────────────────────────────────────────────────────────────

function taskAdd({ title, due }) {
  return withStore(s => {
    const task = { id: id(), title, due: due ?? null, done: false, created: ts() };
    s.tasks.push(task);
    return `Aufgabe hinzugefügt: „${title}"${due ? ` (fällig: ${due})` : ''}`;
  });
}

function taskList() {
  return withStore(s => {
    const open = s.tasks.filter(t => !t.done);
    if (!open.length) return 'Keine offenen Aufgaben.';
    return open.map(t => `[${t.id}] ${t.title}${t.due ? ` – fällig: ${t.due}` : ''}`).join('\n');
  });
}

function taskDone({ id: tid }) {
  return withStore(s => {
    const t = s.tasks.find(t => t.id === tid);
    if (!t) return `Aufgabe ${tid} nicht gefunden.`;
    t.done = true;
    t.completedAt = ts();
    return `Aufgabe erledigt: „${t.title}"`;
  });
}

// ── Notizen ─────────────────────────────────────────────────────────────────

function noteAdd({ title, content }) {
  return withStore(s => {
    s.notes.push({ id: id(), title, content, created: ts() });
    return `Notiz gespeichert: „${title}"`;
  });
}

function noteList() {
  return withStore(s => {
    if (!s.notes.length) return 'Keine Notizen vorhanden.';
    return s.notes.map(n => `[${n.id}] ${n.title}: ${n.content.slice(0, 80)}`).join('\n');
  });
}

function noteGet({ id: nid }) {
  return withStore(s => {
    const n = s.notes.find(n => n.id === nid);
    return n ? `${n.title}\n\n${n.content}` : `Notiz ${nid} nicht gefunden.`;
  });
}

// ── Erinnerungen ─────────────────────────────────────────────────────────────

function reminderAdd({ text, when }) {
  return withStore(s => {
    s.reminders.push({ id: id(), text, when, done: false, created: ts() });
    return `Erinnerung gesetzt: „${text}" um ${when}`;
  });
}

function reminderList() {
  return withStore(s => {
    const pending = s.reminders.filter(r => !r.done);
    if (!pending.length) return 'Keine offenen Erinnerungen.';
    return pending.map(r => `[${r.id}] ${r.when}: ${r.text}`).join('\n');
  });
}

// ── Gedächtnis ───────────────────────────────────────────────────────────────

function memorySet({ key, value }) {
  return withStore(s => {
    s.memory[key] = { value, updated: ts() };
    return `Gespeichert: ${key} = ${value}`;
  });
}

function memoryGet({ key }) {
  return withStore(s => {
    const m = s.memory[key];
    return m ? `${key}: ${m.value}` : `Kein Eintrag für „${key}".`;
  });
}

function memoryList() {
  return withStore(s => {
    const keys = Object.keys(s.memory);
    if (!keys.length) return 'Gedächtnis ist leer.';
    return keys.map(k => `${k}: ${s.memory[k].value}`).join('\n');
  });
}

// ── Datum/Zeit ───────────────────────────────────────────────────────────────

function getCurrentTime() {
  return new Date().toLocaleString('de-DE', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Werkzeug-Definitionen (für Claude) ───────────────────────────────────────

export const TOOLS = [
  {
    name: 'task_add',
    description: 'Neue Aufgabe hinzufügen',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Titel der Aufgabe' },
        due: { type: 'string', description: 'Fälligkeitsdatum (ISO oder natürlicher Text), optional' },
      },
      required: ['title'],
    },
    run: taskAdd,
  },
  {
    name: 'task_list',
    description: 'Alle offenen Aufgaben auflisten',
    input_schema: { type: 'object', properties: {} },
    run: taskList,
  },
  {
    name: 'task_done',
    description: 'Aufgabe als erledigt markieren',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID der Aufgabe' } },
      required: ['id'],
    },
    run: taskDone,
  },
  {
    name: 'note_add',
    description: 'Neue Notiz speichern',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['title', 'content'],
    },
    run: noteAdd,
  },
  {
    name: 'note_list',
    description: 'Alle Notizen auflisten',
    input_schema: { type: 'object', properties: {} },
    run: noteList,
  },
  {
    name: 'note_get',
    description: 'Eine bestimmte Notiz lesen',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    run: noteGet,
  },
  {
    name: 'reminder_add',
    description: 'Erinnerung setzen',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Woran erinnern?' },
        when: { type: 'string', description: 'Wann (natürlicher Text oder ISO)' },
      },
      required: ['text', 'when'],
    },
    run: reminderAdd,
  },
  {
    name: 'reminder_list',
    description: 'Alle Erinnerungen auflisten',
    input_schema: { type: 'object', properties: {} },
    run: reminderList,
  },
  {
    name: 'memory_set',
    description: 'Etwas über den Nutzer oder den Kontext dauerhaft speichern',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Schlüssel, z. B. „lieblingsgericht"' },
        value: { type: 'string', description: 'Wert' },
      },
      required: ['key', 'value'],
    },
    run: memorySet,
  },
  {
    name: 'memory_get',
    description: 'Gespeicherte Information abrufen',
    input_schema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
    run: memoryGet,
  },
  {
    name: 'memory_list',
    description: 'Alle gespeicherten Informationen auflisten',
    input_schema: { type: 'object', properties: {} },
    run: memoryList,
  },
  {
    name: 'get_current_time',
    description: 'Aktuelles Datum und Uhrzeit abrufen',
    input_schema: { type: 'object', properties: {} },
    run: getCurrentTime,
  },
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map(t => [t.name, t]));
