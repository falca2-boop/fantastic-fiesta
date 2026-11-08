import fs from 'node:fs';

/** Liest eine .env-Datei (KEY=wert, # Kommentare, optionale Anführungszeichen). Bereits gesetzte Umgebungsvariablen bleiben unverändert. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  }
  return out;
}

export function loadEnvFile(file, env = process.env) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return false; }
  for (const [k, v] of Object.entries(parseEnv(text))) if (env[k] === undefined && v !== '') env[k] = v;
  return true;
}

/** Setzt/ersetzt Schlüssel in einer .env-Datei, lässt alle anderen Zeilen unberührt, legt sie bei Bedarf an (nur für den Nutzer lesbar). */
export function updateEnvFile(file, values) {
  let lines = [];
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch { /* neu anlegen */ }
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const q = (v) => (/[\s#"']/.test(v) ? JSON.stringify(v) : v);
  for (const [k, v] of Object.entries(values)) {
    const i = lines.findIndex((l) => new RegExp('^\\s*' + k + '\\s*=').test(l));
    const line = `${k}=${q(String(v))}`;
    if (i >= 0) lines[i] = line; else lines.push(line);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* egal */ }
}
