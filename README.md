# J.A.R.V.I.S

Persönlicher Sprachassistent im Iron-Man-Stil.  
Du sagst **„Hey Jarvis"**, er hört zu, denkt nach und antwortet – per Sprache und Text.

## Features

- **Wake-Word** – sag „Hey Jarvis" und sprich; kein Knopfdrücken nötig
- **Orb-Klick** – alternativ: auf den animierten Orb klicken → Push-to-Talk
- **Claude-Agent** mit Werkzeugen: Aufgaben · Notizen · Erinnerungen · Gedächtnis · Uhrzeit
- **ElevenLabs-Stimme** (optional) mit automatischem Fallback auf Browser-TTS
- **Textfeld** für Eingaben ohne Mikrofon
- **Keine externen Abhängigkeiten** – läuft mit reinem Node 20+

## Schnellstart (lokal)

```bash
cp .env.example .env
# ANTHROPIC_API_KEY in .env eintragen
node server.js        # → http://127.0.0.1:8000
```

Mikrofon funktioniert auf `localhost` und über `https://`.  
Für Chrome/Edge: Spracherkennung direkt unterstützt.

## Umgebungsvariablen

| Variable | Beschreibung | Pflicht |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API Key | ✅ |
| `JARVIS_TOKEN` | Zugangs-Token (Pflicht wenn HOST ≠ localhost) | — |
| `JARVIS_USER_NAME` | Wie JARVIS dich nennt (Standard: Augustin) | — |
| `JARVIS_MODEL` | Claude-Modell (Standard: claude-sonnet-4-5) | — |
| `PORT` | Server-Port (Standard: 8000) | — |
| `HOST` | Bind-Adresse (Standard: 127.0.0.1; Hosting: 0.0.0.0) | — |
| `DATA_DIR` | Pfad für Daten-JSON (Standard: ./data) | — |
| `ELEVENLABS_API_KEY` | ElevenLabs API Key | — |
| `ELEVENLABS_VOICE_ID` | ElevenLabs Voice-ID | — |

## ElevenLabs-Stimme einrichten

1. Auf [elevenlabs.io](https://elevenlabs.io) eine Stimme auswählen → **Voice Library** → zur eigenen Bibliothek hinzufügen → **ID kopieren**
2. API Key unter *Developers → API Keys* anlegen
3. Beide Werte in `.env` eintragen – fertig

Fällt ElevenLabs aus (kein Guthaben, Fehler), spricht JARVIS automatisch mit der Browser-TTS weiter.

## Hosting (Render, Railway, Fly.io …)

```
ANTHROPIC_API_KEY=...
JARVIS_TOKEN=<langer Zufallswert>  # openssl rand -hex 24
HOST=0.0.0.0
```

Persistentes Volume auf `/data` einhängen, damit Aufgaben und Notizen einen Neustart überleben.  
Ein `Dockerfile` liegt bei.

## Entwicklung

```bash
node --test test/jarvis.test.js
```

| Datei | Aufgabe |
|---|---|
| `server.js` | HTTP-Server, Auth, Routen |
| `lib/agent.js` | Claude-Agentic-Loop, Konversationsverlauf |
| `lib/tools.js` | Aufgaben, Notizen, Erinnerungen, Gedächtnis, Zeit |
| `lib/store.js` | Atomarer JSON-Speicher |
| `lib/voice.js` | ElevenLabs TTS (Server-seitig) |
| `public/index.html` | UI-Shell |
| `public/app.js` | Frontend: Login, Mic, SR, Chat, TTS |
| `public/orb.js` | Canvas-Orb-Animation |
