# JARVIS

Persönlicher Sprachassistent mit eigenem Server. Du sagst **„Hey Jarvis"**, er hört zu, antwortet und
erledigt Dinge für dich (Anrede: Augustin, einstellbar).

- **Websuche** (live), **Aufgaben**, **Notizen**, **Erinnerungen** (er spricht sie zur Zeit aus), **Gedächtnis** über dich, **Tagesplan**
- **Server-Backend (Node, keine Abhängigkeiten):** Der Anthropic API Key liegt nur auf dem Server, nie im Browser.
  Daten liegen in `data/store.json` und sind auf jedem Gerät dieselben.
- **E-Mail / Kalender / Notion** über einen optionalen n8n-Webhook (`N8N_WEBHOOK_URL`). Der Workflow muss die
  Aktionen (`send_email`, `create_event` …) selbst ausführen. JARVIS fragt vor dem Senden nach.

## Gespeicherte Seiten (Schnellzugriff)

JARVIS kennt Seiten, die du öffnen willst. Standardmäßig **World Monitor** (`worldmonitor.app`) und **Amazon** (`amazon.de`, mit Suche).
Sag *„Öffne World Monitor"* oder *„Such bei Amazon nach einer Kaffeemaschine"*: JARVIS stellt einen **Öffnen-Button** in den Verlauf
und versucht die Seite zusätzlich direkt in einem neuen Tab zu öffnen (Browser blockieren das manchmal, der Button funktioniert immer).
Im Panel rechts stehen alle gespeicherten Seiten als Links. Neue Seiten: *„Speichere die Seite https://de.wikipedia.org als Wikipedia mit Suche"*,
entfernen: *„Entferne Wikipedia"*. Erlaubt sind nur `http`- und `https`-Adressen. JARVIS öffnet Seiten nur, loggt sich dort aber nie ein
und kauft nichts.

## Hintergrundaufträge

Für längere Aufgaben startet JARVIS eine **Recherche im Hintergrund** und kehrt sofort zurück, du kannst weiterreden:
*„Such mir die besten Angebote für eine Kaffeemaschine unter 150 Euro raus."* Er recherchiert mit mehreren Websuchen
(Modell `JARVIS_RESEARCH_MODEL`, Standard Sonnet), speichert das Ergebnis als Notiz und meldet sich, sobald es fertig ist:
in der App (er liest eine Kurzfassung vor, den Text siehst du im Verlauf) und, wenn `NTFY_TOPIC` gesetzt ist, per Push aufs Handy.
Der Push nennt standardmäßig nur den Titel, nicht das Ergebnis (`JOB_PUSH_INCLUDE_RESULT=true` ändert das).
Es laufen höchstens 2 Aufträge gleichzeitig, jeder hat ein Zeitlimit von 5 Minuten. Fertige Aufträge kannst du später abrufen:
*„Was war das Ergebnis der Recherche?"*. Ein Neustart des Servers bricht laufende Aufträge ab.
Der Server muss dafür laufen, siehe „Wachbleiben" unten.

## Wachbleiben

Der kostenlose Render-Tarif schläft nach etwa 15 Minuten ohne Aufruf und stoppt dabei auch Mail-Überwachung und Hintergrundaufträge.
Ein bezahlter Tarif (Render *Starter* oder höher) schläft nicht. Alternativ hält ein Pinger wie UptimeRobot den Server wach:
HTTP-Monitor auf `https://<deine-adresse>/api/health` alle 5 Minuten.

## Gedächtnis

JARVIS merkt sich dauerhaft: Fakten über dich (von selbst, per `remember`), Aufgaben, Notizen, Erinnerungen und das Ziel.
Ältere Gespräche werden im Hintergrund zu einer kurzen **Zusammenfassung** verdichtet, die er in jedes Gespräch mitnimmt;
die letzten Nachrichten bleiben im Wortlaut. Das Panel rechts zeigt die zuletzt gemerkten Fakten. Sag *„Was weißt du über mich?"*,
*„Vergiss, dass ich …"* oder *„Merk dir, dass …"*.

