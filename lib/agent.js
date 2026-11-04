/**
 * JARVIS – Claude-Agent-Schleife.
 * Verwaltet den Gesprächsverlauf und führt Werkzeugaufrufe aus.
 */
import https from 'node:https';
import { TOOLS, TOOL_MAP } from './tools.js';
import { getState } from './store.js';

const API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const MODEL = process.env.JARVIS_MODEL ?? 'claude-sonnet-4-5';
const USER_NAME = process.env.JARVIS_USER_NAME ?? 'Augustin';
const MAX_HISTORY = 40; // Nachrichten im Verlauf

/** Konversationsverlauf (In-Memory, geht bei Server-Neustart verloren) */
const history = [];

function systemPrompt() {
  const state = getState();
  const tasks = state.tasks.filter(t => !t.done);
  const memory = Object.entries(state.memory)
    .map(([k, v]) => `${k}: ${v.value}`)
    .join('\n') || '(leer)';

  return `Du bist JARVIS, der persönliche KI-Assistent von ${USER_NAME}.
Stil: präzise, respektvoll, leicht britisch (wie aus Iron Man). Antworte auf Deutsch.
Sprich ${USER_NAME} mit Namen an. Halte Antworten kurz und klar – du wirst vorgelesen.
Vermeide Markdown, Listen, Sonderzeichen. Schreibe in natürlichen Sätzen.

Aktuelle Zeit: ${new Date().toLocaleString('de-DE')}

Offene Aufgaben (${tasks.length}):
${tasks.map(t => `- ${t.title}${t.due ? ` (${t.due})` : ''}`).join('\n') || '(keine)'}

Gedächtnis:
${memory}

Nutze deine Werkzeuge für Aufgaben, Notizen, Erinnerungen und Gedächtnis.
Bei Unsicherheit frage nach, bevor du etwas Wichtiges ausführst.`;
}

function apiRequest(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
        },
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString());
            if (res.statusCode !== 200) {
              reject(new Error(`API ${res.statusCode}: ${data.error?.message ?? JSON.stringify(data)}`));
            } else {
              resolve(data);
            }
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/** Führt einen Werkzeugaufruf aus und gibt das Ergebnis zurück */
function runTool(name, input) {
  const tool = TOOL_MAP[name];
  if (!tool) return `Unbekanntes Werkzeug: ${name}`;
  try {
    return String(tool.run(input));
  } catch (err) {
    return `Fehler bei ${name}: ${err.message}`;
  }
}

/** Haupt-Chat-Funktion: eine Nachricht → Antwort-String */
export async function chat(userMessage) {
  if (!API_KEY) throw new Error('ANTHROPIC_API_KEY nicht gesetzt');

  history.push({ role: 'user', content: userMessage });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

  const tools = TOOLS.map(({ name, description, input_schema }) => ({
    name, description, input_schema,
  }));

  // Agentic loop: bis zu 10 Runden (Tool-Calls)
  for (let round = 0; round < 10; round++) {
    const response = await apiRequest({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(),
      messages: history,
      tools,
    });

    const { stop_reason, content } = response;

    // Antwort in Verlauf aufnehmen
    history.push({ role: 'assistant', content });

    if (stop_reason === 'end_turn') {
      // Nur Text-Teile zurückgeben
      return content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('')
        .trim();
    }

    if (stop_reason === 'tool_use') {
      // Alle Werkzeugaufrufe ausführen
      const toolResults = content
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: runTool(b.name, b.input),
        }));

      history.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unbekannter stop_reason
    return content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
      || 'Entschuldigung, ich konnte keine Antwort generieren.';
  }

  return 'Entschuldigung, die Anfrage hat zu lange gedauert.';
}

/** Verlauf löschen */
export function clearHistory() {
  history.length = 0;
}
