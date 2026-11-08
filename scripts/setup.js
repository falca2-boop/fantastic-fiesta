import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.log(`Node.js ${process.versions.node} ist zu alt. Bitte Version 20 oder neuer von https://nodejs.org installieren.`);
  process.exit(1);
}

// Zeilen puffern, damit auch eingefügte oder umgeleitete Eingaben nicht verloren gehen
const rl = readline.createInterface({ input: process.stdin });
const queue = []; let waiting = null; let closed = false;
rl.on('line', (l) => { if (waiting) { const w = waiting; waiting = null; w(l); } else queue.push(l); });
rl.on('close', () => { closed = true; if (waiting) waiting(''); });
const nextLine = () => queue.length ? Promise.resolve(queue.shift()) : closed ? Promise.resolve('') : new Promise((r) => { waiting = r; });
const ask = async (q, def = '') => { process.stdout.write(def ? `${q} [${def}]: ` : `${q}: `); return ((await nextLine()).trim() || def); };
const yes = async (q) => /^(j|ja|y|yes)$/i.test(await ask(q + ' (j/n)', 'n'));

console.log('\nJARVIS einrichten. Leer lassen = überspringen. Abbrechen mit Strg+C.\n');

if (fs.existsSync(ENV_FILE)) {
  if (!(await yes('Es gibt schon eine .env. Neu anlegen? (die alte wird als .env.bak gesichert)'))) { console.log('Nichts geändert.'); rl.close(); process.exit(0); }
  fs.copyFileSync(ENV_FILE, ENV_FILE + '.bak');
}

const v = {};

console.log('1) Anthropic API Key (Pflicht). Erstellen unter https://console.anthropic.com → API Keys.');
while (!v.ANTHROPIC_API_KEY) {
  if (closed && !queue.length) { console.log('\nEingabe beendet, ohne Key. Abbruch.'); process.exit(1); }
  const key = await ask('   Key (beginnt mit sk-ant-)');
  if (key.startsWith('sk-ant-')) v.ANTHROPIC_API_KEY = key;
  else console.log('   Das sieht nicht wie ein Anthropic-Key aus. Nochmal.');
}
try {
  const res = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': v.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' } });
  console.log(res.ok ? '   Key funktioniert.' : `   Warnung: Anthropic meldet HTTP ${res.status}. Prüfe Key und Guthaben.`);
} catch { console.log('   Konnte den Key gerade nicht prüfen (kein Internet?). Ich speichere ihn trotzdem.'); }

v.JARVIS_USER_NAME = await ask('2) Wie soll Jarvis dich nennen?', 'Augustin');

console.log('\n3) Obsidian: Ordner deines Vaults (der Ordner, den Obsidian öffnet).');
for (;;) {
  const dir = await ask('   Pfad (leer = ohne Obsidian)');
  if (!dir) break;
  const clean = dir.replace(/^["']|["']$/g, '');
  if (fs.existsSync(clean) && fs.statSync(clean).isDirectory()) { v.OBSIDIAN_VAULT_DIR = path.resolve(clean); break; }
  console.log('   Den Ordner gibt es nicht. Nochmal oder leer lassen.');
}

console.log('\n4) Stimme (ElevenLabs, optional). Key unter elevenlabs.io → Developers → API Keys, Voice-ID bei "Meine Stimmen" → ID kopieren.');
const xi = await ask('   ElevenLabs API Key (leer = Browser-Stimme)');
if (xi) {
  const voice = await ask('   Voice-ID');
  if (voice) { v.ELEVENLABS_API_KEY = xi; v.ELEVENLABS_VOICE_ID = voice; } else console.log('   Ohne Voice-ID geht es nicht, Stimme übersprungen.');
}

console.log('\n5) n8n (optional, für E-Mail senden, Kalender, Notion).');
const hook = await ask('   Webhook-URL (leer = überspringen)');
if (hook) v.N8N_WEBHOOK_URL = hook;

fs.writeFileSync(ENV_FILE, Object.entries(v).map(([k, val]) => `${k}=${val}`).join('\n') + '\n', { mode: 0o600 });
rl.close();

console.log(`
Fertig. Die Einstellungen stehen in ${ENV_FILE}
(Mail-Alarm per Push oder Anruf kannst du später in dieser Datei ergänzen, siehe README.)

Jarvis starten:   npm start
Dann im Browser (Chrome oder Edge) öffnen:   http://127.0.0.1:8000
Mikrofon erlauben und "Hey Jarvis" sagen.
`);
