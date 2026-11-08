import { GraphData } from './types';

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Setzt pro Knoten `weight` (0..1, nach Verlinkung) und `cluster` (Gemeinschaft).
 * Cluster: Label-Propagation über Links und Tag-Bündel; kleine Splitter werden dem
 * stärksten Nachbarn zugeschlagen, Verwaiste gruppieren sich nach Ordner.
 */
export function analyzeGraph(data: GraphData): void {
  const { nodes, links } = data;
  const n = nodes.length;
  if (!n) { data.clusterCount = 0; return; }

  // Gewicht: Verlinkung, Backlinks zählen stärker
  const metric = nodes.map((nd) => (nd.kind === 'tag' ? nd.degree * 0.6 : nd.degree + 0.5 * nd.in.length));
  const maxM = Math.max(1, ...metric);
  const norm = Math.log1p(maxM);
  nodes.forEach((nd, i) => { nd.weight = Math.log1p(metric[i]) / norm; });

  // Nachbarschaft
  const adj: { j: number; w: number }[][] = Array.from({ length: n }, () => []);
  for (const l of links) {
    const w = l.kind === 'link' ? 1 + Math.log1p(l.weight) : 0.7;
    adj[l.source].push({ j: l.target, w });
    adj[l.target].push({ j: l.source, w });
  }

  // Label-Propagation
  const rng = mulberry32(12345);
  const labels = new Int32Array(n);
  for (let i = 0; i < n; i++) labels[i] = i;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let iter = 0; iter < 20; iter++) {
    for (let i = n - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [order[i], order[k]] = [order[k], order[i]]; }
    let changed = false;
    for (const i of order) {
      if (!adj[i].length) continue;
      const sums = new Map<number, number>();
      for (const { j, w } of adj[i]) sums.set(labels[j], (sums.get(labels[j]) ?? 0) + w);
      let best = labels[i], bestW = -1;
      for (const [l, s] of sums) {
        if (s > bestW + 1e-9 || (Math.abs(s - bestW) <= 1e-9 && rng() < 0.5)) { best = l; bestW = s; }
      }
      if (best !== labels[i]) { labels[i] = best; changed = true; }
    }
    if (!changed) break;
  }

  // Kleine Gemeinschaften (< 3 Knoten) dem stärksten Nachbarn zuschlagen
  const sizeOf = () => { const m = new Map<number, number>(); for (let i = 0; i < n; i++) m.set(labels[i], (m.get(labels[i]) ?? 0) + 1); return m; };
  let sizes = sizeOf();
  for (let i = 0; i < n; i++) {
    if ((sizes.get(labels[i]) ?? 0) >= 3 || !adj[i].length) continue;
    const sums = new Map<number, number>();
    for (const { j, w } of adj[i]) if (labels[j] !== labels[i] && (sizes.get(labels[j]) ?? 0) >= 3) sums.set(labels[j], (sums.get(labels[j]) ?? 0) + w);
    let best = -1, bestW = 0;
    for (const [l, s] of sums) if (s > bestW) { best = l; bestW = s; }
    if (best >= 0) labels[i] = best;
  }
  sizes = sizeOf();

  // Knoten ohne Kanten: nach Ordner gruppieren
  const folderLabel = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    if (adj[i].length) continue;
    const key = nodes[i].folder.split('/')[0] || '(root)';
    if (!folderLabel.has(key)) folderLabel.set(key, n + (hashString(key) % 100000));
    labels[i] = folderLabel.get(key)!;
  }
  sizes = sizeOf();

  // Größte Gemeinschaft = Cluster 0
  const ranked = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const remap = new Map<number, number>();
  ranked.forEach(([l], k) => remap.set(l, k));
  for (let i = 0; i < n; i++) nodes[i].cluster = remap.get(labels[i])!;
  data.clusterCount = ranked.length;
}

// ---------------------------------------------------------------------------------------------
// Barnes-Hut-Oktalbaum für die Abstoßung (O(n log n))
// ---------------------------------------------------------------------------------------------
class Octree {
  private cap = 0;
  private count = 0;
  private ox = new Float32Array(0); private oy = new Float32Array(0); private oz = new Float32Array(0);
  private half = new Float32Array(0);
  private mx = new Float32Array(0); private my = new Float32Array(0); private mz = new Float32Array(0);
  private mass = new Float32Array(0);
  private child = new Int32Array(0);
  private body = new Int32Array(0);       // -1 leer, >=0 Blatt mit Körper, -2 innerer Knoten
  private stack = new Int32Array(1024);

