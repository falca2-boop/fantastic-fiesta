import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClapDetector } from '../lib/clap.js';

const SR = 16000;
function rng(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

/** Erzeugt Audio: Grundrauschen + Ereignisse [{ at: ms, kind: 'clap' | 'speech' | 'noise', len?: ms, amp? }] */
function synth(durationMs, events = [], noise = 200) {
  const n = Math.round(durationMs * SR / 1000), out = new Int16Array(n), r = rng(42);
  for (let i = 0; i < n; i++) out[i] = (r() - 0.5) * 2 * noise;
  for (const ev of events) {
    const start = Math.round(ev.at * SR / 1000);
    if (ev.kind === 'clap') {
      const len = Math.round(80 * SR / 1000);
      for (let i = 0; i < len && start + i < n; i++) out[start + i] += (r() - 0.5) * 2 * (ev.amp ?? 20000) * Math.exp(-i / (SR * 0.015));
    } else {
      const len = Math.round((ev.len ?? 600) * SR / 1000);
      for (let i = 0; i < len && start + i < n; i++) out[start + i] += Math.sin(2 * Math.PI * 220 * i / SR) * (ev.amp ?? 9000) + (r() - 0.5) * 3000;
    }
  }
  return out;
}

function run(audio, opts = {}) {
  const got = { claps: 0, doubles: 0 };
  const d = new ClapDetector({ sampleRate: SR, onClap: () => got.claps++, onDouble: () => got.doubles++, ...opts });
  for (let i = 0; i < audio.length; i += 320) d.push(audio.subarray(i, i + 320));
  return got;
}

test('Zweimal klatschen (400 ms Abstand) löst genau einmal aus', () => {
  const g = run(synth(4000, [{ at: 1000, kind: 'clap' }, { at: 1400, kind: 'clap' }]));
  assert.equal(g.doubles, 1); assert.equal(g.claps, 2);
});

test('Schneller (250 ms) und langsamer (800 ms) Doppelklatscher funktionieren', () => {
  assert.equal(run(synth(3500, [{ at: 800, kind: 'clap' }, { at: 1050, kind: 'clap' }])).doubles, 1);
  assert.equal(run(synth(3500, [{ at: 800, kind: 'clap' }, { at: 1600, kind: 'clap' }])).doubles, 1);
});

test('Ein einzelner Klatscher oder zwei weit auseinander lösen nicht aus', () => {
  assert.equal(run(synth(3000, [{ at: 1000, kind: 'clap' }])).doubles, 0);
  assert.equal(run(synth(5000, [{ at: 1000, kind: 'clap' }, { at: 2800, kind: 'clap' }])).doubles, 0);
});

test('Applaus (drei Klatscher) und Sprache/Dauerlärm lösen nicht aus', () => {
  assert.equal(run(synth(4000, [{ at: 1000, kind: 'clap' }, { at: 1300, kind: 'clap' }, { at: 1600, kind: 'clap' }])).doubles, 0);
  assert.equal(run(synth(4000, [{ at: 500, kind: 'speech', len: 700 }, { at: 1500, kind: 'speech', len: 700 }, { at: 2500, kind: 'speech', len: 900 }])).doubles, 0);
  assert.equal(run(synth(4000, [{ at: 1000, kind: 'noise', len: 2000 }])).doubles, 0);
});

test('Nach einem Treffer gibt es eine Sperrzeit; danach funktioniert es wieder', () => {
  const ev = [{ at: 1000, kind: 'clap' }, { at: 1400, kind: 'clap' }, { at: 2500, kind: 'clap' }, { at: 2900, kind: 'clap' }, { at: 7000, kind: 'clap' }, { at: 7400, kind: 'clap' }];
  assert.equal(run(synth(9000, ev)).doubles, 2);   // der zweite Doppelklatscher bei 2,5 s liegt in der Sperrzeit
});

test('Auch in lauter Umgebung (höheres Grundrauschen) wird erkannt, leise Geräusche nicht', () => {
  assert.equal(run(synth(4000, [{ at: 1000, kind: 'clap', amp: 26000 }, { at: 1400, kind: 'clap', amp: 26000 }], 1500)).doubles, 1);
  assert.equal(run(synth(4000, [{ at: 1000, kind: 'clap', amp: 900 }, { at: 1400, kind: 'clap', amp: 900 }])).doubles, 0);   // Tippen/Rascheln
});

test('Float-Audio und krumme Blockgrößen werden verarbeitet', () => {
  const a = synth(3000, [{ at: 800, kind: 'clap' }, { at: 1200, kind: 'clap' }]);
  const f = Float32Array.from(a, (v) => v / 32768);
  const got = { d: 0 };
  const det = new ClapDetector({ sampleRate: SR, onDouble: () => got.d++ });
  for (let i = 0; i < f.length; i += 137) det.push(f.subarray(i, i + 137));
  assert.equal(got.d, 1);
});

test('Listener: erkennt Doppelklatscher in einem Aufnahmestrom und startet Jarvis, außer die Seite ist offen', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clap-'));
  const pcm = path.join(dir, 'a.pcm');
  fs.writeFileSync(pcm, Buffer.from(synth(3000, [{ at: 700, kind: 'clap' }, { at: 1100, kind: 'clap' }]).buffer));
  const listener = fileURLToPath(new URL('../scripts/clap-listener.js', import.meta.url));
  const launch = async (healthBody) => {
    const marker = path.join(dir, 'marker' + Math.random());
    const http = await import('node:http');
    const srv = http.createServer((_q, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(healthBody)); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const env = { ...process.env, CLAP_RECORDER_CMD: `cat ${pcm}; sleep 2`, JARVIS_LAUNCH_CMD: `touch ${marker}`, JARVIS_PORT: String(srv.address().port), CLAP_ONCE: '1' };
    await new Promise((resolve) => { const p = spawn(process.execPath, [listener], { env, stdio: 'ignore' }); p.on('exit', resolve); setTimeout(() => p.kill(), 8000); });
    srv.close();
    return fs.existsSync(marker);
  };
  assert.equal(await launch({ ok: true, uiActive: false }), true);    // Jarvis-Seite nicht offen: wird gestartet
  assert.equal(await launch({ ok: true, uiActive: true }), false);    // schon offen: nichts passiert
  fs.rmSync(dir, { recursive: true, force: true });
});
