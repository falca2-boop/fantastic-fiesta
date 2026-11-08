#!/usr/bin/env bash
# Legt Demo-Notizen mit Links, Tags und Frontmatter an, damit das Universum etwas zeigt.
# Aufruf: ./demo-notes.sh "/pfad/zum/Vault"      Aufräumen: den Ordner "Knowledge-Universe-Demo" im Vault löschen.
set -euo pipefail
VAULT="${1:-}"
[ -n "$VAULT" ] && [ -d "$VAULT/.obsidian" ] || { echo "Aufruf: ./demo-notes.sh \"/pfad/zum/Vault\" (Ordner mit .obsidian)" >&2; exit 1; }
DIR="$VAULT/Knowledge-Universe-Demo"
mkdir -p "$DIR"

topics=("Jarvis" "Obsidian" "Finanzen" "Training" "Reise" "Musik")
tags=("ki" "organisation" "geld" "gesundheit" "urlaub" "kreativ")
per=12

for t in "${!topics[@]}"; do
  topic="${topics[$t]}"
  for i in $(seq 1 $per); do
    name="$topic $i"
    next=$(( i % per + 1 )); skip=$(( (i + 3) % per + 1 ))
    other_t=$(( (t + 1 + i % 5) % ${#topics[@]} ))
    {
      echo "---"
      echo "status: aktiv"
      echo "thema: $topic"
      echo "tags: [${tags[$t]}, demo]"
      echo "---"
      echo
      echo "Demo-Notiz $i zum Thema $topic."
      echo
      echo "Weiter mit [[$topic $next]] und [[$topic $skip]]."
      # Hubs: Notiz 1 jedes Themas wird oft verlinkt; manche Notizen verlinken in andere Themen
      [ "$i" -gt 1 ] && echo "Zurück zum Überblick: [[$topic 1]]."
      [ $(( i % 4 )) -eq 0 ] && echo "Siehe auch [[${topics[$other_t]} 1]]."
      echo
      echo "#${tags[$t]}"
    } > "$DIR/$name.md"
  done
done
# ein paar verwaiste Notizen
for n in "Lose Gedanken" "Einkaufsliste" "Idee für später"; do echo "Eine einzelne Notiz ohne Links." > "$DIR/$n.md"; done
echo "Fertig: $(ls "$DIR" | wc -l) Notizen in $DIR"
echo "Zum Entfernen: den Ordner Knowledge-Universe-Demo im Vault löschen."