  private grow(min: number) {
    const cap = Math.max(min, this.cap * 2, 64);
    const f = (a: Float32Array) => { const b = new Float32Array(cap); b.set(a); return b; };
    this.ox = f(this.ox); this.oy = f(this.oy); this.oz = f(this.oz); this.half = f(this.half);
    this.mx = f(this.mx); this.my = f(this.my); this.mz = f(this.mz); this.mass = f(this.mass);
    const ch = new Int32Array(cap * 8); ch.set(this.child); this.child = ch;
    const bd = new Int32Array(cap); bd.set(this.body); this.body = bd;
    this.cap = cap;
  }

  private newCell(ox: number, oy: number, oz: number, half: number): number {
    if (this.count >= this.cap) this.grow(this.count + 1);
    const c = this.count++;
    this.ox[c] = ox; this.oy[c] = oy; this.oz[c] = oz; this.half[c] = half;
    this.mx[c] = 0; this.my[c] = 0; this.mz[c] = 0; this.mass[c] = 0;
    this.body[c] = -1;
    this.child.fill(-1, c * 8, c * 8 + 8);
    return c;
  }

  private childOf(c: number, x: number, y: number, z: number): number {
    const oct = (x > this.ox[c] ? 1 : 0) | (y > this.oy[c] ? 2 : 0) | (z > this.oz[c] ? 4 : 0);
    let ch = this.child[c * 8 + oct];
    if (ch === -1) {
      const h = this.half[c] / 2;
      ch = this.newCell(this.ox[c] + (oct & 1 ? h : -h), this.oy[c] + (oct & 2 ? h : -h), this.oz[c] + (oct & 4 ? h : -h), h);
      this.child[c * 8 + oct] = ch;
    }
    return ch;
  }

  build(pos: Float32Array, m: Float32Array, n: number) {
    this.count = 0;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const half = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 1;
    this.newCell((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, half);

    for (let b = 0; b < n; b++) {
      const x = pos[b * 3], y = pos[b * 3 + 1], z = pos[b * 3 + 2], bm = m[b];
      let c = 0, depth = 0;
      for (;;) {
        this.mass[c] += bm; this.mx[c] += x * bm; this.my[c] += y * bm; this.mz[c] += z * bm;
        const bd = this.body[c];
        if (bd === -1) { this.body[c] = b; break; }
        if (bd >= 0) {
          if (depth >= 40) break;                         // deckungsgleiche Punkte: zusammenfassen
          // Blatt aufteilen: vorhandenen Körper eine Ebene tiefer setzen
          this.body[c] = -2;
          const ox = pos[bd * 3], oy = pos[bd * 3 + 1], oz = pos[bd * 3 + 2], om = m[bd];
          const oc = this.childOf(c, ox, oy, oz);
          this.mass[oc] += om; this.mx[oc] += ox * om; this.my[oc] += oy * om; this.mz[oc] += oz * om;
          this.body[oc] = bd;
        }
        c = this.childOf(c, x, y, z);
        depth++;
      }
    }
  }

  /** Abstoßungskraft auf Körper i; addiert in out[0..2]. */
  force(i: number, x: number, y: number, z: number, cr: number, theta2: number, out: Float32Array) {
    const stack = this.stack;
    let sp = 0;
    stack[sp++] = 0;
    let fx = 0, fy = 0, fz = 0;
    while (sp > 0) {
      const c = stack[--sp];
      const cm = this.mass[c];
      if (cm === 0) continue;
      const bd = this.body[c];
      if (bd === i) continue;
      const dx = x - this.mx[c] / cm, dy = y - this.my[c] / cm, dz = z - this.mz[c] / cm;
      let d2 = dx * dx + dy * dy + dz * dz;
      if (bd === -2) {
        const s = this.half[c] * 2;
        if (s * s >= theta2 * d2) {
          const base = c * 8;
          for (let k = 0; k < 8; k++) { const ch = this.child[base + k]; if (ch !== -1) stack[sp++] = ch; }
          continue;
        }
      }
      d2 += 4;                                             // Glättung gegen Singularitäten
      const inv = (cr * cm) / (d2 * Math.sqrt(d2));
      fx += dx * inv; fy += dy * inv; fz += dz * inv;
    }
    out[0] += fx; out[1] += fy; out[2] += fz;
  }
}

// ---------------------------------------------------------------------------------------------
// Kräftebasiertes 3D-Layout
// ---------------------------------------------------------------------------------------------
export class ForceLayout {
  n = 0;
  pos = new Float32Array(0);
  radius = 100;                 // Radius des Universums
  alpha = 0;
  restLength = 30;