Standardmäßig liegt alles in `data/store.json`. Auf Hosting mit flüchtigem Dateisystem (Render Free) ist das nach jedem Neustart leer.
Dort `UPSTASH_REDIS_REST_URL` und `UPSTASH_REDIS_REST_TOKEN` setzen (kostenlose Datenbank bei upstash.com). JARVIS lädt beim Start
daraus und schreibt jede Änderung nach. Ist die Datenbank nicht erreichbar, läuft er mit dem lokalen Stand weiter.

## Meldung bei wichtigen E-Mails (Anruf und/oder Push)

JARVIS prüft dein Postfach per IMAP (GMX, web.de, Outlook u. a.) und meldet **wichtige** neue Mails: per **Anruf**
(Twilio liest „Augustin, du hast eine wichtige E-Mail von …" vor) und/oder per **Push** (ntfy). Er liest nur Absender
und Betreff, nie den Mail-Text. Alte Mails lösen nichts aus, nur Mails, die nach dem Start eintreffen. Ohne Filter gibt es keine Meldung.
Was wichtig ist, sagst du ihm: *„Ruf mich an bei Mails vom Finanzamt und mit ‚dringend' im Betreff."*

**Gemeinsam:** Im Postfach IMAP freischalten (GMX/web.de: *Einstellungen → POP3/IMAP*). In Render oder `.env`
`IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD` setzen (siehe `.env.example`). Outlook.com/Microsoft 365 erlauben Passwort-Anmeldung per IMAP oft nicht mehr.

**Anruf (Twilio):**
1. Konto auf twilio.com anlegen, eine Telefonnummer mit Sprachfunktion kaufen (`TWILIO_FROM`).
2. Account SID und Auth Token aus der Twilio-Konsole in `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`, deine Handynummer im Format `+49…` in `CALL_TO`.
3. Im Testzugang ruft Twilio nur verifizierte Nummern an. Verifiziere dein Handy in der Konsole oder wechsle auf ein bezahltes Konto.
4. Es gibt höchstens einen Anruf pro Zeitfenster (`MAIL_CALL_MIN_INTERVAL_SECONDS`, Standard 5 Minuten). Mehrere Mails in einem Durchlauf werden in einem Anruf zusammengefasst. Mails, die in die Pause fallen, melden nur Push (falls aktiv), sonst gar nicht.
5. Kosten: pro Anrufminute plus Nummer, auch bei Fehlalarmen. Halte die Filter eng.

**Push (ntfy):** App **ntfy** installieren, ein Thema mit langem Zufallsnamen abonnieren (`NTFY_TOPIC`), Priorität „dringend" erlauben.
Wer den Namen kennt, kann mitlesen. Betreff und Absender laufen über den ntfy-Server; `MAIL_ALERT_INCLUDE_SUBJECT=false` lässt den Betreff weg (gilt auch für den Anruf).

## Stimme (ElevenLabs)

Standardmäßig spricht JARVIS mit der Stimme deines Browsers. Mit einer ElevenLabs-Stimme klingt er natürlicher:

1. In ElevenLabs eine Stimme wählen (Voice Library) und zu **Meine Stimmen** hinzufügen. Dort bei der Stimme **ID kopieren**.
2. Einen API Key unter *Developers → API Keys* anlegen.
3. `ELEVENLABS_API_KEY` und `ELEVENLABS_VOICE_ID` setzen. Der Key bleibt auf dem Server; der Browser fragt nur `/api/speak` an.

Fällt die Stimme aus (kein Guthaben, Fehler), spricht JARVIS automatisch mit der Browser-Stimme weiter.
Jede Antwort verbraucht ElevenLabs-Guthaben (pro Zeichen); Texte sind auf 800 Zeichen begrenzt.

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
| `lib/store.js` | Speicher (Datei, optional Upstash-Redis) |
| `lib/jobs.js` | Hintergrund-Recherchen |
| `lib/mail.js` | IMAP-Überwachung, Filter, Anruf (Twilio) und Push (ntfy) |
| `public/` | Oberfläche: Orb, Spracherkennung („Hey Jarvis"), Sprachausgabe |

Einschränkungen: Spracherkennung und -ausgabe nutzen die Browser-Funktionen (Chrome/Edge); Erinnerungen werden
gesprochen, solange ein Tab offen ist, sonst beim nächsten Öffnen nachgeholt. Der Speicher ist für **einen** Nutzer ausgelegt.
