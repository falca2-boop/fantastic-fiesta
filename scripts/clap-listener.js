#!/usr/bin/env node
// Hört im Hintergrund auf "zweimal klatschen" und öffnet dann Jarvis (wenn die Jarvis-Seite nicht schon offen ist).
// Es wird nichts aufgezeichnet oder gesendet: Das Audio wird nur im Arbeitsspeicher auf Lautstärke geprüft.
//   node scripts/clap-listener.js          normaler Betrieb (läuft als Dienst)
//   node scripts/clap-listener.js --test   zeigt live einen Pegel und meldet Doppelklatscher, startet Jarvis nicht
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ClapDetector } from '../lib/clap.js';

const PORT = process.env.JARVIS_PORT || '8001';
const SENS = Number(process.env.CLAP_SENSITIVITY) || 6;
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

async function onDouble() {
  if (TEST) { console.log('\n>>> Doppelklatscher erkannt! (im Testmodus wird Jarvis nicht gestartet)'); return; }
  log('Doppelklatscher erkannt.');
  let active = false;
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) active = !!(await r.json()).uiActive;
  } catch { /* Server läuft nicht: dann starten */ }
  if (active) log('Jarvis ist schon offen, nichts zu tun.'); else launchJarvis();
  if (ONCE) setTimeout(() => process.exit(0), 300);
}

const detector = new ClapDetector({ sampleRate: 16000, sensitivity: SENS, onDouble, onClap: () => { if (TEST) console.log('\n  klatsch'); } });

let heard = 0, warned = false, started = Date.now(), lastBar = 0;
function run() {
  const rec = recorder();
  if (!rec) { log('Kein Aufnahmeprogramm gefunden. Bitte installieren: sudo apt install -y pulseaudio-utils'); setTimeout(run, 30000); return; }
  log(`Höre auf Doppelklatscher (Empfindlichkeit ${SENS}) mit ${rec[0]}.`);
  const p = spawn(rec[0], rec[1], { stdio: ['ignore', 'pipe', 'inherit'] });
  let rest = Buffer.alloc(0);
  p.stdout.on('data', (chunk) => {
    const b = Buffer.concat([rest, chunk]);
    const n = b.length - (b.length % 2);
    rest = b.subarray(n);
    const samples = new Int16Array(n / 2);
    for (let i = 0; i < samples.length; i++) { const v = b.readInt16LE(i * 2); samples[i] = v; if (Math.abs(v) > heard) heard = Math.abs(v); }
    detector.push(samples);
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
  p.on('close', () => { if (ONCE) { setTimeout(() => process.exit(0), 1500); return; } log('Aufnahme beendet, neuer Versuch in 5 s.'); setTimeout(run, 5000); });
}

if (TEST) console.log('Testmodus: Klatsche zweimal in die Hände. Beenden mit Strg + C.\n');
run();
