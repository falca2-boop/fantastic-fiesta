import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { runTool, takeDueReminders } from '../lib/tools.js';
import { chat, localIso } from '../lib/agent.js';
import { createServer } from '../server.js';

const NOW = Date.parse('2026-10-09T08:00:00Z');

test('Aufgaben anlegen und erledigen', async () => {
  const s = new Store(null);
  const msg = await runTool(s, 'add_task', { text: 'Milch kaufen' });
  const id = msg.match(/ID (\w+)/)[1];
  assert.equal(s.data.tasks.length, 1);
  assert.match(await runTool(s, 'complete_task', { id }), /Erledigt/);
  assert.equal(s.data.tasks[0].done, true);
  assert.match(await runTool(s, 'complete_task', { id: 'nope' }), /nicht gefunden/);
});

test('Erinnerungen: Vergangenheit wird abgelehnt, fällige werden einmal geliefert', async () => {
  const s = new Store(null);
  assert.match(await runTool(s, 'set_reminder', { text: 'x', at: '2026-10-09T09:00:00+02:00' }, { now: NOW }), /Vergangenheit/);
  assert.match(await runTool(s, 'set_reminder', { text: 'x', at: 'quatsch' }, { now: NOW }), /Ungültige/);
  await runTool(s, 'set_reminder', { text: 'Anruf', at: '2026-10-09T11:00:00+02:00' }, { now: NOW });
  assert.equal(takeDueReminders(s, NOW).length, 0);
  assert.equal(takeDueReminders(s, NOW + 2 * 3600e3).length, 1);
  assert.equal(takeDueReminders(s, NOW + 2 * 3600e3).length, 0);
});

test('localIso formatiert Offset wie die Browser-Zeitzone', () => {
  assert.equal(localIso(NOW, -120), '2026-10-09T10:00+02:00');
  assert.equal(localIso(NOW, 300), '2026-10-09T03:00-05:00');
});

test('Agent führt Werkzeug aus und speichert den Verlauf', async () => {
  const s = new Store(null);
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const body = calls.length === 1
      ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'add_task', input: { text: 'Test' } }] }
      : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Augustin, erledigt.' }] };
    return { ok: true, status: 200, json: async () => body };
  };
  const reply = await chat({ store: s, message: 'Merk dir Test', apiKey: 'k', model: 'm', userName: 'Augustin', fetchFn: fakeFetch, now: NOW });
  assert.equal(reply, 'Augustin, erledigt.');
  assert.equal(s.data.tasks[0].text, 'Test');
  assert.equal(s.data.history.length, 2);
  assert.equal(calls[1].messages.at(-1).content[0].type, 'tool_result');
  assert.ok(!calls[0].tools.some(t => t.name === 'external_action'));
});

async function withServer(opts, fn) {
  const { server } = createServer({ store: new Store(null), ...opts });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise(r => server.close(r)); }
}

test('Server: Token wird erzwungen, Chat funktioniert mit Token', async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hallo.' }] }) });
  await withServer({ token: 'geheim', apiKey: 'k', fetchFn: fakeFetch }, async (base) => {
    assert.equal((await fetch(base + '/api/state')).status, 401);
    assert.equal((await fetch(base + '/api/state', { headers: { Authorization: 'Bearer falsch' } })).status, 401);
    const ok = await fetch(base + '/api/chat', { method: 'POST', headers: { Authorization: 'Bearer geheim' }, body: JSON.stringify({ message: 'Hi' }) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).reply, 'Hallo.');
    assert.equal((await fetch(base + '/api/health')).status, 200);
  });
});

test('Server: Pfad-Traversal und leere Nachricht werden abgewiesen', async () => {
  await withServer({ apiKey: 'k' }, async (base) => {
    const res = await fetch(base + '/%2e%2e/package.json');
    assert.ok([403, 404].includes(res.status));
    assert.equal((await fetch(base + '/')).status, 200);
    const bad = await fetch(base + '/api/chat', { method: 'POST', body: JSON.stringify({ message: '  ' }) });
    assert.equal(bad.status, 400);
  });
});

