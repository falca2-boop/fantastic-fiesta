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