  private vel = new Float32Array(0);
  private force = new Float32Array(0);
  private mass = new Float32Array(0);
  private radial = new Float32Array(0);
  private cluster = new Int32Array(0);
  private isTag = new Uint8Array(0);
  private ea = new Int32Array(0); private eb = new Int32Array(0);
  private el = new Float32Array(0); private ek = new Float32Array(0);
  private tree = new Octree();
  private centroids = new Float32Array(0);
  private clusterCount = 0;
  private tickCount = 0;
  private tmp = new Float32Array(3);

  get running(): boolean { return this.n > 0 && this.alpha > 0.02; }

  set(data: GraphData, prev?: Map<string, [number, number, number]>) {
    const { nodes, links } = data;
    const n = nodes.length;
    this.n = n;
    const rng = mulberry32(98765);
    const cbrt = Math.cbrt(Math.max(n, 1));
    this.radius = 14 * cbrt + 26;
    this.restLength = (1.6 * this.radius) / cbrt + 4;
    const R = this.radius;

    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.force = new Float32Array(n * 3);
    this.mass = new Float32Array(n);
    this.radial = new Float32Array(n);
    this.cluster = new Int32Array(n);
    this.isTag = new Uint8Array(n);
    this.clusterCount = data.clusterCount || 1;
    this.centroids = new Float32Array(this.clusterCount * 3);

    const gauss = () => { let s = 0; for (let k = 0; k < 6; k++) s += rng(); return (s - 3) / 0.7; };
    const known: boolean[] = new Array(n).fill(false);
    nodes.forEach((nd, i) => {
      this.mass[i] = 1 + nd.weight * 3;
      this.cluster[i] = nd.cluster;
      this.isTag[i] = nd.kind === 'tag' ? 1 : 0;
      this.radial[i] = nd.kind === 'tag' ? -1 : R * (0.07 + 0.93 * Math.pow(1 - nd.weight, 0.75));
      const p = prev?.get(nd.id);
      if (p) { this.pos.set(p, i * 3); known[i] = true; }
    });

    // neue Knoten: in der Nähe eines bekannten Nachbarn, sonst zufällig auf ihrer Zielschale
    const nbr: number[][] = Array.from({ length: n }, () => []);
    for (const l of links) { nbr[l.source].push(l.target); nbr[l.target].push(l.source); }
    nodes.forEach((nd, i) => {
      if (known[i]) return;
      const anchor = nbr[i].find((j) => known[j]);
      let x = gauss(), y = gauss(), z = gauss();
      const len = Math.hypot(x, y, z) || 1;
      if (anchor !== undefined) {
        const s = this.restLength * 0.7 / len;
        this.pos[i * 3] = this.pos[anchor * 3] + x * s;
        this.pos[i * 3 + 1] = this.pos[anchor * 3 + 1] + y * s;
        this.pos[i * 3 + 2] = this.pos[anchor * 3 + 2] + z * s;
      } else {
        const r = this.radial[i] >= 0 ? this.radial[i] : R * 0.5;
        const s = Math.max(r, R * 0.1) / len;
        this.pos[i * 3] = x * s; this.pos[i * 3 + 1] = y * s; this.pos[i * 3 + 2] = z * s;
      }
    });

    // Kanten
    const m = links.length;
    this.ea = new Int32Array(m); this.eb = new Int32Array(m);
    this.el = new Float32Array(m); this.ek = new Float32Array(m);
    links.forEach((l, k) => {
      this.ea[k] = l.source; this.eb[k] = l.target;
      const da = nodes[l.source].degree, db = nodes[l.target].degree;
      const base = l.kind === 'link' ? 0.09 : 0.05;
      this.ek[k] = base / Math.sqrt(Math.min(da, db) + 1);
      this.el[k] = this.restLength * (l.kind === 'link' ? 1 : 0.9);
    });

    const hadPrev = !!prev && prev.size > 0;
    this.alpha = hadPrev ? 0.45 : 1;
    this.tickCount = 0;
  }

  reheat(a = 0.4) { this.alpha = Math.max(this.alpha, a); }

  snapshot(nodesData: GraphData): Map<string, [number, number, number]> {
    const m = new Map<string, [number, number, number]>();
    nodesData.nodes.forEach((nd, i) => m.set(nd.id, [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]]));
    return m;
  }

  /** Läuft Simulationsschritte, bis das Zeitbudget (ms) aufgebraucht ist. Gibt true zurück, solange noch gerechnet wird. */
  step(budgetMs: number): boolean {
    if (!this.running || this.n === 0) return false;
    const t0 = performance.now();
    do { this.tick(); } while (this.running && performance.now() - t0 < budgetMs);
    return this.running;
  }