test('Server: /api/speak ruft ElevenLabs mit Stimme und Key auf und liefert Audio', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; };
  await withServer({ token: 'geheim', voice: { apiKey: 'xk', voiceId: 'VOICE1', model: 'm1' }, fetchFn: fakeFetch }, async (base) => {
    const h = { Authorization: 'Bearer geheim' };
    assert.equal((await fetch(base + '/api/speak', { method: 'POST', body: '{"text":"Hallo"}' })).status, 401);
    assert.equal((await (await fetch(base + '/api/health')).json()).voice, true);
    const res = await fetch(base + '/api/speak', { method: 'POST', headers: h, body: JSON.stringify({ text: 'Hallo Augustin' }) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/mpeg');
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3]);
    assert.match(calls[0].url, /text-to-speech\/VOICE1\?/);
    assert.equal(calls[0].init.headers['xi-api-key'], 'xk');
    assert.equal(JSON.parse(calls[0].init.body).model_id, 'm1');
    assert.equal((await fetch(base + '/api/speak', { method: 'POST', headers: h, body: JSON.stringify({ text: 'x'.repeat(801) }) })).status, 400);
  });
});

test('Server: /api/speak ohne Stimme-Konfiguration meldet 501, ElevenLabs-Fehler wird zu 502', async () => {
  await withServer({ voice: null }, async (base) => {
    assert.equal((await fetch(base + '/api/speak', { method: 'POST', body: '{"text":"Hallo"}' })).status, 501);
    assert.equal((await (await fetch(base + '/api/health')).json()).voice, false);
  });
  await withServer({ voice: { apiKey: 'k', voiceId: 'v', model: 'm' }, fetchFn: async () => ({ ok: false, status: 401 }) }, async (base) => {
    assert.equal((await fetch(base + '/api/speak', { method: 'POST', body: '{"text":"Hallo"}' })).status, 502);
  });
});

test('Obsidian: Notizen und Gedächtnis liegen als Markdown im Vault', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
  const s = new Store(null, { vaultDir: vault });
  assert.match(await runTool(s, 'add_note', { text: 'Idee: Podcast / Folge #1' }, { now: NOW }), /Obsidian/);
  const files = fs.readdirSync(path.join(vault, 'Jarvis', 'Notizen'));
  assert.deepEqual(files, ['2026-10-09 Idee Podcast Folge 1.md']);
  fs.writeFileSync(path.join(vault, 'Jarvis', 'Notizen', 'Eigene.md'), 'von Hand geschrieben');
  const list = await runTool(s, 'list_notes', {});
  assert.match(list, /Podcast/); assert.match(list, /von Hand/);
  assert.equal(s.data.notes.length, 0);

  await runTool(s, 'remember', { fact: 'Trinkt Kaffee schwarz' });
  assert.match(fs.readFileSync(path.join(vault, 'Jarvis', 'Gedächtnis.md'), 'utf8'), /- Trinkt Kaffee schwarz/);
  fs.appendFileSync(path.join(vault, 'Jarvis', 'Gedächtnis.md'), '- Wohnt in Köln\n');
  await runTool(s, 'remember', { fact: 'Mag Tee nicht' });
  assert.deepEqual(s.data.facts, ['Trinkt Kaffee schwarz', 'Wohnt in Köln', 'Mag Tee nicht']);
  await runTool(s, 'forget', { contains: 'köln' });
  assert.doesNotMatch(fs.readFileSync(path.join(vault, 'Jarvis', 'Gedächtnis.md'), 'utf8'), /Köln/);

  const pre = new Store(null); pre.data.facts = ['Alt'];
  pre.vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-')); pre.syncFacts();
  assert.match(fs.readFileSync(path.join(pre.vaultDir, 'Jarvis', 'Gedächtnis.md'), 'utf8'), /- Alt/);
});

test('.env-Parser: Kommentare, Anführungszeichen, keine Überschreibung gesetzter Variablen', async () => {
  const { parseEnv, loadEnvFile } = await import('../lib/env.js');
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  assert.deepEqual(parseEnv('# c\nA=1\nB="x y"  \nC=z # kommentar\nD=\n'), { A: '1', B: 'x y', C: 'z', D: '' });
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'env-')), '.env');
  fs.writeFileSync(f, 'A=file\nB=file\n');
  const env = { A: 'shell' };
  assert.equal(loadEnvFile(f, env), true);
  assert.deepEqual(env, { A: 'shell', B: 'file' });
  assert.equal(loadEnvFile(f + 'x', {}), false);
});

