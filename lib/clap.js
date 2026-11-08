/**
 * Erkennt "zweimal klatschen" in einem Audiostrom (Mono, 16-bit oder Float).
 * Es wird nur die Lautstärke pro 10-ms-Block ausgewertet; Audio wird weder gespeichert noch verschickt.
 *
 * Ein Klatscher ist ein kurzer, scharfer Ausschlag (höchstens ~150 ms) deutlich über dem Grundrauschen.
 * Lange Geräusche (Sprechen, Musik) zählen nicht. Zwei Klatscher im Abstand 180–900 ms lösen onDouble aus.
 * Drei oder mehr hintereinander (Applaus) werden verworfen.
 */
export class ClapDetector {
  constructor({ sampleRate = 16000, sensitivity = 6, onClap = () => {}, onDouble = () => {}, minAbs = 0.03 } = {}) {
    this.frameLen = Math.round(sampleRate / 100);          // 10 ms
    this.k = 13 - Math.max(1, Math.min(10, sensitivity));  // Empfindlichkeit 1..10 -> Faktor 12..3 über dem Rauschen
    this.minAbs = minAbs;
    this.onClap = onClap; this.onDouble = onDouble;
    this.buf = new Float32Array(this.frameLen); this.fill = 0;
    this.frame = 0;                                        // Zähler der 10-ms-Blöcke (Zeit)
    this.floor = 0.005;
    this.state = 'idle';
    this.burst = 0; this.quiet = 0; this.burstStart = 0;
    this.lastClap = -1e9;
    this.count = 0; this.firstT = 0; this.secondT = 0; this.cooldownUntil = 0;
    this.maxBurst = 15;
  }

  get timeMs() { return this.frame * 10; }

  /** samples: Int16Array (oder Float32Array in -1..1) */
  push(samples) {
    const isInt = samples instanceof Int16Array;
    for (let i = 0; i < samples.length; i++) {
      this.buf[this.fill++] = isInt ? samples[i] / 32768 : samples[i];
      if (this.fill === this.frameLen) { this.process(); this.fill = 0; }
    }
  }

  process() {
    let s = 0;
    for (let i = 0; i < this.frameLen; i++) s += this.buf[i] * this.buf[i];
    const e = Math.sqrt(s / this.frameLen);
    this.frame++;
    const t = this.timeMs;
    const thr = Math.max(this.floor * this.k, this.minAbs);

    if (this.state === 'idle') {
      this.floor += (e - this.floor) * (e > this.floor ? 0.01 : 0.05);   // Rauschen langsam nachführen
      this.floor = Math.max(0.002, this.floor);
      if (e > thr) { this.state = 'burst'; this.burst = 1; this.quiet = 0; this.burstStart = t; }
    } else if (this.state === 'burst') {
      if (e > thr * 0.35) {
        this.quiet = 0;
        if (++this.burst > this.maxBurst) { this.state = 'long'; this.quiet = 0; }   // zu lang: Sprache, Musik, Lärm
      } else if (++this.quiet >= 2) {
        this.state = 'idle';
        this.registerClap(this.burstStart);
      }
    } else if (this.state === 'long') {
      if (e < thr * 0.35) { if (++this.quiet >= 20) this.state = 'idle'; } else this.quiet = 0;
    }

    // Wartezeiten der Zählung
    if (this.count === 1 && t - this.firstT > 900) this.count = 0;
    if (this.count === 2 && t >= this.secondT + 450) {          // kein dritter Klatscher: es war ein Doppelklatscher
      this.count = 0; this.cooldownUntil = t + 4000;
      this.onDouble();
    }
  }

  registerClap(t) {
    if (t - this.lastClap < 120) return;                         // Echo / Nachklang
    this.lastClap = t;
    if (t < this.cooldownUntil) return;
    this.onClap(t);
    if (this.count === 0) { this.count = 1; this.firstT = t; }
    else if (this.count === 1) {
      const gap = t - this.firstT;
      if (gap >= 180 && gap <= 900) { this.count = 2; this.secondT = t; }
      else if (gap > 900) { this.firstT = t; }
    } else if (this.count === 2) {                               // dritter Klatscher: Applaus, verwerfen
      this.count = 0; this.cooldownUntil = t + 2000;
    }
  }
}
