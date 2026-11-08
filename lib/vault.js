import fs from 'node:fs';
import path from 'node:path';

/**
 * Obsidian-Anbindung: Notizen und Gedächtnis liegen als Markdown-Dateien im Vault.
 *   <vault>/Jarvis/Notizen/<Datum> <Titel>.md   eine Datei pro Notiz
 *   <vault>/Jarvis/Gedächtnis.md                ein Fakt pro Listenpunkt ("- ...")
 * ("Jarvis" ist über OBSIDIAN_SUBFOLDER änderbar)
 * Dateien, die du selbst in Jarvis/Notizen anlegst oder änderst, liest Jarvis mit.
 */

/** Unterordner im Vault. Mit OBSIDIAN_SUBFOLDER änderbar (z. B. "00-INBOX/Jarvis"); nur relative Pfade ohne "..". */
function subfolder() {
  const raw = (process.env.OBSIDIAN_SUBFOLDER || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!raw || raw.split('/').some(p => p === '..' || p === '.' || p === '')) return 'Jarvis';
  return path.join(...raw.split('/'));
}
const NOTES = 'Notizen';
const FACTS = 'Gedächtnis.md';

export function vaultDirFromEnv(env) {
  const dir = (env.OBSIDIAN_VAULT_DIR || '').trim();
  return dir ? path.resolve(dir) : null;
}

const notesDir = (vault) => path.join(vault, subfolder(), NOTES);
const factsFile = (vault) => path.join(vault, subfolder(), FACTS);

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

const slug = (text) => text.replace(/[\\/:*?"<>|#^[\]\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50) || 'Notiz';

export function addNote(vault, text, now = Date.now()) {
  const dir = notesDir(vault);
  fs.mkdirSync(dir, { recursive: true });
  const iso = new Date(now).toISOString();
  const base = `${iso.slice(0, 10)} ${slug(text)}`;
  let file = path.join(dir, base + '.md');
  for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, `${base} (${n}).md`);
  writeAtomic(file, `---\ncreated: ${iso}\nsource: jarvis\n---\n\n${text}\n`);
  return path.basename(file);
}

/** Alle Notizen (neueste zuletzt) als { title, text, ts }. */
export function listNotes(vault) {
  const dir = notesDir(vault);
  let files;
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { return []; }
  return files.map((f) => {
    const full = path.join(dir, f);
    const raw = fs.readFileSync(full, 'utf8');
    const text = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
    return { title: f.replace(/\.md$/, ''), text, ts: fs.statSync(full).mtimeMs };
  }).sort((a, b) => a.ts - b.ts);
}

export function readFacts(vault) {
  try {
    return fs.readFileSync(factsFile(vault), 'utf8').split(/\r?\n/)
      .map(l => l.match(/^\s*[-*]\s+(.+?)\s*$/)).filter(Boolean).map(m => m[1]);
  } catch { return null; } // null = Datei gibt es noch nicht
}

export function writeFacts(vault, facts) {
  writeAtomic(factsFile(vault), `---\nsource: jarvis\n---\n\n# Was Jarvis über dich weiß\n\n${facts.map(f => '- ' + f).join('\n')}\n`);
}

/** Die n neuesten Notizen (nach Änderungszeit), liest nur diese Dateien. */
export function recentNotes(vault, n = 4) {
  const dir = notesDir(vault);
  let files;
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { return []; }
  return files.map((f) => ({ f, ts: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.ts - a.ts).slice(0, n)
    .map(({ f, ts }) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const text = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
      return { title: f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2} /, ''), text: text.slice(0, 160), ts: new Date(ts).toISOString() };
    });
}
