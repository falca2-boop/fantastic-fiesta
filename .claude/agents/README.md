# Claude-Code-Agenten für dieses Projekt

Diese Helfer sind Unter-Agenten für Claude Code (nicht die Jarvis-Agenten im Programm). Claude Code lädt sie beim Start einer Sitzung in diesem Ordner und setzt sie bei passenden Aufgaben selbst ein, oder du sagst: „Lass den jarvis-tester laufen“.

| Agent | Aufgabe |
|---|---|
| `jarvis-tester` | `npm test` und Browser-Tests ausführen, Ergebnis melden |
| `jarvis-reviewer` | Änderungen auf Fehler und Projektregeln prüfen |
| `jarvis-doku` | README, SETUP und `.env.example` aktuell halten |

Neue Agenten: eine Datei `<name>.md` hier anlegen (Kopf mit `name`, `description`, `tools`, `model`, danach die Anweisung).
