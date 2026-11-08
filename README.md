# JARVIS

Persönlicher Sprachassistent mit eigenem Server. Du sagst **„Hey Jarvis"**, er hört zu, antwortet und
erledigt Dinge für dich (Anrede: Augustin, einstellbar).

- **Websuche** (live), **Aufgaben**, **Notizen**, **Erinnerungen** (er spricht sie zur Zeit aus), **Gedächtnis** über dich, **Tagesplan**
- **KI-Anbieter:** Claude (Anthropic) oder Google Gemini (AI Studio, kostenloser Tarif möglich). Gewählt wird über `JARVIS_PROVIDER` oder automatisch nach dem gesetzten Key.
- **Server-Backend (Node, keine Abhängigkeiten):** Der API Key liegt nur auf dem Server, nie im Browser.
  Daten liegen in `data/store.json` und sind auf jedem Gerät dieselben.
- **E-Mail / Kalender / Notion** über einen optionalen n8n-Webhook (`N8N_WEBHOOK_URL`). Der Workflow muss die
  Aktionen (`send_email`, `create_event` …) selbst ausführen. JARVIS fragt vor dem Senden nach.

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

## Obsidian

Mit `OBSIDIAN_VAULT_DIR=/pfad/zu/deinem/Vault` speichert JARVIS Notizen und Gedächtnis als Markdown in deinem Vault:

- `Jarvis/Notizen/<Datum> <Titel>.md`: eine Datei pro Notiz. Eigene Dateien in diesem Ordner liest er mit.
- `Jarvis/Gedächtnis.md`: ein Fakt pro Listenpunkt. Bearbeitest du die Datei, gilt beim nächsten Gespräch deine Fassung.

Bestehende Fakten werden beim ersten Start in die Datei übernommen; alte Notizen aus `store.json` bleiben dort liegen.
Aufgaben und Erinnerungen bleiben in `data/store.json`. Jarvis muss auf demselben Rechner laufen wie der Vault (oder der Vault dorthin synchronisiert werden).
Mit `OBSIDIAN_SUBFOLDER=00-INBOX/Jarvis` legst du einen anderen Unterordner statt `Jarvis` fest (nur relative Pfade).
Ohne die Variable ändert sich nichts.

## Starten (lokal)

Einsteiger-Anleitung mit Einrichtungsassistent: [SETUP.md](SETUP.md) (`npm run setup`). Kurzfassung:

Voraussetzung: Node.js ab Version 20 (`node --version`).

```bash
npm run setup            # fragt die Werte ab und schreibt .env (oder .env.example kopieren und von Hand ausfüllen)
npm start                # → http://127.0.0.1:8000 in Chrome oder Edge
```

Das Mikrofon funktioniert auf `localhost` und über `https://`.

## Beim Öffnen: Begrüßung und sofort zuhören

