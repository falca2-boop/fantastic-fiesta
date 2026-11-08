#!/usr/bin/env bash
# Installiert den Wake-Word-Erkenner für "Hey Jarvis" in eine eigene Python-Umgebung (~150 MB, ohne scikit-learn/scipy).
set -euo pipefail

VENV="${WAKE_VENV:-$HOME/.local/share/jarvis/wake-env}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

avail_mb=$(df -Pm "$HOME" | awk 'NR==2{print $4}')
if [ "${avail_mb:-0}" -lt 450 ]; then
  echo "Zu wenig freier Platz: ${avail_mb} MB. Für die Installation werden etwa 300 MB gebraucht." >&2
  echo "Vergrößere das Linux-Laufwerk (ChromeOS Einstellungen → Entwickler → Linux → Laufwerksgröße) und versuche es noch einmal." >&2
  exit 1
fi

command -v python3 >/dev/null || { echo "python3 nicht gefunden." >&2; exit 1; }
mkdir -p "$(dirname "$VENV")"
if ! python3 -m venv "$VENV" 2>/dev/null; then
  echo "Installiere python3-venv ..."
  sudo -n apt-get install -y python3-venv >/dev/null || { echo "Bitte einmal von Hand ausführen:  sudo apt install -y python3-venv   und danach dieses Skript noch einmal." >&2; exit 1; }
  python3 -m venv "$VENV"
fi

echo "Installiere onnxruntime und numpy (das dauert 1 bis 3 Minuten) ..."
"$VENV/bin/pip" install -q --no-cache-dir --disable-pip-version-check onnxruntime numpy
"$VENV/bin/pip" install -q --no-cache-dir --disable-pip-version-check --no-deps openwakeword==0.4.0

# Prüfung: der Erkenner muss starten und "READY" melden (leeres Audio -> sofort wieder zu Ende)
if "$VENV/bin/python" "$DIR/scripts/wake-worker.py" < /dev/null 2>/dev/null | grep -q READY; then
  echo "Erkenner für \"Hey Jarvis\" ist installiert ($(du -sh "$VENV" | cut -f1))."
else
  echo "Der Erkenner startet nicht. Details:  $VENV/bin/python $DIR/scripts/wake-worker.py < /dev/null" >&2
  exit 1
fi
