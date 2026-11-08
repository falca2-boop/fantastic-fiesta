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

// ---------- Lesen im ganzen Vault (Knowledge-Universe-Anbindung) ----------

const SKIP_DIRS = new Set(['.obsidian', '.git', '.trash', 'node_modules']);

/** Alle Markdown-Notizen des Vaults: [{ title, rel, abs }]. Überspringt versteckte Ordner. */
export function vaultNotes(vault) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 8) return;
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, depth + 1);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push({ title: e.name.replace(/\.md$/i, ''), rel: path.relative(vault, abs), abs });
    }
  };
  walk(vault, 0);
  return out;
}

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const wikilinks = (text) => [...text.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)].map((m) => m[1].trim());
const tagsOf = (text) => [...new Set([...text.matchAll(/(?:^|\s)#([\p{L}\p{N}_\/-]+)/gu)].map((m) => m[1]))];

/** Sucht Notizen nach Titel (bevorzugt) oder Inhalt. Gibt bis zu `limit` Treffer { title, rel, score } zurück. */
export function searchVault(vault, query, limit = 5) {
  const q = norm(query); if (!q) return [];
  const words = q.split(' ');
  const hits = [];
  for (const n of vaultNotes(vault)) {
    const t = norm(n.title);
    let score = 0;
    if (t === q) score = 100; else if (t.includes(q)) score = 80; else if (words.every((w) => t.includes(w))) score = 60;
    else {
      let text = ''; try { text = norm(fs.readFileSync(n.abs, 'utf8').slice(0, 20000)); } catch (e) { continue; }
      if (words.every((w) => text.includes(w))) score = 20 + Math.min(20, words.length * 3);
    }
    if (score) hits.push({ title: n.title, rel: n.rel, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Liest die beste Notiz zum Suchtext samt Verknüpfungen (Links, Rückverweise, Tags). null, wenn nichts passt. */
export function readVaultNote(vault, query, maxChars = 3000) {
  const best = searchVault(vault, query, 1)[0];
  if (!best) return null;
  const notes = vaultNotes(vault);
  const self = notes.find((n) => n.rel === best.rel);
  const text = fs.readFileSync(self.abs, 'utf8');
  const myKey = norm(self.title);
  const outgoing = [...new Set(wikilinks(text))];
  const backlinks = [];
  for (const n of notes) {
    if (n.rel === self.rel) continue;
    let t = ''; try { t = fs.readFileSync(n.abs, 'utf8'); } catch (e) { continue; }
    if (wikilinks(t).some((l) => norm(l.split('/').pop()) === myKey)) backlinks.push(n.title);
  }
  return { title: self.title, path: self.rel, content: text.replace(/^---[\s\S]*?---\s*/, '').slice(0, maxChars), tags: tagsOf(text), links: outgoing.slice(0, 15), backlinks: backlinks.slice(0, 15), truncated: text.length > maxChars };
}
