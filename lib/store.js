/**
 * Einfacher JSON-Speicher für JARVIS-Daten.
 * Schreibt atomar (temp-Datei → rename) damit keine korrupten Dateien entstehen.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DATA_DIR = process.env.DATA_DIR ?? './data';
const FILE = path.join(DATA_DIR, 'store.json');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { tasks: [], notes: [], reminders: [], memory: {} };
  }
}

function save(data) {
  ensureDir();
  const tmp = FILE + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

export function getState() {
  return load();
}

export function withStore(fn) {
  const data = load();
  const result = fn(data);
  save(data);
  return result;
}
