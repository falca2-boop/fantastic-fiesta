import fs from 'node:fs';
import path from 'node:path';

const empty = () => ({ tasks: [], notes: [], reminders: [], facts: [], goal: null, history: [] });

/** Einfacher JSON-Speicher für genau einen Nutzer. Schreibt atomar (tmp + rename). */
export class Store {
  constructor(file) {
    this.file = file;
    this.data = empty();
    if (file) this.load();
  }

  load() {
    try {
      this.data = { ...empty(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('Speicherdatei unlesbar, starte leer:', err.message);
    }
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
