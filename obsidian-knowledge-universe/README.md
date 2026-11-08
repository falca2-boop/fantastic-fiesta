# Knowledge Universe (Obsidian-Plugin)

Dein Vault als lebendiges 3D-Universum: jede Notiz ein leuchtender Knoten, jeder Link eine Verbindung,
umgeben von tausenden Partikeln und feinen Linien, durch die Lichtimpulse wandern. Kein Nachbau des normalen
Graph-Views, sondern eine eigene Three.js/WebGL-Darstellung.

- **Echte Daten:** liest alle Markdown-Notizen, Wikilinks `[[…]]`, Markdown-Links, Tags (inline und Frontmatter), Frontmatter und Backlinks.
- **Live:** neue, geänderte, umbenannte oder gelöschte Notizen aktualisieren die Ansicht nach kurzer Ruhe (1,5 s). Die Szene springt dabei nicht, bestehende Knoten behalten ihre Positionen.
- **Layout:** 3D-Kräfte-Simulation (Barnes-Hut). Stark vernetzte Notizen liegen innen, wenig vernetzte außen, zusammengehörige bilden Cluster mit eigener Farbe. Verwaiste Notizen gruppieren sich nach Ordner.
- **Leistung:** Positionen entstehen auf der Grafikkarte (eine Knoten-Textur, kein Pro-Frame-Update der Partikel), 4 Draw Calls plus Bloom, Auflösung und Partikelzahl passen sich dem Rechner an.

## Installation

Voraussetzung: Obsidian ab 1.4 und, falls du selbst bauen willst, Node.js ab 18.

**Variante A: mit Skript** (Linux/macOS; unter Windows Variante B)

```bash
cd obsidian-knowledge-universe
./install.sh "/pfad/zu/deinem/Vault"
```

Zum Ausprobieren in einem leeren Vault: `./demo-notes.sh "/pfad/zu/deinem/Vault"` legt 75 verlinkte Demo-Notizen
im Ordner `Knowledge-Universe-Demo` an (zum Entfernen den Ordner löschen).

**Variante A2: alles automatisch** (Linux/Chromebook): `./activate.sh "/pfad/zu/deinem/Vault"` installiert das Plugin, schaltet es im
Vault ein, schließt Obsidian, sorgt dafür, dass beim Start nur dieser Vault öffnet, und startet Obsidian neu.
Danach genügt Strg + P → „Knowledge Universe öffnen".

**Variante B: von Hand**

1. Ordner `DEIN_VAULT/.obsidian/plugins/knowledge-universe/` anlegen.
2. Die Dateien `main.js`, `manifest.json` und `styles.css` aus diesem Ordner hineinkopieren.
3. In Obsidian: *Einstellungen → Community-Plugins* → Sicherheitsmodus ausschalten → **Knowledge Universe** aktivieren.

Öffnen: Ribbon-Symbol (Orbit) links oder Befehlspalette → **Knowledge Universe öffnen**.

### Selbst bauen

```bash
cd obsidian-knowledge-universe
npm install
npm run build      # prüft TypeScript, bündelt Three.js in main.js
npm test           # Tests für Parser, Cluster und Layout
npm run dev        # baut bei Änderungen neu (Entwicklung)
```

Ende-zu-Ende-Test im Browser (echtes Plugin gegen einen Nachbau der Obsidian-API, braucht Playwright): `npm run plugin-harness`, dann `node dev/e2e-plugin.mjs`.

Ohne Obsidian ausprobieren: `npm run harness`, dann `dev/harness.html` über einen lokalen Webserver öffnen
(zeigt einen künstlichen Vault; `?n=2000&q=low` ändert Größe und Qualität).

## Bedienung

| Aktion | Wirkung |
|---|---|
| Linke Maustaste ziehen | Drehen |
| Mausrad | Zoomen |
| Rechte Maustaste ziehen | Verschieben |
| Hover über Knoten | Knoten und Nachbarn leuchten, der Rest dimmt, Tooltip |
| Klick auf Knoten | Notiz öffnen (Standard: geteilte Ansicht). Klick auf einen Tag-Ring filtert nach dem Tag |
| Doppelklick auf Knoten | Detailkarte: Tags, Eigenschaften, Backlinks, ausgehende Links |
| Klick ins Leere | Auswahl aufheben |

