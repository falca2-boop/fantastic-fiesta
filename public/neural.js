/* JARVIS Neural Pulse
   Lebendiges neuronales Netz: gebündelte Fasern, perlenartige Linien, leuchtende Knoten, Lichtimpulse, die durch die
   Verbindungen wandern und Knoten zum Aufleuchten bringen.
   - #bg  : Netz im Hintergrund der ganzen Seite
   - #orb : "Soma", ein Hub-Neuron mit Dendriten; dient als Sprach-Orb (Klick = Sprechen)
   API (unverändert): window.Orb.setMode('idle'|'listening'|'thinking'|'speaking'), setAudioLevel(0..1), getMode(), burst(n) */
(function () {
  'use strict';
  const bgCanvas = document.getElementById('bg');
  const orbCanvas = document.getElementById('orb');
  if (!bgCanvas || !orbCanvas) return;
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const bctx = bgCanvas.getContext('2d');
  const octx = orbCanvas.getContext('2d');

  // Akzentfarbe aus dem CSS (--accent-rgb), damit sie an einer Stelle änderbar ist
  const rgbv = (getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb') || '0, 229, 255').split(',').map((n) => parseInt(n, 10));
  const C = { r: rgbv[0] || 0, g: rgbv[1] || 229, b: rgbv[2] || 255 };
  const rgba = (a) => `rgba(${C.r},${C.g},${C.b},${a})`;

  function mulberry32(seed) {
    let a = seed | 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function sprite(size, stops) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return c;
  }
  const glow = sprite(64, [[0, 'rgba(255,255,255,1)'], [0.1, rgba(0.95)], [0.35, rgba(0.28)], [1, rgba(0)]]);
  const disc = sprite(128, [[0, rgba(0.0)], [0.62, rgba(0.30)], [0.86, rgba(0.5)], [0.96, rgba(0.08)], [1, rgba(0)]]);

  // ------------------------------------------------------------------------------------------ Zustand
  const MODES = {
    idle:      { rate: 0.7, speed: 0.55, energy: 0.2, chain: 0.5 },
    listening: { rate: 1.8, speed: 0.8,  energy: 0.5, chain: 0.6 },
    thinking:  { rate: 8,   speed: 1.5,  energy: 0.7, chain: 0.8 },
    speaking:  { rate: 4.5, speed: 1.05, energy: 0.85, chain: 0.7 },
  };
  const state = { mode: 'idle', audio: 0, energy: 0.2, quality: 1, time: 0 };
  const strandOffsets = () => (state.quality ? [-1.5, -0.5, 0.5, 1.5] : [-0.5, 0.5]);

  // ---------------------------------------------------------------------------------------- Netz
  class Net {
    constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.nodes = []; this.edges = []; this.pulses = []; this.acc = 0; this.w = 0; this.h = 0; this.dust = []; this.bokeh = []; }

    connect() {
      this.nodes.forEach((n) => { n.edges = []; });
      this.edges.forEach((e, i) => { this.nodes[e.a].edges.push(i); this.nodes[e.b].edges.push(i); });
    }

    layoutField(w, h) {
      this.w = w; this.h = h; this.nodes = []; this.edges = []; this.pulses = [];
      const rng = mulberry32(7);
      const target = Math.round(Math.min(92, Math.max(34, (w * h) / 20000)));
      const minD = Math.sqrt((w * h) / target) * 0.72;
      let tries = 0;
      while (this.nodes.length < target && tries++ < 5000) {
        const x = rng() * w, y = rng() * h;
        if (this.nodes.every((n) => Math.hypot(n.bx - x, n.by - y) > minD)) this.nodes.push({ bx: x, by: y, x, y, r: 1.1 + rng() * rng() * 3.2, ph: rng() * 6.28, flash: 0, hub: false });
      }
      [...this.nodes].sort((a, b) => b.r - a.r).slice(0, Math.max(3, Math.floor(target / 13))).forEach((n) => { n.r = 4.5 + rng() * 2.5; n.hub = true; });
      const seen = new Set();
      this.nodes.forEach((n, i) => {
        const near = this.nodes.map((m, j) => ({ j, d: Math.hypot(n.bx - m.bx, n.by - m.by) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d);
        const k = 2 + (rng() < 0.5 ? 1 : 0) + (n.hub ? 2 : 0);
        for (let q = 0; q < k && q < near.length; q++) {
          const j = near[q].j, key = i < j ? i + '-' + j : j + '-' + i;
          if (!seen.has(key)) { seen.add(key); this.edges.push({ a: i, b: j, bend: (rng() - 0.5) * 0.7 }); }
        }
      });
      this.connect();
      // Bokeh (unscharfe Lichtflecken) und Staub
      this.bokeh = Array.from({ length: Math.round(w * h / 90000) + 6 }, () => ({ x: rng() * w, y: rng() * h, r: 16 + rng() * 34, a: 0.07 + rng() * 0.1, vx: (rng() - 0.5) * 4, vy: (rng() - 0.5) * 4 }));
      this.dust = Array.from({ length: Math.round(w * h / 9000) }, () => ({ x: rng() * w, y: rng() * h, r: 0.4 + rng() * 1.1, a: 0.15 + rng() * 0.5, vx: (rng() - 0.5) * 6, vy: (rng() - 0.5) * 6 }));
    }

    layoutNeuron(s) {
      this.w = this.h = s; this.nodes = []; this.edges = []; this.pulses = []; this.dust = []; this.bokeh = [];
      const rng = mulberry32(21);
      const cx = s / 2, cy = s / 2;
      this.nodes.push({ bx: cx, by: cy, x: cx, y: cy, r: 8, ph: 0, flash: 0, hub: true, soma: true });
      const branches = 9;
      for (let i = 0; i < branches; i++) {
        const ang = (i / branches) * Math.PI * 2 + (rng() - 0.5) * 0.4;
        const L = s * (0.32 + rng() * 0.11);
        const tx = cx + Math.cos(ang) * L, ty = cy + Math.sin(ang) * L;
        const ti = this.nodes.length;
        this.nodes.push({ bx: tx, by: ty, x: tx, y: ty, r: 3 + rng() * 2, ph: rng() * 6.28, flash: 0 });
        this.edges.push({ a: 0, b: ti, bend: (rng() - 0.5) * 0.5 });
        const kids = 1 + (rng() < 0.7 ? 1 : 0);
        for (let k = 0; k < kids; k++) {
          const a2 = ang + (k ? 0.55 : -0.5) * (0.7 + rng() * 0.6);
          const L2 = s * (0.10 + rng() * 0.07);
          const kx = tx + Math.cos(a2) * L2, ky = ty + Math.sin(a2) * L2;
          const ki = this.nodes.length;
          this.nodes.push({ bx: kx, by: ky, x: kx, y: ky, r: 1.6 + rng() * 1.6, ph: rng() * 6.28, flash: 0 });
          this.edges.push({ a: ti, b: ki, bend: (rng() - 0.5) * 0.6 });
        }
      }
      this.connect();
      this.ring = Array.from({ length: 16 }, () => ({ a: rng() * 6.28, rx: 14 + rng() * 20, ry: 10 + rng() * 16, sp: (0.4 + rng()) * (rng() < 0.5 ? 1 : -1), s: 0.6 + rng() * 1.2 }));
    }

    // Geometrie einer Kante (Strang mit Versatz off in "Spreizeinheiten")
    geom(e, off) {
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const k = e.bend * len + off * len * 0.05;
      return { ax: A.x, ay: A.y, bx: B.x, by: B.y, cx: (A.x + B.x) / 2 + nx * k, cy: (A.y + B.y) / 2 + ny * k, len };
    }

    spawn(edgeIndex, dir, big) {
      if (this.pulses.length >= Math.round(70 * (state.quality ? 1 : 0.5))) return;
      this.pulses.push({ e: edgeIndex, t: dir > 0 ? 0 : 1, dir, v: 0.85 + Math.random() * 0.5, big: !!big });
    }

    spawnByMode(mode, n = 1) {
      if (!this.edges.length) return;
      for (let q = 0; q < n; q++) {
        if (this.kind === 'neuron') {
          const outward = mode === 'speaking' || mode === 'thinking' || (mode === 'idle' && Math.random() < 0.5);
          if (outward) { const roots = this.nodes[0].edges; this.spawn(roots[Math.floor(Math.random() * roots.length)], +1, true); }
          else { const leaf = this.edges.map((_, i) => i).filter((i) => this.edges[i].a !== 0); this.spawn(leaf[Math.floor(Math.random() * leaf.length)], -1); }
        } else {
          const i = Math.floor(Math.random() * this.edges.length);
          this.spawn(i, Math.random() < 0.5 ? 1 : -1);
        }
      }
    }

    update(dt, cfg) {
      this.acc += cfg.rate * dt * (this.kind === 'neuron' ? 1.2 : 1) * (1 + state.audio * 2.5);
      while (this.acc >= 1) { this.acc -= 1; this.spawnByMode(state.mode, 1); }
      for (const n of this.nodes) {
        n.flash = Math.max(0, n.flash - dt * 2.2);
        n.x = n.bx + Math.sin(state.time * 0.35 + n.ph) * (this.kind === 'field' ? 3.5 : 1.2);
        n.y = n.by + Math.cos(state.time * 0.31 + n.ph * 1.3) * (this.kind === 'field' ? 3.5 : 1.2);
      }
      const alive = [];
      for (const p of this.pulses) {
        const g = this.geom(this.edges[p.e], 0);
        p.t += p.dir * (p.v * cfg.speed * 150 * (0.7 + state.energy)) * dt / g.len;
        if (p.t >= 1 || p.t <= 0) {
          const e = this.edges[p.e];
          const at = p.dir > 0 ? e.b : e.a;
          const node = this.nodes[at];
          node.flash = 1;
          if (Math.random() < cfg.chain) {
            const next = node.edges.filter((i) => i !== p.e);
            const take = Math.min(next.length, Math.random() < 0.3 ? 2 : 1);
            for (let q = 0; q < take; q++) {
              const i = next.splice(Math.floor(Math.random() * next.length), 1)[0];
              if (i !== undefined) this.spawn(i, this.edges[i].a === at ? +1 : -1, p.big);
            }
          }
        } else alive.push(p);
      }
      this.pulses = alive;
      if (this.dust.length) {
        for (const d of this.dust) { d.x += d.vx * dt; d.y += d.vy * dt; if (d.x < 0) d.x += this.w; if (d.x > this.w) d.x -= this.w; if (d.y < 0) d.y += this.h; if (d.y > this.h) d.y -= this.h; }
        for (const b of this.bokeh) { b.x += b.vx * dt; b.y += b.vy * dt; if (b.x < -50) b.x = this.w + 50; if (b.x > this.w + 50) b.x = -50; if (b.y < -50) b.y = this.h + 50; if (b.y > this.h + 50) b.y = -50; }
      }
    }

    draw(strength) {
      const ctx = this.ctx;
      ctx.globalCompositeOperation = 'lighter';
      // Bokeh
      if (state.quality) for (const b of this.bokeh) { ctx.globalAlpha = b.a * strength; ctx.drawImage(disc, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); }
      // Fasern: pro Strang ein Pfad, Linien durchgezogen oder perlenartig gestrichelt
      const offs = strandOffsets();
      ctx.lineCap = 'round';
      offs.forEach((off) => {
        const solid = Math.abs(off) < 1;
        ctx.beginPath();
        for (const e of this.edges) { const g = this.geom(e, off); ctx.moveTo(g.ax, g.ay); ctx.quadraticCurveTo(g.cx, g.cy, g.bx, g.by); }
        if (solid) { ctx.setLineDash([]); ctx.lineWidth = this.kind === 'neuron' ? 1.1 : 0.9; ctx.strokeStyle = rgba(0.2 * strength + state.energy * 0.12); }
        else { ctx.setLineDash([1.2, 6]); ctx.lineDashOffset = -state.time * 9 * (off < 0 ? 1 : -1); ctx.lineWidth = this.kind === 'neuron' ? 1.8 : 1.5; ctx.strokeStyle = rgba(0.5 * strength + state.energy * 0.2); }
        ctx.stroke();
      });
      ctx.setLineDash([]);
      // Impulse mit Schweif
      for (const p of this.pulses) {
        const g = this.geom(this.edges[p.e], 0);
        for (let k = 0; k < 6; k++) {
          const t = Math.min(1, Math.max(0, p.t - p.dir * k * 0.022));
          const u = 1 - t, x = u * u * g.ax + 2 * u * t * g.cx + t * t * g.bx, y = u * u * g.ay + 2 * u * t * g.cy + t * t * g.by;
          const size = (p.big ? 26 : 22) * (1 - k * 0.14) * (0.8 + state.energy * 0.6);
          ctx.globalAlpha = (k === 0 ? 1 : 0.55 - k * 0.08) * Math.min(1, strength + 0.2);
          ctx.drawImage(glow, x - size / 2, y - size / 2, size, size);
        }
      }
      // Knoten
      for (const n of this.nodes) {
        const base = n.soma ? 54 + state.energy * 46 : n.r * (n.hub ? 5.2 : 4.4);
        const size = base + n.flash * (n.soma ? 40 : 22);
        ctx.globalAlpha = Math.min(1, (n.hub ? 0.85 : 0.6) * strength + n.flash * 0.6 + (n.soma ? 0.15 : 0));
        ctx.drawImage(glow, n.x - size / 2, n.y - size / 2, size, size);
        ctx.globalAlpha = Math.min(1, 0.7 * strength + n.flash * 0.5);
        ctx.fillStyle = '#e8feff';
        ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(0.8, n.r * (n.soma ? 0.55 : 0.36)), 0, Math.PI * 2); ctx.fill();
      }
      // Soma: kreisende Partikel
      if (this.ring) {
        const s = this.nodes[0];
        for (const r of this.ring) {
          const a = r.a + state.time * r.sp * (0.5 + state.energy);
          const x = s.x + Math.cos(a) * r.rx * (1 + state.energy * 0.3), y = s.y + Math.sin(a) * r.ry * (1 + state.energy * 0.3);
          ctx.globalAlpha = 0.85; const z = 7 * r.s; ctx.drawImage(glow, x - z / 2, y - z / 2, z, z);
        }
      }
      // Staub
      for (const d of this.dust) { ctx.globalAlpha = d.a * strength; ctx.fillStyle = rgba(1); ctx.fillRect(d.x, d.y, d.r, d.r); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  const field = new Net(bctx, 'field');
  const neuron = new Net(octx, 'neuron');

  // ----------------------------------------------------------------------------------- Größe / Schleife
  let bgW = 0, bgH = 0, orbS = 0, dprBg = 1, dprOrb = 1;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    dprBg = Math.min(window.devicePixelRatio || 1, state.quality ? 1.5 : 1);
    bgCanvas.width = Math.round(w * dprBg); bgCanvas.height = Math.round(h * dprBg);
    bctx.setTransform(dprBg, 0, 0, dprBg, 0, 0);
    if (w !== bgW || h !== bgH) { bgW = w; bgH = h; field.layoutField(w, h); }
    const r = orbCanvas.getBoundingClientRect(); const s = Math.max(120, Math.round(r.width || 250));
    dprOrb = Math.min(window.devicePixelRatio || 1, 2);
    orbCanvas.width = Math.round(s * dprOrb); orbCanvas.height = Math.round(s * dprOrb);
    octx.setTransform(dprOrb, 0, 0, dprOrb, 0, 0);
    if (s !== orbS) { orbS = s; neuron.layoutNeuron(s); }
  }
  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });
  if (window.ResizeObserver) new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 100); }).observe(orbCanvas);

  let last = 0, costEma = 8, slow = 0, minInterval = 22;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = ts; return; }
    const elapsed = ts - last;
    if (elapsed < minInterval) return;
    last = ts;
    const dt = Math.min(0.05, elapsed / 1000) * (reduce ? 0.35 : 1);
    const t0 = performance.now();

    const cfg = MODES[state.mode];
    state.time += dt;
    state.energy += ((cfg.energy + state.audio * 0.5) - state.energy) * Math.min(1, dt * 3);

    field.update(dt, { ...cfg, rate: cfg.rate * 0.55 });
    neuron.update(dt, cfg);
    bctx.clearRect(0, 0, bgW, bgH);
    field.draw(1.7);
    octx.clearRect(0, 0, orbS, orbS);
    neuron.draw(1);

    // Bei Rucklern erst Auflösung und Faserzahl senken, dann die Bildrate
    costEma += ((performance.now() - t0) - costEma) * 0.08;
    if (costEma > 15 && state.quality) { if (++slow > 80) { state.quality = 0; minInterval = 33; slow = 0; resize(); } } else slow = Math.max(0, slow - 1);
  }

  resize();
  // Start: ein paar Impulse, damit das Netz sofort lebt
  field.spawnByMode('idle', 10); neuron.spawnByMode('speaking', 4);
  requestAnimationFrame(frame);

  window.Orb = {
    setMode(m) { if (MODES[m]) { const was = state.mode; state.mode = m; if (m !== was) { field.spawnByMode(m, m === 'thinking' ? 8 : 3); neuron.spawnByMode(m, m === 'thinking' ? 6 : 3); } } },
    setAudioLevel(v) { state.audio = Math.max(0, Math.min(1, v)); },
    getMode() { return state.mode; },
    burst(n = 6) { field.spawnByMode('thinking', n); neuron.spawnByMode('speaking', Math.ceil(n / 2)); },
  };
})();
