#!/usr/bin/env bash
# Richtet Knowledge Universe in einem Vault komplett ein und startet Obsidian mit genau diesem Vault neu.
# Aufruf:  ./activate.sh "/pfad/zum/Vault"
# Das Skript: 1) installiert das Plugin, 2) trägt es in community-plugins.json ein, 3) schließt Obsidian,
# 4) sorgt dafür, dass beim Start nur dieser Vault öffnet, 5) startet Obsidian neu.
# Notizen bleiben unberührt. Obsidian speichert selbst laufend, beim Schließen geht nichts verloren.
set -euo pipefail

VAULT="${1:-}"
[ -n "$VAULT" ] || { echo "Aufruf: ./activate.sh \"/pfad/zum/Vault\"" >&2; exit 1; }
VAULT="$(cd "$VAULT" 2>/dev/null && pwd)" || { echo "Ordner nicht gefunden: $1" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
OBSIDIAN_BIN="${OBSIDIAN_BIN:-/opt/Obsidian/obsidian}"
CONFIG="${OBSIDIAN_CONFIG:-$HOME/.config/obsidian/obsidian.json}"
DRY="${KU_DRY:-0}"                       # 1 = Obsidian weder schließen noch starten (für Tests)
NAME="$(basename "$VAULT")"
# Nur Prozesse, deren Befehl mit dem Obsidian-Programm BEGINNT (trifft weder dieses Skript noch eine Shell, die den Pfad nur als Text enthält)
OBS_RE="^${OBSIDIAN_BIN}( |\$)"
obsidian_running() { pgrep -f "$OBS_RE" >/dev/null 2>&1; }

echo "Vault: $VAULT"
mkdir -p "$VAULT/.obsidian"

# 1) Plugin-Dateien kopieren (main.js wird bei Bedarf gebaut)
if [ ! -f "$HERE/main.js" ]; then
  echo "main.js fehlt, baue das Plugin ..."
  (cd "$HERE" && npm install --no-audit --no-fund && npm run build)
fi
DEST="$VAULT/.obsidian/plugins/knowledge-universe"
mkdir -p "$DEST"
cp "$HERE/main.js" "$HERE/manifest.json" "$HERE/styles.css" "$DEST/"
echo "1/4 Plugin installiert."

# 2) Obsidian schließen, damit es die Dateien nicht überschreibt
if [ "$DRY" != "1" ] && obsidian_running; then
  echo "Schließe Obsidian ..."
  pkill -TERM -f "$OBS_RE" || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do obsidian_running || break; sleep 1; done
  pkill -KILL -f "$OBS_RE" 2>/dev/null || true
  sleep 1
fi

# 3) Plugin im Vault einschalten und beim Start nur diesen Vault öffnen
node - "$VAULT" "$CONFIG" <<'JS'
const fs = require('fs'), path = require('path');
const [vault, config] = process.argv.slice(2);
// community-plugins.json
const cp = path.join(vault, '.obsidian', 'community-plugins.json');
let list = [];
try { const v = JSON.parse(fs.readFileSync(cp, 'utf8')); if (Array.isArray(v)) list = v; } catch {}
if (!list.includes('knowledge-universe')) list.push('knowledge-universe');
fs.writeFileSync(cp, JSON.stringify(list));
// Obsidian-Konfiguration: nur dieser Vault ist "offen"
try {
  const c = JSON.parse(fs.readFileSync(config, 'utf8'));
  c.vaults = c.vaults || {};
  let found = false;
  for (const [id, v] of Object.entries(c.vaults)) {
    if (v.path === vault) { v.open = true; v.ts = Date.now(); found = true; } else delete v.open;
  }
  if (!found) { const id = require('crypto').randomBytes(8).toString('hex'); c.vaults[id] = { path: vault, ts: Date.now(), open: true }; }
  fs.writeFileSync(config, JSON.stringify(c));
} catch (e) { console.log('Hinweis: Obsidian-Konfiguration nicht geändert (' + e.message + ')'); }
JS
echo "2/4 Plugin eingeschaltet, nur dieser Vault wird beim Start geöffnet."

# 4) Obsidian neu starten
if [ "$DRY" = "1" ]; then
  echo "3/4 (Testlauf) Obsidian nicht gestartet."
else
  nohup "$OBSIDIAN_BIN" "obsidian://open?vault=$NAME" >/dev/null 2>&1 &
  disown || true
  echo "3/4 Obsidian wird gestartet ..."
fi
echo
echo "Fertig. Sobald Obsidian offen ist (oben im Titel steht \"$NAME\"):"
echo "  Strg + P drücken, \"Knowledge\" tippen, Enter  (oder links auf das Orbit-Symbol klicken)."
