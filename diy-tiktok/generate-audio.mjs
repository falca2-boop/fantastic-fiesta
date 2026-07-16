// Generates a 60-second upbeat DIY background music track as WAV
// 120 BPM, 4/4 time, major key, synthesized in pure Node.js

import { writeFileSync } from "fs";

const SAMPLE_RATE = 44100;
const DURATION_S = 62;
const NUM_SAMPLES = SAMPLE_RATE * DURATION_S;
const BPM = 118;
const BEAT = (60 / BPM) * SAMPLE_RATE; // samples per beat
const BAR = BEAT * 4;

const buf = new Float32Array(NUM_SAMPLES);

// Envelope helpers
function adsr(t, attack, decay, sustain, release, duration) {
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  if (t < duration - release) return sustain;
  if (t < duration) return sustain * (1 - (t - (duration - release)) / release);
  return 0;
}

// Sine oscillator
function sine(freq, t, sr = SAMPLE_RATE) {
  return Math.sin(2 * Math.PI * freq * t / sr);
}

// Sawtooth oscillator
function saw(freq, t, sr = SAMPLE_RATE) {
  return 2 * ((t * freq / sr) % 1) - 1;
}

// White noise
function noise() {
  return (Math.random() * 2 - 1);
}

// Add a sound event at position `startSample`, duration `dur` samples
function addEvent(startSample, dur, generator) {
  const end = Math.min(startSample + dur, NUM_SAMPLES);
  for (let i = startSample; i < end; i++) {
    buf[i] += generator(i - startSample, dur);
  }
}

// --- DRUM PATTERNS ---
// Kick: beats 1 & 3 of every bar
// Snare: beats 2 & 4
// Hi-hat: every 8th note

function kick(t, dur) {
  const env = adsr(t, 50, 3000, 0, 500, dur);
  const freq = 80 + 120 * Math.exp(-t / 800);
  return 0.7 * env * sine(freq, t);
}

function snare(t, dur) {
  const env = adsr(t, 20, 1500, 0, 300, dur);
  const tone = 0.3 * sine(200, t);
  const n = 0.7 * noise();
  return 0.5 * env * (tone + n);
}

function hihat(t, dur, open = false) {
  const env = adsr(t, 5, open ? 2000 : 400, 0, 100, dur);
  return 0.18 * env * noise();
}

// --- BASS LINE ---
// Notes in root: C2=65Hz, G2=98Hz, A2=110Hz, F2=87Hz
// 2-bar pattern: C C G G A A F F
const BASS_NOTES = [65, 65, 98, 98, 110, 110, 87, 87];

function bass(freq, t, dur) {
  const env = adsr(t, 30, dur * 0.3, 0.6, 200, dur);
  const s = 0.5 * saw(freq, t) + 0.3 * sine(freq, t) + 0.1 * sine(freq * 2, t);
  const cutoff = Math.max(0, 1 - t / (dur * 1.5));
  return 0.35 * env * s * (0.4 + 0.6 * cutoff);
}

// --- MELODY ---
// Simple 4-bar melody in C major (repeated)
// C4=262, D4=294, E4=330, G4=392, A4=440, C5=523, B4=494
const MEL = [330, 330, 392, 440, 392, 330, 294, 330, 262, 294, 330, 392, 330, 294, 262, 0];
const MEL_DUR = BEAT / 2; // 8th note melody

function melody(freq, t, dur) {
  const env = adsr(t, 20, 200, 0.5, 400, dur);
  const s = 0.6 * sine(freq, t) + 0.2 * sine(freq * 2, t) + 0.05 * sine(freq * 3, t);
  return 0.25 * env * s;
}

// --- CHORD PADS ---
// Soft chord stabs on beat 1 of every bar
const CHORDS = [
  [262, 330, 392], // C major
  [262, 330, 392],
  [196, 247, 294], // G major
  [196, 247, 294],
  [220, 277, 330], // A minor
  [220, 277, 330],
  [174, 220, 261], // F major
  [174, 220, 261],
];