test('Gemini: Werkzeugaufruf, Websuche als Funktion, JSON-Argumente, Verlauf', async () => {
  const s = new Store(null);
  const calls = [];
  const fakeFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    let data;
    if (body.tools?.[0]?.googleSearch) data = { candidates: [{ content: { parts: [{ text: 'Es sind 20 Grad.' }] } }] };
    else if (calls.filter(c => c.body.systemInstruction).length === 1)
      data = { candidates: [{ content: { role: 'model', parts: [
        { functionCall: { name: 'add_task', args: { text: 'Milch' } }, thoughtSignature: 'sig' },
        { functionCall: { name: 'web_search', args: { query: 'Wetter Köln' } } },
        { functionCall: { name: 'external_action', args: { action: 'send_email', details: '{"to":"a@b.de"}' } } },
      ] } }] };
    else data = { candidates: [{ content: { role: 'model', parts: [{ text: 'Gedanke', thought: true }, { text: 'Augustin, erledigt.' }] } }] };
    return { ok: true, status: 200, json: async () => data };
  };
  const webhookCalls = [];
  const hookFetch = async (url, init) => url.includes('googleapis') ? fakeFetch(url, init) : (webhookCalls.push(JSON.parse(init.body)), { ok: true, text: async () => 'gesendet' });
  const reply = await chat({ store: s, message: 'Mach das', apiKey: 'gk', model: 'gemini-test', provider: 'gemini', userName: 'Augustin', webhookUrl: 'http://n8n/hook', fetchFn: hookFetch, now: NOW });
  assert.equal(reply, 'Augustin, erledigt.');
  assert.equal(s.data.tasks[0].text, 'Milch');
  assert.deepEqual(webhookCalls[0], { action: 'send_email', details: { to: 'a@b.de' } });
  const first = calls[0];
  assert.match(first.url, /models\/gemini-test:generateContent$/);
  assert.equal(first.headers['x-goog-api-key'], 'gk');
  const decls = first.body.tools[0].functionDeclarations;
  assert.ok(decls.some(d => d.name === 'web_search' && d.parameters.required[0] === 'query'));
  assert.equal(decls.find(d => d.name === 'list_tasks').parameters, undefined);
  assert.equal(decls.find(d => d.name === 'external_action').parameters.properties.details.type, 'STRING');
  assert.equal(decls.find(d => d.name === 'set_goal').parameters.properties.schritte.items.type, 'STRING');
  const last = calls.at(-1).body.contents;
  assert.equal(last.at(-2).parts[0].thoughtSignature, 'sig');
  assert.equal(last.at(-1).parts.length, 3);
  assert.match(last.at(-1).parts[1].functionResponse.response.result, /20 Grad/);
  assert.deepEqual(s.data.history.map(h => h.content), ['Mach das', 'Augustin, erledigt.']);
});

