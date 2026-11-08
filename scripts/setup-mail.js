// Richtet den Mail-Alarm ein: fragt Postfach-Zugang ab, prüft die Anmeldung und schreibt alles in die .env.
// Aufruf:  node scripts/setup-mail.js     (danach Jarvis neu starten)
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { updateEnvFile, parseEnv } from '../lib/env.js';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = process.env.JARVIS_ENV_FILE || path.join(ROOT, '.env');
const PRESETS = {
  1: { name: 'web.de', host: 'imap.web.de', hint: 'web.de → Einstellungen → POP3/IMAP Abruf → „IMAP-Zugriff erlauben“ einschalten.' },
  2: { name: 'GMX', host: 'imap.gmx.net', hint: 'GMX → Einstellungen → POP3/IMAP Abruf → „Zugriff auf GMX Postfach über externe Programme“ erlauben.' },
  3: { name: 'Gmail', host: 'imap.gmail.com', hint: 'Gmail braucht ein App-Passwort (Google-Konto → Sicherheit → Bestätigung in 2 Schritten → App-Passwörter).' },
  4: { name: 'Outlook / Hotmail', host: 'outlook.office365.com', hint: 'Outlook: IMAP muss im Konto erlaubt sein, ggf. App-Passwort nutzen.' },
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const lines = []; let waiting = null; let closed = false;
rl.on('line', (l) => { if (waiting) { const w = waiting; waiting = null; w(l); } else lines.push(l); });
rl.on('close', () => { closed = true; if (waiting) waiting(''); });
const next = () => lines.length ? Promise.resolve(lines.shift()) : closed ? Promise.resolve('') : new Promise((r) => { waiting = r; });
const ask = async (q, def = '') => { process.stdout.write(def ? `${q} [${def}]: ` : `${q}: `); return ((await next()).trim() || def); };
const askSecret = async (q) => {
  // Eingabe nicht anzeigen (Passwort); bei umgeleiteter Eingabe normal lesen
  process.stdout.write(q + ': ');
  if (process.stdin.isTTY) { const out = rl.output; rl._writeToOutput = () => {}; const v = (await next()).trim(); rl._writeToOutput = rl.constructor.prototype._writeToOutput; process.stdout.write('\n'); void out; return v; }
  return (await next()).trim();
};
const yes = async (q, def = 'j') => /^(j|ja|y|yes)$/i.test(await ask(q + ' (j/n)', def));

export async function testLogin({ host, port = 993, user, password }) {
  const { ImapFlow } = await import('imapflow');
  const c = new ImapFlow({ host, port, secure: true, auth: { user, pass: password }, logger: false });
  c.on('error', () => {});
  await c.connect(); await c.logout();
}

console.log('\nMail-Alarm einrichten. Abbrechen mit Strg+C.\n');
console.log('1) Welches Postfach?');
for (const [k, p] of Object.entries(PRESETS)) console.log(`   ${k} = ${p.name}`);
console.log('   5 = anderes (IMAP-Server selbst eintragen)');
const old = (() => { try { return parseEnv(fs.readFileSync(ENV_FILE, 'utf8')); } catch { return {}; } })();
const choice = await ask('   Auswahl', '1');
const preset = PRESETS[choice];
const host = preset ? preset.host : await ask('   IMAP-Server (z. B. imap.beispiel.de)');
if (preset) console.log('\n   Wichtig: ' + preset.hint + '\n');
const user = await ask('2) Deine E-Mail-Adresse', old.IMAP_USER || '');
const password = await askSecret('3) Passwort des Postfachs (wird nicht angezeigt)');
if (!host || !user || !password) { console.log('\nAdresse, Server und Passwort werden gebraucht. Abbruch, nichts geändert.'); process.exit(1); }

process.stdout.write('\nPrüfe die Anmeldung ... ');
try { await testLogin({ host, user, password }); console.log('klappt.'); }
catch (err) {
  if (err && err.code === 'ERR_MODULE_NOT_FOUND') { console.log('\nEin Paket fehlt. Führe einmal  npm install  aus und starte dieses Skript noch einmal.'); process.exit(1); }
  console.log('fehlgeschlagen (' + String(err.responseText || err.message || err).slice(0, 120) + ').');
  console.log('Meist ist IMAP im Postfach noch nicht erlaubt oder das Passwort stimmt nicht. Nichts gespeichert.');
  process.exit(1);
}

const all = await yes('4) Bei JEDER neuen Mail melden? (n = nur bei wichtigen Absendern/Stichwörtern)', 'j');
const values = { IMAP_HOST: host, IMAP_PORT: '993', IMAP_USER: user, IMAP_PASSWORD: password, MAIL_SCREEN_ALERT: 'true', MAIL_ALERT_ALL: all ? 'true' : 'false' };
if (!all) {
  const senders = await ask('   Wichtige Absender, Komma-getrennt (z. B. finanzamt,chef@firma.de)');
  const words = await ask('   Wichtige Wörter im Betreff (z. B. dringend,rechnung)');
  if (senders) values.MAIL_IMPORTANT_SENDERS = senders;
  if (words) values.MAIL_IMPORTANT_KEYWORDS = words;
}
if (await yes('5) Zusätzlich Push aufs Handy (kostenlose App „ntfy“)?', 'n')) {
  const topic = old.NTFY_TOPIC || 'jarvis-mail-' + randomBytes(6).toString('hex');
  values.NTFY_TOPIC = topic;
  console.log(`\n   Installiere auf dem Handy die App „ntfy“ und abonniere das Thema:  ${topic}\n   (Der Name ist dein Geheimnis, gib ihn nicht weiter.)`);
}
updateEnvFile(ENV_FILE, values);
console.log(`\nFertig. Gespeichert in ${ENV_FILE} (nur du kannst sie lesen).`);
console.log('Starte Jarvis neu:  pkill -f "node server.js"; npm start');
console.log('Bei Mails, die NACH dem Start eintreffen, sagt Jarvis dann „Wichtige Mail von …“ an, solange die Seite offen ist.');
rl.close();
