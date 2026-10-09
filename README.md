# JARVIS — Futuristisches Voice-Interface

Ein Iron-Man-artiges Sprachinterface mit einem großen, animierten, reaktiven **Orb**.
Du sprichst mit JARVIS und nennst ihm dein Ziel — zum Beispiel *„Verdiene 500 €"* —
und er bestätigt das Ziel und schlägt einen Plan vor.

![JARVIS Orb](https://img.shields.io/badge/interface-JARVIS-38d9ff)

## Features

- **Großer futuristischer Orb** — auf `<canvas>` gerendert, mit Glow, rotierenden
  Partikelringen und wellenförmigem Kern.
- **Reagiert live** auf deine Stimme: Der Orb pulsiert stärker, je lauter du sprichst
  (Mikrofon-Pegel über die Web Audio API).
- **Zustände**: Bereit · Höre zu · Verarbeite · Spreche — jeder mit eigener Animation.
- **Deutsche Spracherkennung** (Web Speech API) + **Sprachausgabe**.
- **Ziel-Erkennung**: erkennt Beträge wie „500 €" und setzt sie als aktives Ziel.
- **Texteingabe** als Fallback, falls kein Mikrofon / keine Spracherkennung verfügbar.

## Nutzung

Einfach `index.html` in **Chrome** oder **Edge** öffnen
(die Web Speech API wird von diesen Browsern am besten unterstützt).

Lokal starten (empfohlen, damit das Mikrofon freigegeben wird):

```bash
# eine der beiden Varianten
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Dann:
1. Auf den **Orb** oder das **Mikrofon-Symbol** klicken.
2. Sprich, z. B.: *„JARVIS, du sollst 500 Euro verdienen."*
3. JARVIS setzt das Ziel und schlägt Schritte vor. Sag *„Plan zeigen"* für Details.

## Was JARVIS für dich erledigt

JARVIS ist ein Agent mit Werkzeugen (Claude Tool-Use, läuft direkt im Browser):

| Du sagst | JARVIS tut |
|----------|-----------|
| „Was ist heute in den Nachrichten zu …?" | sucht live im Web und fasst zusammen |
| „Setz Milch kaufen auf meine Liste" | speichert eine Aufgabe (Panel rechts) |
| „Erinnere mich um 15 Uhr an den Anruf" | spricht die Erinnerung zur Zeit (Tab muss offen sein) |
| „Notiere: Idee für …" | speichert eine Notiz |
| „Merk dir, dass ich vegetarisch esse" | dauerhaftes Gedächtnis über den Nutzer |
| „Plan meinen Tag" | ordnet Aufgaben und Erinnerungen zu einem Tagesplan |
| „Mein Ziel ist 500 €" | setzt Ziel + Plan |

Alle Daten liegen im `localStorage` deines Browsers (keine Cloud).

### E-Mail / Kalender / Notion (optional)

Dafür braucht JARVIS einen n8n-Workflow. Lege eine `config.js` an (steht in `.gitignore`):

```js
window.JARVIS_CONFIG = {
  anthropicKey: 'sk-ant-...',          // optional, sonst Eingabe beim Start
  n8nWebhook: 'https://DEIN.n8n.cloud/webhook/jarvis-action'
};
```

JARVIS sendet `{action, details}` an den Webhook (z. B. `send_email`) und bestätigt
vorher den Inhalt mit dir. Der Workflow muss die Aktionen selbst implementieren.

## Dateien

- `index.html` — Layout, HUD, Ziel-Panel, Dialog, Steuerung.
- `orb.js` — Canvas-Animation des Orbs (`window.Orb` API).
- `jarvis.js` — Spracherkennung, Sprachausgabe, Ziel- & Dialoglogik.