function pad(freq, t, dur) {
  const env = adsr(t, BEAT * 0.5, BEAT * 0.5, 0.4, BEAT, dur);
  return 0.08 * env * sine(freq, t);
}

// --- FILL EVERYTHING ---
const numBars = Math.ceil(NUM_SAMPLES / BAR);

for (let bar = 0; bar < numBars; bar++) {
  const barStart = Math.round(bar * BAR);

  // Drums
  for (let beat = 0; beat < 4; beat++) {
    const bStart = Math.round(barStart + beat * BEAT);
    // Kick on 1 & 3
    if (beat === 0 || beat === 2) addEvent(bStart, Math.round(BEAT * 0.8), kick);
    // Snare on 2 & 4
    if (beat === 1 || beat === 3) addEvent(bStart, Math.round(BEAT * 0.5), snare);
    // Hi-hat every 8th note (2 per beat)
    addEvent(bStart, Math.round(BEAT * 0.25), (t, d) => hihat(t, d));
    addEvent(Math.round(bStart + BEAT / 2), Math.round(BEAT * 0.25), (t, d) => hihat(t, d));
    // Open hi-hat on beat 4+
    if (beat === 3) addEvent(Math.round(bStart + BEAT / 2), Math.round(BEAT * 0.5), (t, d) => hihat(t, d, true));
  }

  // Bass (note per bar, split into 2 half-bars)
  const bassNote = BASS_NOTES[bar % BASS_NOTES.length];
  const bassNote2 = BASS_NOTES[(bar + 1) % BASS_NOTES.length];
  addEvent(barStart, Math.round(BAR / 2), (t, d) => bass(bassNote, t, d));
  addEvent(Math.round(barStart + BAR / 2), Math.round(BAR / 2), (t, d) => bass(bassNote2, t, d));

  // Chord pad on beat 1 only
  if (bar >= 2) { // start pads after 2 bars of intro
    const chord = CHORDS[bar % CHORDS.length];
    for (const freq of chord) {
      addEvent(barStart, Math.round(BAR * 0.9), (t, d) => pad(freq, t, d));
    }
  }

  // Melody (starts bar 4)
  if (bar >= 4) {
    for (let n = 0; n < 16; n++) {
      const freq = MEL[n % MEL.length];
      if (freq === 0) continue;
      const nStart = Math.round(barStart + n * MEL_DUR);
      if (nStart >= NUM_SAMPLES) break;
      addEvent(nStart, Math.round(MEL_DUR * 0.85), (t, d) => melody(freq, t, d));
    }
  }
}

// Normalize & apply fade-in/fade-out
const FADE_IN = SAMPLE_RATE * 1.5;
const FADE_OUT = SAMPLE_RATE * 3;
let peak = 0;
for (let i = 0; i < NUM_SAMPLES; i++) {
  if (Math.abs(buf[i]) > peak) peak = Math.abs(buf[i]);
}
const gain = 0.85 / peak;
for (let i = 0; i < NUM_SAMPLES; i++) {
  let s = buf[i] * gain;
  if (i < FADE_IN) s *= i / FADE_IN;
  if (i > NUM_SAMPLES - FADE_OUT) s *= (NUM_SAMPLES - i) / FADE_OUT;
  buf[i] = Math.max(-1, Math.min(1, s));
}

// Write WAV
function writeWav(filename, samples, sampleRate) {
  const dataLength = samples.length * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  const pcm = Buffer.alloc(dataLength);
  for (let i = 0; i < samples.length; i++) {
    const val = Math.round(samples[i] * 32767);
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, val)), i * 2);
  }
  writeFileSync(filename, Buffer.concat([header, pcm]));
  console.log(`Written: ${filename} (${(dataLength / 1024 / 1024).toFixed(1)} MB)`);
}

writeWav("public/bgmusic.wav", buf, SAMPLE_RATE);
