#!/usr/bin/env bash
# Richtet "Hey Jarvis" und/oder "zweimal klatschen" als Hintergrunddienst ein, der Jarvis öffnet (systemd, startet beim Anmelden automatisch).
# Einmal ausführen:  bash scripts/install-clap.sh
# Nur eins davon:    JARVIS_TRIGGER=wake bash scripts/install-clap.sh   (oder clap; Standard: both)
# Entfernen:         systemctl --user disable --now jarvis-clap
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
TRIGGER="${JARVIS_TRIGGER:-both}"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "Node.js nicht gefunden." >&2; exit 1; }

# 1) Aufnahmeprogramm
if ! command -v parecord >/dev/null 2>&1 && ! command -v arecord >/dev/null 2>&1; then
  echo "Installiere das Aufnahmeprogramm (pulseaudio-utils) ..."
  if [ "${CLAP_SKIP_APT:-0}" != "1" ]; then
    sudo -n apt-get install -y pulseaudio-utils || { echo; echo "Bitte einmal von Hand ausführen und danach dieses Skript noch einmal:  sudo apt install -y pulseaudio-utils"; exit 1; }
  fi
fi

# 1b) "Hey Jarvis": Erkenner installieren
case "$TRIGGER" in wake|both) bash "$DIR/scripts/install-wake.sh" ;; esac

# 2) Das Jarvis-Symbol / jarvis-start muss existieren
[ -x "$HOME/.local/bin/jarvis-start" ] || bash "$DIR/scripts/install-launcher.sh"

# 3) Dienst
UNITDIR="$HOME/.config/systemd/user"
mkdir -p "$UNITDIR"
cat > "$UNITDIR/jarvis-clap.service" <<UNIT
[Unit]
Description=Jarvis: zweimal klatschen oeffnet Jarvis

[Service]
ExecStart=$NODE $DIR/scripts/clap-listener.js
Restart=always
RestartSec=5
Environment=PATH=/usr/local/bin:/usr/bin:/bin:%h/.local/bin
Environment=JARVIS_PORT=8001
Environment=JARVIS_TRIGGER=$TRIGGER

[Install]
WantedBy=default.target
UNIT

if systemctl --user daemon-reload 2>/dev/null && systemctl --user enable --now jarvis-clap.service 2>/dev/null; then
  loginctl enable-linger "$USER" 2>/dev/null || true
  echo "Fertig. Der Dienst läuft und startet künftig von selbst."
else
  echo "Der systemd-Benutzerdienst ist hier nicht verfügbar. Du kannst das Programm so von Hand starten:"
  echo "  nohup $NODE $DIR/scripts/clap-listener.js >/dev/null 2>&1 &"
fi
echo
echo "Auslöser: $TRIGGER   (wake = Hey Jarvis, clap = zweimal klatschen, both = beides)"
echo "Mikrofon testen (zeigt live einen Pegel, startet Jarvis nicht):  node $DIR/scripts/clap-listener.js --test"
echo "Wichtig: ChromeOS-Einstellungen → Entwickler → Linux → Mikrofon erlauben (danach Linux neu starten)."
echo "Zu empfindlich oder zu unempfindlich? Umgebungsvariable CLAP_SENSITIVITY (1 bis 10, Standard 6) in der Datei $UNITDIR/jarvis-clap.service ändern."