  private updateCentroids() {
    const cc = this.clusterCount;
    const cnt = new Float32Array(cc);
    this.centroids.fill(0);
    for (let i = 0; i < this.n; i++) {
      if (this.isTag[i]) continue;
      const c = this.cluster[i];
      this.centroids[c * 3] += this.pos[i * 3]; this.centroids[c * 3 + 1] += this.pos[i * 3 + 1]; this.centroids[c * 3 + 2] += this.pos[i * 3 + 2];
      cnt[c]++;
    }
    for (let c = 0; c < cc; c++) if (cnt[c]) { this.centroids[c * 3] /= cnt[c]; this.centroids[c * 3 + 1] /= cnt[c]; this.centroids[c * 3 + 2] /= cnt[c]; }
  }

  private tick() {
    const { n, pos, vel, force, mass, radial, cluster, isTag } = this;
    const a = this.alpha;
    this.alpha *= n > 3000 ? 0.982 : 0.988;
    const L = this.restLength;
    force.fill(0);

    // Abstoßung
    this.tree.build(pos, mass, n);
    const cr = L * L * 0.55;
    const tmp = this.tmp;
    for (let i = 0; i < n; i++) {
      tmp[0] = 0; tmp[1] = 0; tmp[2] = 0;
      this.tree.force(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], cr, 0.8, tmp);
      force[i * 3] += tmp[0]; force[i * 3 + 1] += tmp[1]; force[i * 3 + 2] += tmp[2];
    }

    // Federn
    for (let k = 0; k < this.ea.length; k++) {
      const i = this.ea[k], j = this.eb[k];
      const dx = pos[j * 3] - pos[i * 3], dy = pos[j * 3 + 1] - pos[i * 3 + 1], dz = pos[j * 3 + 2] - pos[i * 3 + 2];
      const d = Math.hypot(dx, dy, dz) || 0.001;
      const f = (d - this.el[k]) * this.ek[k] / d;
      const mi = mass[i], mj = mass[j], tot = mi + mj;
      const wi = mj / tot, wj = mi / tot;                 // leichtere Knoten bewegen sich mehr
      force[i * 3] += dx * f * wi * 2; force[i * 3 + 1] += dy * f * wi * 2; force[i * 3 + 2] += dz * f * wi * 2;
      force[j * 3] -= dx * f * wj * 2; force[j * 3 + 1] -= dy * f * wj * 2; force[j * 3 + 2] -= dz * f * wj * 2;
    }

    // Radial: stark vernetzte nach innen, wenig vernetzte nach außen; Cluster-Zusammenhalt
    if (this.tickCount % 6 === 0) this.updateCentroids();
    this.tickCount++;
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const r = Math.hypot(x, y, z) || 0.001;
      if (radial[i] >= 0) {
        const f = 0.14 * (radial[i] - r) / r;
        force[i * 3] += x * f; force[i * 3 + 1] += y * f; force[i * 3 + 2] += z * f;
      } else {
        const f = -0.01;                                   // Tag-Knoten sanft zur Mitte
        force[i * 3] += x * f; force[i * 3 + 1] += y * f; force[i * 3 + 2] += z * f;
      }
      if (!isTag[i]) {
        const c = cluster[i] * 3;
        force[i * 3] += (this.centroids[c] - x) * 0.012;
        force[i * 3 + 1] += (this.centroids[c + 1] - y) * 0.012;
        force[i * 3 + 2] += (this.centroids[c + 2] - z) * 0.012;
      }
    }

    // Integration
    const maxV = L * 0.6;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        const idx = i * 3 + k;
        vel[idx] = vel[idx] * 0.82 + force[idx] * a;
      }
      const sp = Math.hypot(vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]);
      if (sp > maxV) { const s = maxV / sp; vel[i * 3] *= s; vel[i * 3 + 1] *= s; vel[i * 3 + 2] *= s; }
      pos[i * 3] += vel[i * 3]; pos[i * 3 + 1] += vel[i * 3 + 1]; pos[i * 3 + 2] += vel[i * 3 + 2];
    }
  }

  /** Radius, der 98 % der Knoten umfasst; dient der Kameraeinstellung. */
  extent(): number {
    if (!this.n) return this.radius;
    const r: number[] = [];
    for (let i = 0; i < this.n; i++) r.push(Math.hypot(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]));
    r.sort((a, b) => a - b);
    return Math.max(20, r[Math.min(r.length - 1, Math.floor(r.length * 0.98))]);
  }
}
