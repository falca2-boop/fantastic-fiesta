# JARVIS

Persönlicher Sprachassistent mit eigenem Server. Du sagst **„Hey Jarvis"**, er hört zu, antwortet und
erledigt Dinge für dich (Anrede: Augustin, einstellbar).

- **Websuche** (live), **Aufgaben**, **Notizen**, **Erinnerungen** (er spricht sie zur Zeit aus), **Gedächtnis** über dich, **Tagesplan**
- **Server-Backend (Node, keine Abhängigkeiten):** Der Anthropic API Key liegt nur auf dem Server, nie im Browser.
  Daten liegen in `data/store.json` und sind auf jedem Gerät dieselben.
- **E-Mail / Kalender / Notion** über einen optionalen n8n-Webhook (`N8N_WEBHOOK_URL`). Der Workflow muss die
  Aktionen (`send_email`, `create_event` …) selbst ausführen. JARVIS fragt vor dem Senden nach.

## Push aufs Handy bei wichtigen E-Mails

JARVIS prüft dein Postfach per IMAP (GMX, web.de, Outlook u. a.) und schickt bei **wichtigen** neuen Mails eine
laute Push-Nachricht über [ntfy](https://ntfy.sh). Er liest nur Absender und Betreff, nie den Mail-Text.

1. Im Postfach IMAP freischalten (GMX/web.de: *Einstellungen → POP3/IMAP*).
2. Auf dem Handy die App **ntfy** installieren und ein Thema mit einem langen Zufallsnamen abonnieren. In der App für dieses Thema die Priorität „dringend" erlauben.
3. In Render (oder `.env`) setzen: `IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD`, `NTFY_TOPIC` (siehe `.env.example`).
4. Sag JARVIS, was wichtig ist: *„Melde mich bei Mails vom Finanzamt und mit ‚dringend' im Betreff."*

Alte Mails lösen nichts aus, nur Mails, die nach dem Start eintreffen. Ohne Filter gibt es keine Meldung.
Wer das Thema kennt, kann mitlesen, deshalb den Namen geheim halten. Betreff und Absender laufen über den ntfy-Server;
mit `MAIL_ALERT_INCLUDE_SUBJECT=false` enthält die Meldung keinen Betreff.
Hinweis: Outlook.com/Microsoft 365 erlauben Passwort-Anmeldung per IMAP oft nicht mehr.

## Starten (lokal)

Voraussetzung: Node.js ab Version 20 (`node --version`).

```bash
cp .env.example .env     # ANTHROPIC_API_KEY eintragen
set -a; . ./.env; set +a
npm start                # → http://127.0.0.1:8000 in Chrome oder Edge
```

Das Mikrofon funktioniert auf `localhost` und über `https://`.

## Im Netz betreiben (z. B. Render, Railway, Fly.io)

Der Server braucht einen dauerhaft laufenden Node-Prozess, deshalb reicht Vercel/GitHub Pages nicht.
Es liegt ein `Dockerfile` bei.

1. Dienst aus diesem Repo anlegen (Docker oder `npm start`).
2. Umgebungsvariablen setzen: `ANTHROPIC_API_KEY`, **`JARVIS_TOKEN`** (langer Zufallswert), `HOST=0.0.0.0`.
3. Ein persistentes Volume auf `/data` (bzw. `DATA_DIR`) einhängen, sonst gehen Aufgaben bei Neustart verloren.
4. Adresse öffnen, Token eingeben, Mikrofon erlauben.

Der Server startet **nicht**, wenn er von außen erreichbar ist und `JARVIS_TOKEN` fehlt.

## Entwicklung

```bash
npm test
```

| Datei | Aufgabe |
|---|---|
| `server.js` | HTTP-Server, Token-Prüfung, Routen `/api/chat`, `/api/state`, `/api/poll`, `/api/health` |
| `lib/agent.js` | Claude-Schleife mit Werkzeugen, Systemprompt |
| `lib/tools.js` | Werkzeuge (Aufgaben, Notizen, Erinnerungen, Gedächtnis, n8n) |
| `lib/store.js` | JSON-Speicher |
| `lib/mail.js` | IMAP-Überwachung, Filter, Push über ntfy |
| `public/` | Oberfläche: Orb, Spracherkennung („Hey Jarvis"), Sprachausgabe |

Einschränkungen: Spracherkennung und -ausgabe nutzen die Browser-Funktionen (Chrome/Edge); Erinnerungen werden
gesprochen, solange ein Tab offen ist, sonst beim nächsten Öffnen nachgeholt. Der Speicher ist für **einen** Nutzer ausgelegt.
