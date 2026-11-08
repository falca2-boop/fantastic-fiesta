#!/usr/bin/env node
// Hört im Hintergrund auf "Hey Jarvis" und/oder "zweimal klatschen" und öffnet dann Jarvis (wenn die Seite nicht schon offen ist).
// Es wird nichts aufgezeichnet oder gesendet: Das Audio wird nur im Arbeitsspeicher ausgewertet.
//   node scripts/clap-listener.js          normaler Betrieb (läuft als Dienst)
//   node scripts/clap-listener.js --test   zeigt live einen Pegel und meldet Treffer, startet Jarvis nicht
// Auslöser: JARVIS_TRIGGER = wake (Hey Jarvis) | clap (zweimal klatschen) | both (beides, Standard)
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClapDetector } from '../lib/clap.js';

const PORT = process.env.JARVIS_PORT || '8001';
const SENS = Number(process.env.CLAP_SENSITIVITY) || 6;
const TRIGGER = (process.env.JARVIS_TRIGGER || 'both').toLowerCase();
const USE_CLAP = TRIGGER === 'clap' || TRIGGER === 'both';
const USE_WAKE = TRIGGER === 'wake' || TRIGGER === 'both';
const TEST = process.argv.includes('--test');
const ONCE = process.env.CLAP_ONCE === '1';            // nur für Tests: nach dem ersten Treffer beenden
const log = (...a) => console.log(new Date().toLocaleTimeString('de-DE'), ...a);
const has = (c) => spawnSync('sh', ['-c', `command -v ${c}`], { stdio: 'ignore' }).status === 0;

function recorder() {
  if (process.env.CLAP_RECORDER_CMD) return ['sh', ['-c', process.env.CLAP_RECORDER_CMD]];
  if (has('parecord')) return ['parecord', ['--raw', '--format=s16le', '--rate=16000', '--channels=1', '--latency-msec=20']];
  if (has('arecord')) return ['arecord', ['-q', '-t', 'raw', '-f', 'S16_LE', '-r', '16000', '-c', '1']];
  return null;
}

function launchJarvis() {
  const cmd = process.env.JARVIS_LAUNCH_CMD || path.join(os.homedir(), '.local', 'bin', 'jarvis-start');
  spawn('sh', ['-c', cmd], { detached: true, stdio: 'ignore' }).unref();
  log('Jarvis wird gestartet.');
}

async function trigger(reason) {
  if (TEST) { console.log(`\n>>> ${reason}! (im Testmodus wird Jarvis nicht gestartet)`); return; }
  log(`${reason}.`);
  let active = false;
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) active = !!(await r.json()).uiActive;
  } catch { /* Server läuft nicht: dann starten */ }
  if (active) log('Jarvis ist schon offen, nichts zu tun.'); else launchJarvis();
  if (ONCE) setTimeout(() => process.exit(0), 300);
}

const detector = new ClapDetector({ sampleRate: 16000, sensitivity: SENS, onDouble: () => { if (USE_CLAP) trigger('Doppelklatscher erkannt'); }, onClap: () => { if (TEST && USE_CLAP) console.log('\n  klatsch'); } });

// --- Wake-Word "Hey Jarvis": Python-Erkenner (scripts/wake-worker.py) bekommt denselben Audiostrom
let worker = null;
function startWake() {
  if (!USE_WAKE) return;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const python = process.env.WAKE_PYTHON || path.join(os.homedir(), '.local', 'share', 'jarvis', 'wake-env', 'bin', 'python');
  const [cmd, args] = process.env.WAKE_WORKER_CMD ? ['sh', ['-c', process.env.WAKE_WORKER_CMD]] : [python, [path.join(here, 'wake-worker.py')]];
  const w = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  worker = w;
  let out = '';
  w.stdout.on('data', (d) => {
    out += d; let i;
    while ((i = out.indexOf('\n')) >= 0) {
      const line = out.slice(0, i).trim(); out = out.slice(i + 1);
      if (line.startsWith('WAKE')) trigger(`Hey Jarvis erkannt (${line.slice(5)})`);
      else if (line === 'READY') log('Erkennung für "Hey Jarvis" bereit.');
      else if (line) log('Wake-Word:', line);
    }
  });
  w.stderr.on('data', (d) => { const t = String(d).split('\n').filter((l) => l && !/warn|CUDAExecutionProvider|providers/i.test(l))[0]; if (t) log('Wake-Word-Fehler:', t.slice(0, 200)); });
  w.stdin.on('error', () => {});
  w.on('error', (e) => { log('Wake-Word-Programm konnte nicht starten:', e.message); });
  w.on('close', (code) => {
    worker = null;
    if (ONCE) return;
    if (code === 2 || code === 1) log('Wake-Word nicht verfügbar (ist es installiert? bash scripts/install-clap.sh). Neuer Versuch in 60 s.');
    setTimeout(startWake, code === 0 ? 5000 : 60000);
  });
}

let heard = 0, warned = false, started = Date.now(), lastBar = 0;
function run() {
  const rec = recorder();
  if (!rec) { log('Kein Aufnahmeprogramm gefunden. Bitte installieren: sudo apt install -y pulseaudio-utils'); setTimeout(run, 30000); return; }
  log(`Höre auf ${USE_WAKE ? '"Hey Jarvis"' : ''}${USE_WAKE && USE_CLAP ? ' und ' : ''}${USE_CLAP ? `Doppelklatscher (Empfindlichkeit ${SENS})` : ''} mit ${rec[0]}.`);
  const p = spawn(rec[0], rec[1], { stdio: ['ignore', 'pipe', 'inherit'] });
  let rest = Buffer.alloc(0);
  p.stdout.on('data', (chunk) => {
    const b = Buffer.concat([rest, chunk]);
    const n = b.length - (b.length % 2);
    rest = b.subarray(n);
    const samples = new Int16Array(n / 2);
    for (let i = 0; i < samples.length; i++) { const v = b.readInt16LE(i * 2); samples[i] = v; if (Math.abs(v) > heard) heard = Math.abs(v); }
    detector.push(samples);
    if (worker && worker.stdin.writable) worker.stdin.write(b.subarray(0, n));
    if (TEST && Date.now() - lastBar > 100) {
      lastBar = Date.now();
      let s = 0; for (const v of samples) s += v * v;
      const level = Math.min(1, Math.sqrt(s / Math.max(1, samples.length)) / 32768 * 8);
      process.stdout.write('\r  Pegel ' + '█'.repeat(Math.round(level * 40)).padEnd(40, '·') + ' ');
    }
    if (!warned && Date.now() - started > 4000 && heard === 0) {
      warned = true;
      log('Das Mikrofon liefert nur Stille. ChromeOS: Einstellungen → Entwickler → Linux → Mikrofon erlauben, danach Linux neu starten.');
    }
  });
  p.on('error', (e) => log('Aufnahme konnte nicht starten:', e.message));
  p.on('close', () => { if (worker) worker.stdin.end(); if (ONCE) { setTimeout(() => process.exit(0), 1500); return; } log('Aufnahme beendet, neuer Versuch in 5 s.'); setTimeout(run, 5000); });
}

if (TEST) console.log(`Testmodus: ${USE_WAKE ? 'Sage "Hey Jarvis"' : ''}${USE_WAKE && USE_CLAP ? ' oder k' : USE_CLAP ? 'K' : ''}${USE_CLAP ? 'latsche zweimal in die Hände' : ''}. Beenden mit Strg + C.\n`);
startWake();
run();