test('Gemini: Fehler 429 wird verständlich gemeldet, Server wählt Gemini anhand des Keys', async () => {
  await assert.rejects(chat({ store: new Store(null), message: 'x', apiKey: 'k', model: 'm', provider: 'gemini', userName: 'A', fetchFn: async () => ({ ok: false, status: 429 }) }), /Limit/);
  const saved = { ...process.env };
  try {
    delete process.env.ANTHROPIC_API_KEY; delete process.env.JARVIS_PROVIDER; process.env.GEMINI_API_KEY = 'AIza-test';
    await withServer({}, async (base) => {
      const h = await (await fetch(base + '/api/health')).json();
      assert.equal(h.provider, 'gemini'); assert.equal(h.keyConfigured, true);
    });
  } finally { for (const k of ['ANTHROPIC_API_KEY', 'JARVIS_PROVIDER', 'GEMINI_API_KEY']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
});

test('Server: Aufgabe per Klick erledigen, Notizen und Anzahl Fakten im Zustand', async () => {
  const store = new Store(null);
  store.data.tasks.push({ id: 'a1', text: 'Test', due: '', done: false });
  store.data.notes.push({ id: 'n1', text: 'Erste Notiz', ts: '2026-10-09T08:00:00Z' });
  store.data.facts.push('Mag Kaffee');
  await withServer({ store }, async (base) => {
    const st = await (await fetch(base + '/api/state')).json();
    assert.equal(st.tasks.length, 1); assert.equal(st.notes[0].text, 'Erste Notiz'); assert.equal(st.factCount, 1);
    assert.equal((await fetch(base + '/api/tasks/complete', { method: 'POST', body: '{"id":"nope"}' })).status, 404);
    const done = await (await fetch(base + '/api/tasks/complete', { method: 'POST', body: '{"id":"a1"}' })).json();
    assert.equal(done.state.tasks.length, 0);
  });
});

test('Anrede: JARVIS_ADDRESS überschreibt den Namen im Systemprompt und im Zustand', async () => {
  const { systemPrompt } = await import('../lib/agent.js');
  const s = new Store(null);
  assert.match(systemPrompt(s, { userName: 'Boss', address: 'Hey Boss', now: NOW, offsetMinutes: 0 }), /„Hey Boss“/);
  assert.match(systemPrompt(s, { userName: 'Boss', now: NOW, offsetMinutes: 0 }), /„Boss“/);
  await withServer({ userName: 'Boss', address: 'Hey Boss' }, async (base) => {
    const st = await (await fetch(base + '/api/state')).json();
    assert.equal(st.userName, 'Boss'); assert.equal(st.address, 'Hey Boss');
  });
});

test('Obsidian: OBSIDIAN_SUBFOLDER legt den Unterordner fest, unsichere Werte werden ignoriert', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const saved = process.env.OBSIDIAN_SUBFOLDER;
  try {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
    const s = new Store(null, { vaultDir: vault });
    process.env.OBSIDIAN_SUBFOLDER = '00-INBOX/Jarvis';
    await runTool(s, 'add_note', { text: 'Hallo' }, { now: NOW });
    await runTool(s, 'remember', { fact: 'Fakt' });
    assert.ok(fs.existsSync(path.join(vault, '00-INBOX', 'Jarvis', 'Notizen', '2026-10-09 Hallo.md')));
    assert.ok(fs.existsSync(path.join(vault, '00-INBOX', 'Jarvis', 'Gedächtnis.md')));
    process.env.OBSIDIAN_SUBFOLDER = '../ausserhalb';
    await runTool(s, 'add_note', { text: 'Sicher' }, { now: NOW });
    assert.ok(fs.existsSync(path.join(vault, 'Jarvis', 'Notizen', '2026-10-09 Sicher.md')));
    assert.ok(!fs.existsSync(path.join(vault, '..', 'ausserhalb')));
  } finally { if (saved === undefined) delete process.env.OBSIDIAN_SUBFOLDER; else process.env.OBSIDIAN_SUBFOLDER = saved; }
});

test('Server: ElevenLabs-Fehler nennen den Grund (402 = Tarif, 404 = Stimme nicht gefunden)', async () => {
  const mk = (status, body) => async () => ({ ok: false, status, text: async () => JSON.stringify(body) });
  await withServer({ voice: { apiKey: 'k', voiceId: 'v', model: 'm' }, fetchFn: mk(402, { detail: { status: 'paid_plan_required', message: 'Free users cannot use library voices via the API.' } }) }, async (base) => {
    const r = await fetch(base + '/api/speak', { method: 'POST', body: '{"text":"Hallo"}' });
    assert.equal(r.status, 502);
    const e = (await r.json()).error;
    assert.match(e, /402/); assert.match(e, /bezahlten/); 
  });
  await withServer({ voice: { apiKey: 'k', voiceId: 'v', model: 'm' }, fetchFn: mk(404, { detail: { message: 'voice_not_found' } }) }, async (base) => {
    assert.match((await (await fetch(base + '/api/speak', { method: 'POST', body: '{"text":"Hallo"}' })).json()).error, /Meine Stimmen/);
  });
});

test('Server: /api/health meldet, ob die Oberfläche offen ist (letzte Abfrage vor < 90 s)', async () => {
  await withServer({}, async (base) => {
    assert.equal((await (await fetch(base + '/api/health')).json()).uiActive, false);
    await fetch(base + '/api/poll');
    assert.equal((await (await fetch(base + '/api/health')).json()).uiActive, true);
  });
});

import { websiteUrl, runTool as runToolWeb } from '../lib/tools.js';
test('open_website: sichere Adressen, Suche, Opener', async () => {
  assert.equal(websiteUrl({ url: 'youtube.com' }), 'https://youtube.com/');
  assert.equal(websiteUrl({ url: 'javascript:alert(1)' }), null);
  assert.equal(websiteUrl({ url: 'file:///etc/passwd' }), null);
  assert.equal(websiteUrl({ search: 'Wetter Wien' }), 'https://www.google.com/search?q=Wetter%20Wien');
  let opened; const store = { data: {}, save() {} };
  const out = await runToolWeb(store, 'open_website', { url: 'https://example.com' }, { openUrl: async (u) => { opened = u; return true; } });
  assert.match(out, /Geöffnet/); assert.equal(opened, 'https://example.com/');
  assert.equal(await runToolWeb(store, 'open_website', { url: 'ftp://x' }, { openUrl: async () => true }), 'Ungültige Adresse.');
});

test('open_website wird an die KI übergeben und im Prompt erwähnt', async () => {
  const store = new Store(null); let body;
  const fetchFn = async (url, o) => { body = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }) }; };
  await chat({ store, message: 'öffne YouTube', apiKey: 'k', model: 'm', userName: 'A', fetchFn });
  assert.ok(body.tools.some((t) => t.name === 'open_website'));
  assert.match(body.system, /open_website/);
});

