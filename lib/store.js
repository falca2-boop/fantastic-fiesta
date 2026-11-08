import fs from 'node:fs';
import path from 'node:path';
import { readFacts, writeFacts } from './vault.js';

const empty = () => ({ tasks: [], notes: [], reminders: [], facts: [], goal: null, history: [] });

/** Einfacher JSON-Speicher für genau einen Nutzer. Schreibt atomar (tmp + rename). */
export class Store {
  constructor(file, { vaultDir = null } = {}) {
    this.file = file;
    this.vaultDir = vaultDir;
    this.data = empty();
    if (file) { this.load(); if (this.dedupeReminders()) this.save(); }
    this.syncFacts();
  }

  /** Entfernt doppelte offene Erinnerungen (gleicher Text, gleiche Zeit). Gibt zurück, ob etwas entfernt wurde. */
  dedupeReminders() {
    const seen = new Set(); const before = this.data.reminders.length;
    this.data.reminders = this.data.reminders.filter((r) => {
      if (r.fired) return true;
      const k = r.at + '|' + String(r.text).trim().toLowerCase();
      if (seen.has(k)) return false; seen.add(k); return true;
    });
    return this.data.reminders.length !== before;
  }

  /** Mit Obsidian: Gedächtnis.md ist maßgeblich (du kannst sie bearbeiten). Gibt es sie noch nicht, wird sie aus dem Speicher angelegt. */
  syncFacts() {
    if (!this.vaultDir) return;
    const facts = readFacts(this.vaultDir);
    if (facts) this.data.facts = facts;
    else if (this.data.facts.length) writeFacts(this.vaultDir, this.data.facts);
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
