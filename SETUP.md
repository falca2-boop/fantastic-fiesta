# JARVIS einrichten (Schritt für Schritt)

## 1. Node.js installieren (einmalig)
Öffne ein Terminal (Windows: „Eingabeaufforderung" oder PowerShell, Mac: „Terminal") und tippe:

```bash
node --version
```

Steht dort `v20` oder höher, weiter mit Schritt 2. Sonst: von https://nodejs.org die „LTS"-Version installieren, Terminal neu öffnen und den Befehl wiederholen.

## 2. Jarvis herunterladen
Auf der GitHub-Seite des Repos: grüner Knopf **Code → Download ZIP**, entpacken. Dann im Terminal in den entpackten Ordner wechseln, z. B.:

```bash
cd Pfad/zum/Ordner
```

(Wer Git hat: `git clone` des Repos geht auch.)

## 3. Einrichten
```bash
npm install
npm run setup
```

Das Skript fragt dich nach: der KI (Google Gemini mit Key aus https://aistudio.google.com/apikey oder Anthropic Claude), dem Key (Pflicht), deinem Namen, dem Obsidian-Vault-Ordner, optional ElevenLabs und n8n. Alles Optionale darfst du mit Enter überspringen. Es schreibt die Datei `.env` für dich und prüft, ob der Key funktioniert.

## 4. Starten
```bash
npm start
```

Dann **Chrome oder Edge** öffnen: http://127.0.0.1:8000, Mikrofon erlauben, „Hey Jarvis" sagen.
Zum Beenden im Terminal `Strg + C`.

## Später ergänzen
Alles Weitere trägst du in der Datei `.env` ein (Vorlage mit Erklärungen: `.env.example`), danach Jarvis neu starten:
- **Mail-Alarm** (Push über die App ntfy oder Anruf über Twilio): siehe README, Abschnitt „Meldung bei wichtigen E-Mails".
- **Online betreiben**, damit er auch bei ausgeschaltetem Rechner läuft: siehe README, Abschnitt „Im Netz betreiben". Dort erreicht er deinen Obsidian-Vault nicht.

## Wenn etwas nicht klappt
- „API Fehler 401/403" (Anthropic oder Gemini): Der Key ist falsch. `npm run setup` nochmal ausführen.
- „Anthropic API Fehler 402/429": Kein Guthaben oder zu viele Anfragen. Guthaben unter console.anthropic.com prüfen.
- „Gemini-Limit erreicht": Der kostenlose Tarif hat Grenzen pro Minute und Tag. Kurz warten.
- Kein „Hey Jarvis" erkannt: Chrome oder Edge benutzen und das Mikrofon für die Seite erlauben.
- Kontrolle, was verbunden ist: http://127.0.0.1:8000/api/health im Browser öffnen.
