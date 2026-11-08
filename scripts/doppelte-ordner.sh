#!/usr/bin/env bash
# Löscht Ordner im Home-Verzeichnis, die BYTE FÜR BYTE identisch mit einem anderen Ordner sind (immer bleibt eine Kopie).
# Ablauf: 1) prüfen, 2) Liste mit Größen zeigen, 3) einmal nachfragen, 4) löschen.
# Geändert/gelöscht wird nur, was als identisch bestätigt ist. Alles andere bleibt unberührt.
set -uo pipefail

ROOT="${DUP_HOME:-$HOME}"
cd "$ROOT" || exit 1

# Paare: "LÖSCHKANDIDAT|BEHALTEN". Der Kandidat wird nur gelöscht, wenn er mit dem zu behaltenden Ordner identisch ist.
PAIRS=()
for n in 00-INBOX 10-PROJEKTE 20-AREAS 30-RESOURCES 40-ARCHIVE 50-TEMPLATES 60-DASHBOARDS 70-DAILY; do
  PAIRS+=("$n|SecondBrain/$n")        # Original im Home-Ordner <-> Kopie im Vault; der Vault bleibt
done
PAIRS+=("JARVIS_ALT_BACKUP_20261103-162325|JARVIS_ALT_BACKUP_20261103-183126")   # älteres Backup <-> neueres
PAIRS+=("jarvis2|jarvis")
PAIRS+=("jarvis|JARVIS")

# Diese Ordner werden nie gelöscht, egal was passiert.
PROTECTED=("SecondBrain" "jarvis-neu" "Obsidian Vault" "Downloads" "Obsidian" ".config" ".local" ".ssh" "Documents")

is_protected() { local p; for p in "${PROTECTED[@]}"; do [ "$1" = "$p" ] && return 0; done; return 1; }
human() { du -sxh -- "$1" 2>/dev/null | cut -f1; }

echo "Prüfe auf identische Ordner in $ROOT (das kann einige Minuten dauern) ..."
echo
TODELETE=()
for pair in "${PAIRS[@]}"; do
  cand="${pair%%|*}"; keep="${pair##*|}"
  [ -d "$cand" ] && [ ! -L "$cand" ] || continue
  if is_protected "$cand"; then echo "übersprungen (geschützt): $cand"; continue; fi
  if [ ! -d "$keep" ]; then echo "behalten (Gegenstück fehlt):   $cand  (erwartet: $keep)"; continue; fi
  if timeout 600 diff -rq --no-dereference -- "$cand" "$keep" >/dev/null 2>&1; then
    echo "IDENTISCH:  $cand  ==  $keep    ($(human "$cand"))"
    TODELETE+=("$cand")
  else
    echo "UNTERSCHIED: $cand  !=  $keep    -> wird NICHT gelöscht"
  fi
done

echo
if [ "${#TODELETE[@]}" -eq 0 ]; then echo "Keine identischen Doppelte gefunden. Es wird nichts gelöscht."; exit 0; fi

echo "Diese Ordner würden gelöscht (die jeweilige Kopie bleibt erhalten):"
total=0
for d in "${TODELETE[@]}"; do
  kb=$(du -sxk -- "$d" 2>/dev/null | cut -f1); total=$((total + ${kb:-0}))
  echo "  - $d   ($(human "$d"))"
done
echo "Zusammen ca. $((total / 1024)) MB frei."
echo

if [ "${DUP_YES:-0}" = "1" ]; then ans=ja; else read -r -p "Wirklich löschen? Tippe ja und drücke Enter: " ans </dev/tty; fi
[ "$ans" = "ja" ] || { echo "Abgebrochen. Nichts wurde gelöscht."; exit 0; }

for d in "${TODELETE[@]}"; do
  case "$d" in ""|"/"|"."|".."|*"/.."*) echo "Sicherheitsstopp bei: $d"; continue;; esac
  # letzte Prüfung direkt vor dem Löschen
  pair=""; for p in "${PAIRS[@]}"; do [ "${p%%|*}" = "$d" ] && pair="$p"; done
  keep="${pair##*|}"
  if [ -d "$keep" ] && diff -rq --no-dereference -- "$d" "$keep" >/dev/null 2>&1; then
    rm -rf -- "$ROOT/$d" && echo "gelöscht: $d"
  else
    echo "nicht gelöscht (hat sich geändert): $d"
  fi
done
echo; df -h "$ROOT" | tail -1
