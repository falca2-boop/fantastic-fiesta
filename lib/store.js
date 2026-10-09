import fs from 'node:fs';
import path from 'node:path';

const empty = () => ({ tasks: [], notes: [], reminders: [], facts: [], goal: null, history: [], summary: '', jobs: [] });

/**
 * JSON-Speicher für genau einen Nutzer. Schreibt atomar in eine Datei und,
 * wenn konfiguriert, zusätzlich in eine Upstash-Redis-Datenbank (REST). Die Datenbank überlebt
 * Neustarts und Deploys auch dort, wo das Dateisystem flüchtig ist (z. B. Render Free).
 */
export class Store {
  constructor(file, { remote = null, fetchFn = fetch, key = 'jarvis:store', debounceMs = 1000 } = {}) {
    this.file = file;
    this.remote = remote;          // { url, token }
    this.fetchFn = fetchFn;
    this.key = key;
    this.debounceMs = debounceMs;
    this.timer = null;
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

  async command(...args) {
    const res = await this.fetchFn(this.remote.url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this.remote.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error('Datenbank HTTP ' + res.status);
    return (await res.json()).result;
  }

  /** Beim Start: Stand aus der Datenbank laden. Ist sie leer (erster Lauf), wird der lokale Stand hochgeladen. */
  async init() {
    if (!this.remote) return;
    try {
      const raw = await this.command('GET', this.key);
      if (raw) { this.data = { ...empty(), ...JSON.parse(raw) }; this.writeFile(); }
      else await this.push();
    } catch (err) {
      console.warn('Datenbank beim Start nicht erreichbar, nutze lokalen Stand:', err.message);
    }
  }

  writeFile() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  save() {
    this.writeFile();
    if (!this.remote) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.push().catch(() => {}); }, this.debounceMs);
    this.timer.unref?.();
  }

  async push() {
    try { await this.command('SET', this.key, JSON.stringify(this.data)); }
    catch (err) { console.warn('Speichern in der Datenbank fehlgeschlagen:', err.message); throw err; }
  }

  /** Vor dem Beenden: ausstehende Änderungen sofort schreiben. */
  async flush() {
    if (!this.remote || !this.timer) return;
    clearTimeout(this.timer); this.timer = null;
    await this.push().catch(() => {});
  }
}
