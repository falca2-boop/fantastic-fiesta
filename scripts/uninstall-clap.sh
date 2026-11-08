#!/usr/bin/env bash
# Entfernt das Zuhören im Hintergrund ("Hey Jarvis" / zweimal klatschen): Dienst stoppen und löschen, laufendes Programm beenden,
# Erkenner-Umgebung (~160 MB) löschen. Das Jarvis-Symbol und jarvis-start/jarvis-stop bleiben, Notizen und Jarvis selbst bleiben unberührt.
set -uo pipefail

UNIT="$HOME/.config/systemd/user/jarvis-clap.service"
VENV="${WAKE_VENV:-$HOME/.local/share/jarvis/wake-env}"

before=$(df -Pm "$HOME" | awk 'NR==2{print $4}')

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user disable --now jarvis-clap.service >/dev/null 2>&1 && echo "Dienst gestoppt und abgeschaltet." || echo "Kein laufender Dienst gefunden (ist in Ordnung)."
fi
[ -f "$UNIT" ] && rm -f "$UNIT" && echo "Dienstdatei gelöscht."
command -v systemctl >/dev/null 2>&1 && systemctl --user daemon-reload >/dev/null 2>&1

# von Hand gestartetes Programm beenden (nur das Hörprogramm, Muster passt nicht auf dieses Skript)
if pgrep -f "node .*clap-listener\.js" >/dev/null 2>&1; then pkill -f "node .*clap-listener\.js" && echo "Laufendes Hörprogramm beendet."; fi
if pgrep -f "wake-worker\.py" >/dev/null 2>&1; then pkill -f "wake-worker\.py" && echo "Wake-Word-Programm beendet."; fi

if [ -d "$VENV" ]; then
  rm -rf "$VENV" && echo "Erkenner-Umgebung gelöscht ($VENV)."
  rmdir "$(dirname "$VENV")" 2>/dev/null || true
fi

after=$(df -Pm "$HOME" | awk 'NR==2{print $4}')
echo
echo "Fertig. Freier Platz: ${before} MB -> ${after} MB (+$((after - before)) MB)."
echo "Das Jarvis-Symbol im Startmenü und die Befehle jarvis-start / jarvis-stop sind noch da."