Oben links stehen Titel, Anzahl Notizen, Verbindungen und Tags. Oben rechts: **Suche** (unscharf; Pfeiltasten und Enter fliegen zur Notiz, alle Treffer leuchten),
**Filter** (nach Tag, Ordner, ohne Verwaiste; die Zahlen zeigen „sichtbar / gesamt“) und **Einstellungen**.
Unten: Zoom, Ansicht zurücksetzen, Pause/Play, Vollbild.

## Einstellungen

Auch unter *Einstellungen → Knowledge Universe*.

| Einstellung | Bedeutung |
|---|---|
| Qualität | Automatisch, Niedrig (~3.000 Partikel), Mittel (~6.500), Hoch (~10.000). Automatisch wählt nach Rechner und senkt bei Rucklern erst die Auflösung, dann die Partikelzahl, dann den Bloom |
| Leuchten | Stärke des Bloom-Effekts (0 = aus) |
| Rotationsgeschwindigkeit | 0 = keine Drehung |
| Lichtimpulse | Impulse auf den Verbindungen |
| Neuronales Geflecht | Feine Zusatzlinien; abschalten spart Leistung |
| Tags als Knoten | Tags mit mindestens 2 Notizen werden zu Ringen, die ihre Notizen bündeln (höchstens 40) |
| Verwaiste Notizen | Notizen ohne jeden Link anzeigen |
| Ordner ausschließen | Kommagetrennt, z. B. `Templates, 40-ARCHIVE` |
| Notiz öffnen in | Geteilte Ansicht, neuer Tab oder neues Fenster |

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/main.ts` | Plugin: Ansicht, Ribbon, Befehl, Einstellungen |
| `src/GraphView.ts` | Obsidian-`ItemView`: verbindet Vault, Renderer und Oberfläche, hört auf Vault-Änderungen |
| `src/VaultParser.ts` | Vault → Graph (Notizen, Links, Backlinks, Tags, Frontmatter) |
| `src/GraphLayout.ts` | Cluster-Erkennung (Label-Propagation) und 3D-Kräfte-Layout (Barnes-Hut-Oktalbaum) |
| `src/GeometryBuilder.ts` | GPU-Puffer: Knoten, Partikelwolken, Nebel, Verbindungen, Geflecht |
| `src/shaders.ts` | Vertex-/Fragment-Shader (Bewegung, Glühen, Lichtimpulse, Fokus, Tiefennebel) |
| `src/GraphRenderer.ts` | Three.js-Szene, OrbitControls, Bloom, Auswahl per Maus, Kameraflug, Leistungsüberwachung, Aufräumen |
| `src/UniverseUI.ts` | Oberfläche: Titel, Suche, Filter, Einstellungen, Zoomleiste, Detailkarte |
| `styles.css` | Gestaltung (alle Klassen beginnen mit `ku-`) |

Farben: Electric Orange, Neon Pink, Magenta, Cyan, Violett, Gold (`PALETTE` in `GeometryBuilder.ts`).

## Hinweise und Grenzen

- Benötigt WebGL 2. Fehlt es ganz, zeigt die Ansicht eine Meldung mit dem Grund.
- **Ohne Grafikbeschleunigung** (z. B. Obsidian als Linux-App auf einem Chromebook, WebGL läuft dann auf dem Prozessor) erkennt das Plugin das und startet im Modus „Minimal“: halbe Auflösung, ca. 1.500 Partikel, kein Bloom, 24 Bilder pro Sekunde. Ein Hinweis unten links erklärt das. Unter *Einstellungen → Qualität* lässt sich das ändern.
- Fehler beim Start erscheinen als Text in der Ansicht und in der Entwicklerkonsole (Strg + Umschalt + I).
- Sehr große Vaults (mehrere Tausend Notizen): die Simulation formt das Universum live über einige Sekunden. Qualität „Niedrig“ hilft auf schwächeren Rechnern.
- Nicht aufgelöste Links (auf Notizen, die es noch nicht gibt) werden nicht dargestellt.
- Dateien außer Markdown (Bilder, PDFs) sind keine Knoten.
- Das Plugin verändert keine Notizen. Es liest nur.
