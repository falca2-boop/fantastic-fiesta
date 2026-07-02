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

## Sprachbefehle (Beispiele)

| Du sagst | JARVIS |
|----------|--------|
| „Verdiene 500 Euro" | setzt Ziel + Vorschlag |
| „Plan zeigen" | zeigt alle Schritte |
| „Status" | nennt das aktuelle Ziel |
| „Hallo JARVIS" | Begrüßung |

## Dateien

- `index.html` — Layout, HUD, Ziel-Panel, Dialog, Steuerung.
- `orb.js` — Canvas-Animation des Orbs (`window.Orb` API).
- `jarvis.js` — Spracherkennung, Sprachausgabe, Ziel- & Dialoglogik.

## Hinweis

Die „Geld-verdienen"-Logik ist aktuell ein **Demo-Assistent**: JARVIS erkennt das Ziel
und formuliert einen Plan, führt aber keine echten Transaktionen aus. Das Interface ist
so aufgebaut, dass echte Aktionen (z. B. n8n-Workflows, APIs) später leicht angebunden
werden können — die Zielverarbeitung sitzt gebündelt in `respond()` in `jarvis.js`.
