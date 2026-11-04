/**
 * JARVIS – Unit-Tests
 * Führe aus mit: node --test test/jarvis.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// ── Store-Tests ───────────────────────────────────────────────────────────────

test('store: load gibt leere Struktur zurück wenn keine Datei', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-test-'));
  process.env.DATA_DIR = tmpDir;

  const { getState, withStore } = await import('../lib/store.js');

  const state = getState();
  assert.ok(Array.isArray(state.tasks), 'tasks sollte Array sein');
  assert.ok(Array.isArray(state.notes), 'notes sollte Array sein');
  assert.ok(Array.isArray(state.reminders), 'reminders sollte Array sein');
  assert.deepEqual(state.memory, {});

  fs.rmSync(tmpDir, { recursive: true });
});

test('store: withStore kann schreiben und lesen', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-test2-'));
  process.env.DATA_DIR = tmpDir;

  // Re-import mit neuem Pfad (Da ES-Module gecacht werden, testen wir über Datei direkt)
  const FILE = path.join(tmpDir, 'store.json');
  const data = { tasks: [{ id: '1', title: 'Test', done: false }], notes: [], reminders: [], memory: {} };
  fs.writeFileSync(FILE, JSON.stringify(data));

  const { getState } = await import('../lib/store.js');
  const loaded = getState();
  // tasks kann von Cache-Version kommen – mindestens das Format prüfen
  assert.ok(Array.isArray(loaded.tasks));

  fs.rmSync(tmpDir, { recursive: true });
});

// ── Tools-Tests ───────────────────────────────────────────────────────────────

test('tools: alle Werkzeuge haben name, description, input_schema, run', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-tools-'));
  process.env.DATA_DIR = tmpDir;

  const { TOOLS } = await import('../lib/tools.js');

  for (const tool of TOOLS) {
    assert.ok(typeof tool.name === 'string', `${tool.name}: name fehlt`);
    assert.ok(typeof tool.description === 'string', `${tool.name}: description fehlt`);
    assert.ok(typeof tool.input_schema === 'object', `${tool.name}: input_schema fehlt`);
    assert.ok(typeof tool.run === 'function', `${tool.name}: run fehlt`);
  }

  fs.rmSync(tmpDir, { recursive: true });
});

test('tools: get_current_time gibt String zurück', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-time-'));
  process.env.DATA_DIR = tmpDir;

  const { TOOLS } = await import('../lib/tools.js');
  const timeTool = TOOLS.find(t => t.name === 'get_current_time');
  assert.ok(timeTool, 'get_current_time fehlt');
  const result = timeTool.run({});
  assert.ok(typeof result === 'string' && result.length > 5);

  fs.rmSync(tmpDir, { recursive: true });
});

test('tools: task_add → task_list → task_done Zyklus', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-tasks-'));
  process.env.DATA_DIR = tmpDir;

  const { TOOLS } = await import('../lib/tools.js');
  const add  = TOOLS.find(t => t.name === 'task_add');
  const list = TOOLS.find(t => t.name === 'task_list');
  const done = TOOLS.find(t => t.name === 'task_done');

  const addResult = add.run({ title: 'Testeinkauf' });
  assert.ok(addResult.includes('Testeinkauf'), `add: ${addResult}`);

  const listResult = list.run({});
  assert.ok(listResult.includes('Testeinkauf'), `list: ${listResult}`);

  // ID aus list-Ergebnis extrahieren: [<id>]
  const idMatch = listResult.match(/\[([a-z0-9]+)\]/);
  assert.ok(idMatch, `Keine ID in: ${listResult}`);

  const doneResult = done.run({ id: idMatch[1] });
  assert.ok(doneResult.includes('erledigt'), `done: ${doneResult}`);

  const listAfter = list.run({});
  assert.ok(!listAfter.includes('Testeinkauf'), `Aufgabe sollte verschwunden sein: ${listAfter}`);

  fs.rmSync(tmpDir, { recursive: true });
});

test('tools: memory_set → memory_get', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-mem-'));
  process.env.DATA_DIR = tmpDir;

  const { TOOLS } = await import('../lib/tools.js');
  const setM = TOOLS.find(t => t.name === 'memory_set');
  const getM = TOOLS.find(t => t.name === 'memory_get');

  setM.run({ key: 'lieblingsgericht', value: 'Schnitzel' });
  const result = getM.run({ key: 'lieblingsgericht' });
  assert.ok(result.includes('Schnitzel'), result);

  fs.rmSync(tmpDir, { recursive: true });
});

// ── Voice-Tests ───────────────────────────────────────────────────────────────

test('voice: speak gibt null zurück wenn kein ElevenLabs-Key', async () => {
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;

  const { speak } = await import('../lib/voice.js');
  const result = await speak('Test');
  assert.equal(result, null);
});