test('doppelte Erinnerungen werden nicht angelegt und beim Laden bereinigt', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rem-')), 'd.json');
  const at = new Date(Date.now() + 3600e3).toISOString();
  fs.writeFileSync(f, JSON.stringify({ reminders: [{ id: 'a', text: 'Postfach prüfen', at, fired: false }, { id: 'b', text: 'postfach prüfen', at, fired: false }] }));
  const s = new Store(f);
  assert.equal(s.data.reminders.length, 1);
  const out = await runTool(s, 'set_reminder', { text: 'Postfach prüfen', at });
  assert.match(out, /schon/); assert.equal(s.data.reminders.length, 1);
});

test('Obsidian: Suche, Notiz lesen mit Verknüpfungen, Universum öffnen', async () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'SecondBrain-'));
  fs.mkdirSync(path.join(vault, '10-PROJEKTE')); fs.mkdirSync(path.join(vault, '.obsidian'));
  fs.writeFileSync(path.join(vault, '10-PROJEKTE', 'Jarvis Plan.md'), '---\ntags: x\n---\n# Jarvis Plan\nZiel: Assistent bauen #projekt\nSiehe [[Ideen]] und [[Budget|Geld]].');
  fs.writeFileSync(path.join(vault, 'Ideen.md'), 'Idee: Sprachsteuerung. Zurück zu [[Jarvis Plan]].');
  fs.writeFileSync(path.join(vault, '.obsidian', 'versteckt.md'), 'Jarvis Plan geheim');
  const s = new Store(null, { vaultDir: vault });
  const found = await runTool(s, 'search_vault', { query: 'jarvis plan' });
  assert.match(found, /Jarvis Plan/); assert.doesNotMatch(found, /versteckt/);
  const note = await runTool(s, 'read_vault_note', { title: 'jarvis plan' });
  assert.match(note, /Assistent bauen/); assert.match(note, /Verlinkt auf: Ideen, Budget/); assert.match(note, /Verlinkt von: Ideen/); assert.match(note, /Tags: projekt/);
  assert.match(await runTool(s, 'read_vault_note', { title: 'gibtesnicht' }), /Keine passende/);
  let opened;
  const out = await runTool(s, 'open_universe', { note: 'Jarvis Plan' }, { openUrl: async (u) => { opened = u; return true; } });
  assert.match(out, /geöffnet/); assert.equal(opened, 'obsidian://knowledge-universe?vault=' + encodeURIComponent(path.basename(vault)) + '&note=Jarvis%20Plan');
  assert.equal(await runTool(new Store(null), 'open_universe', {}), 'Kein Obsidian-Vault verbunden.');
});

import { createAgent, deleteAgent, listAgents, runAgent, AGENT_TOOLS } from '../lib/agents.js';
test('Agenten: eigene anlegen mit Prüfungen, löschen, eingebaute geschützt', () => {
  const s = new Store(null);
  assert.ok(listAgents(s).some((a) => a.name === 'recherche' && a.builtin));
  assert.match(createAgent(s, { name: 'X', role: 'zu kurz' }), /Ungültiger Name/);
  assert.match(createAgent(s, { name: 'Recherche', role: 'Eine ausreichend lange Rollenbeschreibung hier.' }), /gibt es schon/);
  assert.match(createAgent(s, { name: 'Mailer', role: 'Sendet Mails an Leute und antwortet kurz.', tools: ['external_action'] }), /nicht haben/);
  assert.match(createAgent(s, { name: 'Kurz', role: 'kurz' }), /zu kurz/);
  assert.match(createAgent(s, { name: 'Börsen-Beobachter', role: 'Beobachtet Aktienkurse per Websuche und fasst sie knapp zusammen.', tools: ['web_search'] }), /angelegt/);
  assert.deepEqual(s.data.agents.map((a) => a.name), ['Börsen-Beobachter']);
  assert.match(deleteAgent(s, 'recherche'), /nicht löschen/);
  assert.match(deleteAgent(s, 'börsen-beobachter'), /gelöscht/);
  for (let i = 0; i < 8; i++) createAgent(s, { name: 'Agent' + i, role: 'Eine ausreichend lange Rollenbeschreibung hier.' });
  assert.match(createAgent(s, { name: 'Neunter', role: 'Eine ausreichend lange Rollenbeschreibung hier.' }), /8 eigene/);
  assert.ok(!AGENT_TOOLS.some((t) => ['external_action', 'add_task', 'add_note', 'open_website', 'ask_agent', 'create_agent', 'set_reminder'].includes(t)));
});

