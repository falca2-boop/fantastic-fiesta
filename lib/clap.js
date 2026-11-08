/**
 * Erkennt "zweimal klatschen" in einem Audiostrom (Mono, 16-bit oder Float).
 * Es wird nur die Lautstärke pro 10-ms-Block ausgewertet; Audio wird weder gespeichert noch verschickt.
 *
 * Gegen Hintergrundgeräusche:
 *  - Anstieg: Ein Klatscher steigt innerhalb von 10 ms deutlich über den Pegel der letzten ~150 ms. Gleichmäßige Geräusche
 *    (Lüfter, Rauschen, Musik, Gespräch) haben keinen solchen Sprung, egal wie laut sie sind.
 *  - Höhen: Zusätzlich muss die Energie oberhalb von ca. 1 kHz mitsteigen. Brummen, Bässe, Türen und Stimmen-Grundton fallen weg.
 *  - Dauer: Ein Klatscher klingt über mindestens zwei Blöcke nach (Raumhall), ein Klick (Tastatur, Knacken) ist im nächsten Block
 *    schon weg; sehr lange Geräusche (Sprache, Musik) zählen auch nicht.
 * Zwei Klatscher im Abstand 180–900 ms lösen onDouble aus. Drei oder mehr hintereinander (Applaus) werden verworfen.
 */
export class ClapDetector {
  constructor({ sampleRate = 16000, sensitivity = 6, onClap = () => {}, onDouble = () => {}, minAbs = 0.02 } = {}) {
    this.frameLen = Math.round(sampleRate / 100);            // 10 ms
    const s = Math.max(1, Math.min(10, sensitivity));
    this.rise = 4.4 - 0.3 * s;                               // nötiger Anstieg gegenüber dem Umfeld: Stufe 6 -> 2,6-fach
    this.riseHigh = this.rise * 0.9;                         // ... und in den Höhen
    this.minAbs = minAbs;
    this.onClap = onClap; this.onDouble = onDouble;
    this.buf = new Float32Array(this.frameLen); this.fill = 0;
    this.prevSample = 0;
    this.frame = 0;
    this.hist = new Float32Array(16); this.histH = new Float32Array(16); this.hi = 0;   // Pegelverlauf gesamt / Höhen
    this.floor = 0.004;
    this.state = 'idle';
    this.base = 0; this.baseH = 0; this.ex1 = 0; this.burst = 0; this.quiet = 0; this.burstStart = 0; this.peakH = 0; this.peak = 0;
    this.lastClap = -1e9;
    this.count = 0; this.firstT = 0; this.secondT = 0; this.cooldownUntil = 0;
    this.maxBurst = 15;
  }

  get timeMs() { return this.frame * 10; }

  push(samples) {
    const isInt = samples instanceof Int16Array;
    for (let i = 0; i < samples.length; i++) {
      this.buf[this.fill++] = isInt ? samples[i] / 32768 : samples[i];
      if (this.fill === this.frameLen) { this.process(); this.fill = 0; }
    }
  }

  /** Mittelwert des Pegelverlaufs der letzten n Blöcke vor dem aktuellen (ohne die letzten `skip`). */
  mean(arr, n, skip) { let s = 0; for (let k = 0; k < n; k++) s += arr[(this.hi - 1 - skip - k + 32) % 16]; return s / n; }

  process() {
    let s = 0, sh = 0, p = this.prevSample;
    for (let i = 0; i < this.frameLen; i++) {
      const x = this.buf[i], h = x - 0.95 * p; p = x;           // einfacher Hochpass (Höhenanteil)
      s += x * x; sh += h * h;
    }
    this.prevSample = p;
    const e = Math.sqrt(s / this.frameLen), eh = Math.sqrt(sh / this.frameLen);
    this.frame++;
    const t = this.timeMs;

    if (this.frame <= 40) {                                        // die ersten 0,4 s: nur den Umgebungspegel lernen
      this.floor += (e - this.floor) * 0.15;
      this.hist[this.hi % 16] = e; this.histH[this.hi % 16] = eh; this.hi++;
      return;
    }

    if (this.state === 'idle') {
      this.floor += (e - this.floor) * (e > this.floor ? 0.01 : 0.05);
      this.floor = Math.max(0.002, this.floor);
      const ref = this.mean(this.hist, 12, 1) + 1e-4, refH = this.mean(this.histH, 12, 1) + 1e-4;   // Umfeld der letzten ~120 ms
      if (e > this.minAbs && e > ref * this.rise && eh > refH * this.riseHigh && eh > 0.01) {
        this.state = 'burst'; this.burst = 1; this.quiet = 0; this.burstStart = t;
        this.base = ref; this.baseH = refH; this.peak = e; this.peakH = eh;
        this.ex1 = Math.sqrt(Math.max(0, e * e - ref * ref));
      }
    } else if (this.state === 'burst') {
      if (this.burst === 1 && Math.sqrt(Math.max(0, e * e - this.base * this.base)) < 0.3 * this.ex1) {
        this.state = 'idle';                                       // Klick: schon im nächsten Block wieder weg
      } else if (e > this.base * 1.6 + 0.004) {                         // noch deutlich lauter als vor dem Knall
        this.quiet = 0; this.peak = Math.max(this.peak, e); this.peakH = Math.max(this.peakH, eh);
        if (++this.burst > this.maxBurst) { this.state = 'long'; this.quiet = 0; }
      } else if (++this.quiet >= 2) {
        this.state = 'idle';
        this.registerClap(this.burstStart);
      }
    } else if (this.state === 'long') {
      this.floor += (e - this.floor) * (e > this.floor ? 0.02 : 0.05);      // Umgebungspegel läuft nach (neue Dauergeräusche)
      if (e < Math.max(this.base * 1.6 + 0.01, this.floor * 1.5 + 0.005)) { if (++this.quiet >= 20) this.state = 'idle'; } else this.quiet = 0;
    }
    this.hist[this.hi % 16] = e; this.histH[this.hi % 16] = eh; this.hi++;

    if (this.count === 1 && t - this.firstT > 900) this.count = 0;
    if (this.count === 2 && t >= this.secondT + 450) {
      this.count = 0; this.cooldownUntil = t + 4000;
      this.onDouble();
    }
  }

  registerClap(t) {
    if (t - this.lastClap < 120) return;
    this.lastClap = t;
    if (t < this.cooldownUntil) return;
    this.onClap(t);
    if (this.count === 0) { this.count = 1; this.firstT = t; }
    else if (this.count === 1) {
      const gap = t - this.firstT;
      if (gap >= 180 && gap <= 900) { this.count = 2; this.secondT = t; }
      else if (gap > 900) { this.firstT = t; }
    } else if (this.count === 2) {
      this.count = 0; this.cooldownUntil = t + 2000;
    }
  }
}
