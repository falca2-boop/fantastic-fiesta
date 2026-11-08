#!/usr/bin/env bash
# Installiert das Plugin in einen Obsidian-Vault:   ./install.sh "/pfad/zum/Vault"
set -euo pipefail

VAULT="${1:-}"
if [ -z "$VAULT" ]; then
  echo "Aufruf: ./install.sh \"/pfad/zum/Vault\"" >&2
  exit 1
fi
if [ ! -d "$VAULT" ]; then
  echo "Ordner nicht gefunden: $VAULT" >&2
  exit 1
fi
if [ ! -d "$VAULT/.obsidian" ]; then
  echo "Dort gibt es keinen Ordner .obsidian. Das ist kein Obsidian-Vault (oder er wurde noch nie in Obsidian geöffnet)." >&2
  echo "Öffne den Ordner einmal in Obsidian (\"Ordner als Vault öffnen\") und starte dieses Skript erneut." >&2
  exit 1
fi

cd "$(dirname "$0")"
if [ ! -f main.js ]; then
  echo "main.js fehlt, baue das Plugin ..."
  npm install
  npm run build
fi

DEST="$VAULT/.obsidian/plugins/knowledge-universe"
mkdir -p "$DEST"
cp main.js manifest.json styles.css "$DEST/"
echo "Installiert in: $DEST"
echo "Jetzt in Obsidian: Einstellungen → Community-Plugins → (Sicherheitsmodus aus) → \"Knowledge Universe\" aktivieren."