test('Agenten: runAgent bekommt nur erlaubte Werkzeuge, führt Werkzeugaufrufe aus und gibt Text zurück', async () => {
  const s = new Store(null); s.data.tasks.push({ id: 't1', text: 'Zahnarzt', done: false });
  const bodies = [];
  const fetchFn = async (url, o) => {
    const body = JSON.parse(o.body); bodies.push(body);
    if (bodies.length === 1) return { ok: true, status: 200, json: async () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'list_tasks', input: {} }, { type: 'tool_use', id: 'u2', name: 'add_task', input: { text: 'böse' } }] }) };
    return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Plan: Zahnarzt um 9 Uhr.' }] }) };
  };
  const out = await runAgent({ store: s, name: 'Planer', task: 'Plane meinen Tag', apiKey: 'k', model: 'm', fetchFn });
  assert.equal(out, 'Plan: Zahnarzt um 9 Uhr.');
  assert.deepEqual(bodies[0].tools.map((t) => t.name).sort(), ['list_notes', 'list_tasks']);
  assert.match(bodies[0].system, /Spezial-Agent „planer“/);
  const results = bodies[1].messages.at(-1).content;
  assert.match(results[0].content, /Zahnarzt/);
  assert.match(results[1].content, /nicht benutzen/);
  assert.equal(s.data.tasks.length, 1);
  await assert.rejects(runAgent({ store: s, name: 'gibtsnicht', task: 'x', apiKey: 'k', model: 'm', fetchFn }), /Unbekannter Agent/);
});

test('Jarvis: ask_agent läuft über den Agent-Runner, Agenten-Werkzeuge werden angeboten', async () => {
  const s = new Store(null);
  const out = await runTool(s, 'ask_agent', { agent: 'recherche', task: 'Was ist X?' }, { agentRunner: async (a, t) => `[${a}] ${t}` });
  assert.equal(out, '[recherche] Was ist X?');
  assert.match(await runTool(s, 'ask_agent', { agent: 'nix', task: 'y' }, { agentRunner: async () => '' }), /Vorhanden: recherche/);
  assert.match(await runTool(s, 'ask_agent', { agent: 'recherche', task: 'y' }), /nicht verfügbar/);
  assert.match(await runTool(s, 'create_agent', { name: 'Kochbuch', role: 'Beantwortet Kochfragen kurz und nennt immer Zutaten.', tools: ['web_search'] }), /angelegt/);
  assert.match(await runTool(s, 'list_agents', {}), /Kochbuch \(eigen\)/);
  const names = (await import('../lib/tools.js')).toolDefinitions({}).map((t) => t.name);
  for (const n of ['ask_agent', 'create_agent', 'list_agents', 'delete_agent']) assert.ok(names.includes(n));
});

test('Eingebaute Agenten: alle Werkzeuge erlaubt und ausschließlich lesend', () => {
  const s = new Store(null);
  const names = listAgents(s).map((a) => a.name);
  for (const n of ['recherche', 'nachrichten', 'analyst', 'notizen', 'planer', 'firmensucher', 'briefschreiber', 'morgenbriefing', 'marktbeobachter']) assert.ok(names.includes(n), n);
  for (const a of listAgents(s)) assert.ok(a.tools.every((t) => AGENT_TOOLS.includes(t)), a.name);
  const brief = listAgents(s).find((a) => a.name === 'briefschreiber');
  assert.ok(!brief.tools.includes('external_action') && !brief.tools.includes('add_note') && /sendest nichts/.test(brief.role));
});

test('Persönlichkeit: Jarvis ist Freund auf Du-Basis und antwortet immer', async () => {
  const { systemPrompt } = await import('../lib/agent.js');
  const p = systemPrompt(new Store(null), { userName: 'Augustin', address: 'Boss', now: Date.now(), offsetMinutes: 0 });
  assert.match(p, /guter Freund/); assert.match(p, /„du“/); assert.match(p, /IMMER/); assert.match(p, /ehrlich/); assert.match(p, /eine KI/);
});