Öffnest du Jarvis, sagt er sofort die Anrede (`JARVIS_ADDRESS`, z. B. „Hey Boss", sonst `JARVIS_USER_NAME`) und hört gleich zu. Der erste Befehl braucht kein „Hey Jarvis". Voraussetzung ist, dass Chrome für die Seite **Mikrofon** und **Ton** erlaubt (Schloss-Symbol → Website-Einstellungen). Sperrt Chrome den Ton ohne Klick, erscheint ein Hinweis, das Zuhören läuft trotzdem, und die Begrüßung folgt beim ersten Klick. Test: `node test/e2e/greeting.mjs` (braucht Playwright).

## Ein Klick statt Befehle (Linux/Chromebook)

`bash scripts/install-launcher.sh` legt ein **Jarvis**-Symbol im Startmenü an (Linux-Apps). Ein Klick startet Jarvis, falls er nicht läuft, und öffnet ihn im Browser (Port 8001). Der Key und alle Einstellungen kommen aus der `.env`. Im Terminal gehen auch `jarvis-start` und `jarvis-stop`.

## „Hey Jarvis" oder zweimal klatschen öffnet Jarvis (Linux/Chromebook)

`bash scripts/install-clap.sh` richtet einen Hintergrunddienst ein. Er hört auf **„Hey Jarvis"** und/oder **zweimal klatschen** und startet dann Jarvis und öffnet ihn im Browser, **falls die Jarvis-Seite nicht schon offen ist** (der Server merkt sich die letzte Abfrage der Oberfläche).

- **Auslöser wählen:** `JARVIS_TRIGGER=wake bash scripts/install-clap.sh` (nur „Hey Jarvis"), `clap` (nur Klatschen), Standard `both`. Später ändern: in `~/.config/systemd/user/jarvis-clap.service`, dann `systemctl --user daemon-reload && systemctl --user restart jarvis-clap`.
- **Datenschutz:** Das Audio wird nur im Arbeitsspeicher ausgewertet, nichts wird gespeichert oder gesendet, es gibt keine Cloud und kein Konto. ChromeOS zeigt, solange das Mikrofon genutzt wird, ein Mikrofon-Symbol.
- **Wake-Word:** `scripts/wake-worker.py` nutzt die offenen openWakeWord-Modelle (Modell „hey_jarvis") mit `onnxruntime` und `numpy` in einer eigenen Umgebung unter `~/.local/share/jarvis/wake-env` (ca. 160 MB, braucht ca. 4 % eines Prozessorkerns). Schwelle: `WAKE_THRESHOLD` (Standard 0,6; höher = weniger Fehlauslösungen), Sperrzeit nach einem Treffer 5 Sekunden. Die Modelle sind auf Englisch trainiert; „Hey Jarvis" mit deutscher Aussprache wird erfahrungsgemäß erkannt, aber nicht immer so zuverlässig.
- **Klatschen:** Zwei kurze, scharfe Knalle im Abstand von 0,18 bis 0,9 Sekunden. Sprache, Musik, einzelne Geräusche und Applaus (drei und mehr) lösen nichts aus. Empfindlichkeit: `CLAP_SENSITIVITY` (1 bis 10, Standard 6).
- **Voraussetzung:** ChromeOS → Einstellungen → Entwickler → Linux → Mikrofon erlauben (danach Linux neu starten). Das Programm hört nur, solange Linux läuft.
- **Testen:** `node scripts/clap-listener.js --test` zeigt live einen Pegel und meldet Treffer, ohne Jarvis zu starten.
- **Ausschalten:** `systemctl --user disable --now jarvis-clap`.

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
| `lib/env.js` | Liest `.env` beim Start (ohne Zusatzpaket, auch unter Windows) |
| `scripts/setup.js` | Einrichtungsassistent (`npm run setup`) |
| `lib/gemini.js` | Gemini-Anbindung (Werkzeug-Umwandlung, Websuche über Google) |
| `lib/vault.js` | Obsidian-Anbindung (Notizen, Gedächtnis als Markdown) |
| `lib/mail.js` | IMAP-Überwachung, Filter, Anruf (Twilio) und Push (ntfy) |
| `public/` | Oberfläche: Dashboard, Neural-Pulse-Animation (`neural.js`), Spracherkennung („Hey Jarvis"), Sprachausgabe |

Einschränkungen: Spracherkennung und -ausgabe nutzen die Browser-Funktionen (Chrome/Edge); Erinnerungen werden
gesprochen, solange ein Tab offen ist, sonst beim nächsten Öffnen nachgeholt. Der Speicher ist für **einen** Nutzer ausgelegt.

## Obsidian-Plugin: Knowledge Universe

Im Ordner [`obsidian-knowledge-universe/`](obsidian-knowledge-universe/README.md) liegt ein eigenständiges Obsidian-Plugin, das den Vault als 3D-Partikel-Universum darstellt (Three.js). Installation und Bedienung stehen dort.


## Welt-Ansicht (Nachrichten, Livestream, Weltkugel)

Im Kopf von Jarvis führt der Knopf **Welt** (oder „Hey Jarvis, zeig die Weltkugel“) zu `/welt.html`. Die Jarvis-Kugel auf der Startseite bleibt unverändert.

- **Weltkugel** (realistische Erde, lokal mitgeliefert, drehbar, Region-Knöpfe Welt/Europa/Ukraine/Nahost): cyanfarbene Punkte sind Live-Cams, rote Punkte sind **Krisenmeldungen der letzten 24 Stunden** (GDELT, öffentlich, ohne Schlüssel, alle 10 Minuten aktualisiert). Klick auf einen Punkt zeigt Details und Quellen.
- **3D:** Die Kugel ist eine echte 3D-Kugel (mit der Maus drehen, mit dem Rad zoomen). Der Regler **3D-Höhe** (oben links) hebt Relief, Kontinentflächen und die Säulen der Krisenmeldungen an (0 = flach). Darstellung: Satellit, Nacht (Stadtlichter) oder Dunkel.
- **Kontinente:** Alle sieben Kontinente sind als leicht erhabene, farbige Flächen mit Ländergrenzen und Beschriftung auf der Kugel (Knopf pro Kontinent, Klick auf eine Fläche zeigt Größe und Länder, "Kontinente" lässt sich ausschalten). Daten: `public/world/continents.json` (Natural Earth über world-atlas, per `scripts/build-continents.mjs` erzeugt). „Hey Jarvis, zeig mir Afrika auf der Weltkugel“ funktioniert ebenfalls.
- **Live-Cams:** Mit `YOUTUBE_API_KEY` (kostenlos) sucht Jarvis beim Klick automatisch ein **gerade laufendes, einbettbares** Live-Video zum Ort (Ergebnis 3 Stunden zwischengespeichert). Ohne Schlüssel öffnet der Knopf die YouTube-Live-Suche. Eigene Orte oder feste Cams: `public/world/cams.json` (`"youtube": "<Video-ID>"`).
- **Livestream:** Euronews, DW, France 24, Sky News, Al Jazeera (offizielle YouTube-Live-Kanäle), Außerdem geht jeder eigene YouTube-Link.
- **Schlagzeilen:** DW, Tagesschau, BBC World, Al Jazeera (RSS, alle 5 Minuten). Jarvis kann sie auch vorlesen: „Was gibt es Neues in der Ukraine?“

Bibliotheken liegen unter `public/vendor/` (globe.gl, three.js, NASA-Texturen; MIT). Test: `node test/e2e/welt.mjs`.
