#!/usr/bin/env bash
# Legt ein anklickbares "Jarvis"-Symbol an (ChromeOS-Startmenü "Linux-Apps"), außerdem die Befehle jarvis-start und jarvis-stop.
# Einmal ausführen:  bash scripts/install-launcher.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$HOME/.local/bin"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONS="${XDG_DATA_HOME:-$HOME/.local/share}/icons"
mkdir -p "$BIN" "$APPS" "$ICONS"

# --- Start: Server starten, falls er nicht läuft, dann Browser öffnen
cat > "$BIN/jarvis-start" <<SCRIPT
#!/usr/bin/env bash
DIR="$DIR"
PORT="\${PORT:-8001}"
URL="http://127.0.0.1:\$PORT"
alive() { curl -fs -m 2 "\$URL/api/health" >/dev/null 2>&1; }
if ! alive; then
  NODE="\$(command -v node || echo /usr/local/bin/node)"
  cd "\$DIR" || exit 1
  PORT="\$PORT" setsid nohup "\$NODE" server.js >> "\$DIR/jarvis.log" 2>&1 &
  echo \$! > "\$DIR/.jarvis.pid"
  for _ in \$(seq 1 40); do sleep 0.5; alive && break; done
fi
if [ "\${JARVIS_OPEN:-1}" = "1" ]; then
  xdg-open "\$URL" >/dev/null 2>&1 || sensible-browser "\$URL" >/dev/null 2>&1 || echo "Bitte öffne \$URL im Browser."
fi
SCRIPT

# --- Stop
cat > "$BIN/jarvis-stop" <<SCRIPT
#!/usr/bin/env bash
DIR="$DIR"
if [ -f "\$DIR/.jarvis.pid" ] && kill -0 "\$(cat "\$DIR/.jarvis.pid")" 2>/dev/null; then
  kill "\$(cat "\$DIR/.jarvis.pid")" && echo "Jarvis beendet."
else
  echo "Jarvis läuft nicht (oder wurde anders gestartet)."
fi
rm -f "\$DIR/.jarvis.pid"
SCRIPT
chmod +x "$BIN/jarvis-start" "$BIN/jarvis-stop"

# --- Symbol
cat > "$ICONS/jarvis.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#7df3ff"/><stop offset="1" stop-color="#00e5ff" stop-opacity="0"/></radialGradient></defs>
  <rect width="128" height="128" rx="28" fill="#02141a"/>
  <g stroke="#00e5ff" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".85">
    <path d="M64 64 C40 52 30 38 20 30"/><path d="M64 64 C88 50 98 40 110 28"/><path d="M64 64 C44 76 34 92 24 104"/>
    <path d="M64 64 C86 78 96 90 108 102"/><path d="M64 64 C64 44 62 28 66 14"/><path d="M64 64 C64 86 70 102 64 116"/>
  </g>
  <g fill="#7df3ff"><circle cx="20" cy="30" r="4"/><circle cx="110" cy="28" r="4"/><circle cx="24" cy="104" r="4"/><circle cx="108" cy="102" r="4"/><circle cx="66" cy="14" r="3.5"/><circle cx="64" cy="116" r="3.5"/></g>
  <circle cx="64" cy="64" r="30" fill="url(#g)"/><circle cx="64" cy="64" r="7" fill="#fff"/>
</svg>
SVG

cat > "$APPS/jarvis.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Jarvis
Comment=Persönlicher Sprachassistent
Exec=$BIN/jarvis-start
Icon=$ICONS/jarvis.svg
Terminal=false
Categories=Utility;
DESKTOP
chmod +x "$APPS/jarvis.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1 || true

echo "Fertig. Im Startmenü unter \"Linux-Apps\" gibt es jetzt das Symbol \"Jarvis\" (ChromeOS-Suche: Jarvis)."
echo "Oder im Terminal:  jarvis-start   /   jarvis-stop"
