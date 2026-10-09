/* JARVIS Orb — reaktive futuristische Kugel, gerendert auf <canvas>.
   Zustände: idle | listening | thinking | speaking.
   audioLevel (0..1) kann von außen gesetzt werden (Mikrofon-Amplitude). */
(function () {
  const canvas = document.getElementById('orb');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

  const state = {
    mode: 'idle',
    audioLevel: 0,     // externes Signal (Mikro)
    energy: 0.15,      // geglättete Zielenergie
    t: 0,
  };

  const modeEnergy = { idle: 0.15, listening: 0.55, thinking: 0.4, speaking: 0.75 };
  const ACCENT = { r: 56, g: 217, b: 255 };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);

  // Ring-Partikel
  const rings = [];
  for (let i = 0; i < 3; i++) {
    rings.push({ radius: 0.62 + i * 0.12, speed: (i % 2 ? -1 : 1) * (0.18 + i * 0.08), dots: 40 + i * 14, tilt: 0.32 + i * 0.06 });
  }

  function draw() {
    state.t += 0.016;
    // Zielenergie: Modus + Live-Audio
    const target = modeEnergy[state.mode] + state.audioLevel * 0.5;
    state.energy += (target - state.energy) * 0.08;
    const e = state.energy;

    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const base = Math.min(W, H) * 0.30;
    const col = (a) => `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${a})`;

    // Äußerer Glow / Aura
    const pulse = Math.sin(state.t * 2) * 0.5 + 0.5;
    const auraR = base * (1.7 + e * 0.6 + pulse * 0.08 * e);
    const aura = ctx.createRadialGradient(cx, cy, base * 0.4, cx, cy, auraR);
    aura.addColorStop(0, col(0.22 + e * 0.25));
    aura.addColorStop(0.4, col(0.08));
    aura.addColorStop(1, col(0));
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, W, H);

    // Rotierende Ringe aus Punkten
    rings.forEach((ring, ri) => {
      const rr = base * ring.radius * (1 + e * 0.12);
      for (let i = 0; i < ring.dots; i++) {
        const a = (i / ring.dots) * Math.PI * 2 + state.t * ring.speed;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * ring.tilt + Math.sin(a * 2 + state.t) * 2;
        const depth = (Math.sin(a) + 1) / 2; // vorne heller
        const size = (0.6 + depth * 1.8) * (1 + e * 0.5);
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = col(0.15 + depth * 0.55);
        ctx.fill();
      }
    });

    // Wellenförmiger Kern (mehrere verzerrte Kreise)
    const layers = 5;
    for (let L = layers; L >= 1; L--) {
      const lr = base * (0.55 + L * 0.06);
      ctx.beginPath();
      const segs = 90;
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const noise =
          Math.sin(a * 3 + state.t * 1.5 + L) * 0.05 +
          Math.sin(a * 5 - state.t * 2 + L * 2) * 0.04 * (1 + e);
        const r = lr * (1 + noise * (0.4 + e));
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = col(0.06 + (L / layers) * 0.14 * (1 + e));
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Leuchtender Kern
    const coreR = base * (0.5 + e * 0.14 + pulse * 0.03);
    const core = ctx.createRadialGradient(cx, cy - coreR * 0.2, 0, cx, cy, coreR);
    core.addColorStop(0, `rgba(230,250,255,${0.9})`);
    core.addColorStop(0.25, col(0.85));
    core.addColorStop(0.7, col(0.28));
    core.addColorStop(1, col(0));
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();

    // Innere Highlight-Sichel
    ctx.beginPath();
    ctx.arc(cx - coreR * 0.22, cy - coreR * 0.28, coreR * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();

    requestAnimationFrame(draw);
  }

  resize();
  requestAnimationFrame(draw);

  // Öffentliche API
  window.Orb = {
    setMode(m) { if (modeEnergy[m] != null) state.mode = m; },
    setAudioLevel(v) { state.audioLevel = Math.max(0, Math.min(1, v)); },
    getMode() { return state.mode; },
  };
})();
