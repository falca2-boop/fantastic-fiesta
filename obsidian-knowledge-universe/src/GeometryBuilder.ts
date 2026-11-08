import * as THREE from 'three';
import { mulberry32 } from './GraphLayout';
import { GraphData } from './types';

/** Leuchtende Farben: Electric Orange, Neon Pink, Magenta, Cyan, Violett, Gold */
export const PALETTE = ['#ff6a00', '#ff2e93', '#d100d1', '#00e5ff', '#8a2bff', '#ffc83d'];

const paletteColors = PALETTE.map((h) => new THREE.Color(h));

export function clusterColor(cluster: number, out = new THREE.Color()): THREE.Color {
  const base = paletteColors[cluster % PALETTE.length];
  const round = Math.floor(cluster / PALETTE.length);
  out.copy(base);
  if (round > 0) out.offsetHSL(0.035 * round, 0, round % 2 ? 0.06 : -0.05);
  return out;
}

export interface BuildOptions {
  budget: number;           // Ziel-Partikelzahl (Knoten + Staub)
  ambientBudget: number;    // maximale Anzahl feiner Linien
  ambient: boolean;
  restLength: number;       // typischer Knotenabstand
}

export interface BuiltGeometry {
  nodes: THREE.BufferGeometry;
  dust: THREE.BufferGeometry;
  links: THREE.BufferGeometry;
  ambient: THREE.BufferGeometry | null;
  nodeSize: Float32Array;
  particleCount: number;
  lineCount: number;
}

class PointBuf {
  node: number[] = []; offset: number[] = []; seed: number[] = []; color: number[] = [];
  size: number[] = []; kind: number[] = []; alpha: number[] = [];
  add(node: number, ox: number, oy: number, oz: number, seed: number, c: THREE.Color, k: number, size: number, kind: number, alpha: number) {
    this.node.push(node); this.offset.push(ox, oy, oz); this.seed.push(seed);
    this.color.push(c.r * k, c.g * k, c.b * k); this.size.push(size); this.kind.push(kind); this.alpha.push(alpha);
  }
  geometry(): THREE.BufferGeometry {
    const n = this.node.length;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aNode', new THREE.Float32BufferAttribute(this.node, 1));
    g.setAttribute('aOffset', new THREE.Float32BufferAttribute(this.offset, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.seed, 1));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.color, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 1));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.kind, 1));
    g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(this.alpha, 1));
    g.setDrawRange(0, n);
    return g;
  }
}

class LineBuf {
  node: number[] = []; other: number[] = []; offset: number[] = []; seed: number[] = [];
  t: number[] = []; phase: number[] = []; speed: number[] = []; active: number[] = [];
  color: number[] = []; intensity: number[] = [];
  get count() { return this.node.length; }
  vertex(node: number, other: number, o: [number, number, number], seed: number, t: number, phase: number, speed: number, active: number, c: THREE.Color, k: number, intensity: number) {
    this.node.push(node); this.other.push(other); this.offset.push(o[0], o[1], o[2]); this.seed.push(seed);
    this.t.push(t); this.phase.push(phase); this.speed.push(speed); this.active.push(active);
    this.color.push(c.r * k, c.g * k, c.b * k); this.intensity.push(intensity);
  }
  geometry(): THREE.BufferGeometry {
    const n = this.node.length;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aNode', new THREE.Float32BufferAttribute(this.node, 1));
    g.setAttribute('aOther', new THREE.Float32BufferAttribute(this.other, 1));
    g.setAttribute('aOffset', new THREE.Float32BufferAttribute(this.offset, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.seed, 1));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(this.t, 1));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.phase, 1));
    g.setAttribute('aSpeed', new THREE.Float32BufferAttribute(this.speed, 1));
    g.setAttribute('aActive', new THREE.Float32BufferAttribute(this.active, 1));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.color, 3));
    g.setAttribute('aIntensity', new THREE.Float32BufferAttribute(this.intensity, 1));
    g.setDrawRange(0, n);
    return g;
  }
}

/** Erzeugt alle GPU-Puffer: Knoten, Staubwolken um die Knoten, echte Verbindungen und das feine Geflecht. */
export function buildGeometry(data: GraphData, opt: BuildOptions): BuiltGeometry {
  const rng = mulberry32(424242);
  const { nodes, links } = data;
  const N = nodes.length;
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();

  const nodeSeed = new Float32Array(N);
  const nodeSize = new Float32Array(N);
  const nodeColor: THREE.Color[] = [];
  for (let i = 0; i < N; i++) {
    nodeSeed[i] = rng();
    const nd = nodes[i];
    nodeSize[i] = nd.kind === 'tag' ? 5 + 5 * nd.weight : 1.9 + 6.2 * Math.pow(nd.weight, 0.85);
    nodeColor.push(clusterColor(nd.cluster).clone());
  }

  // --- Knoten ---
  const nodeBuf = new PointBuf();
  for (let i = 0; i < N; i++) {
    nodeBuf.add(i, 0, 0, 0, nodeSeed[i], nodeColor[i], 1.25, nodeSize[i], nodes[i].kind === 'tag' ? 1 : 0, 1);
  }

  // --- Staubwolken: jedes Partikel gehört zu einem Knoten und bewegt sich mit ihm ---
  const dustBuf = new PointBuf();
  const D = Math.max(0, opt.budget - N);
  const wts = nodes.map((n) => (n.kind === 'tag' ? 0.12 : 0.35 + n.weight));
  const wSum = wts.reduce((a, b) => a + b, 0) || 1;
  const dustOf: number[][] = Array.from({ length: N }, () => []);
  const dustOffset: number[] = [], dustSeed: number[] = [], dustNode: number[] = [];
  const dustColor: THREE.Color[] = [];
  for (let i = 0; i < N && D > 0; i++) {
    const nd = nodes[i];
    const count = Math.round((D * wts[i]) / wSum);
    const rad = opt.restLength * (0.4 + 0.9 * Math.pow(nd.weight, 0.7));
    for (let k = 0; k < count; k++) {
      // Richtung gleichverteilt, Radius zwischen Kern und Schale
      const u = rng() * 2 - 1, th = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const r = rad * (rng() < 0.7 ? Math.pow(rng(), 0.42) : rng());
      const ox = s * Math.cos(th) * r, oy = u * r, oz = s * Math.sin(th) * r;
      const seed = rng();
      const cidx = nd.cluster + (rng() < 0.18 ? (rng() < 0.5 ? 1 : -1) : 0);
      const col = clusterColor(Math.max(0, cidx)).clone();
      const bright = 0.5 + 0.7 * rng();
      const size = 0.5 + 1.9 * rng() * rng();
      dustBuf.add(i, ox, oy, oz, seed, col, bright, size, 0, 0.6 + 0.4 * rng());
      const di = dustSeed.length;
      dustOf[i].push(di);
      dustOffset.push(ox, oy, oz); dustSeed.push(seed); dustNode.push(i); dustColor.push(col.clone().multiplyScalar(bright));
    }
  }
  // Nebel: ein weicher Schleier je Cluster, am wichtigsten Knoten verankert
  const hub = new Map<number, number>();
  const clusterSize = new Map<number, number>();
  for (const nd of nodes) {
    clusterSize.set(nd.cluster, (clusterSize.get(nd.cluster) ?? 0) + 1);
    const h = hub.get(nd.cluster);
    if (h === undefined || nodes[h].weight < nd.weight) hub.set(nd.cluster, nd.index);
  }
  const maxCluster = Math.max(1, ...clusterSize.values());
  [...hub.entries()].sort((a, b) => a[0] - b[0]).slice(0, 24).forEach(([c, h]) => {
    const sz = opt.restLength * 3.0 * (0.3 + 0.7 * Math.sqrt((clusterSize.get(c) ?? 1) / maxCluster));
    dustBuf.add(h, 0, 0, 0, rng(), clusterColor(c), 1, sz, 2, 0.04);
  });

  // --- echte Verbindungen ---
  const linkBuf = new LineBuf();
  for (const l of links) {
    const isLink = l.kind === 'link';
    const phase = rng(), speed = 0.05 + 0.12 * rng();
    const active = rng() < (isLink ? 0.6 : 0.25) ? 1 : 0;
    const inten = isLink ? 0.3 + 0.35 * Math.min(1, Math.log1p(l.weight) / 2) : 0.13;
    const z: [number, number, number] = [0, 0, 0];
    linkBuf.vertex(l.source, l.target, z, nodeSeed[l.source], 0, phase, speed, active, nodeColor[l.source], 1.1, inten);
    linkBuf.vertex(l.target, l.source, z, nodeSeed[l.target], 1, phase, speed, active, nodeColor[l.target], 1.1, inten);
  }

  // --- feines neuronales Geflecht ---
  let ambient: THREE.BufferGeometry | null = null;
  let lineCount = links.length;
  if (opt.ambient && D > 0) {
    const amb = new LineBuf();
    const cap = opt.ambientBudget;
    const dustTotal = dustSeed.length;
    const seg = (a: number, b: number, otherA: number, otherB: number, inten: number, active: number) => {
      const speed = 0.06 + 0.14 * rng(), phase = rng();
      amb.vertex(dustNode[a], otherA, [dustOffset[a * 3], dustOffset[a * 3 + 1], dustOffset[a * 3 + 2]], dustSeed[a], 0, phase, speed, active, dustColor[a], 1, inten);
      amb.vertex(dustNode[b], otherB, [dustOffset[b * 3], dustOffset[b * 3 + 1], dustOffset[b * 3 + 2]], dustSeed[b], 1, phase, speed, active, dustColor[b], 1, inten);
    };
    // (c) Synapsen zwischen den Wolken verbundener Knoten
    const synBudget = Math.floor(cap * 0.3);
    let syn = 0;
    for (const l of links) {
      if (syn >= synBudget) break;
      if (l.kind !== 'link') continue;
      const A = dustOf[l.source], B = dustOf[l.target];
      if (!A.length || !B.length) continue;
      const n = 2 + Math.round(3 * Math.min(1, Math.log1p(l.weight) / 2));
      for (let k = 0; k < n && syn < synBudget; k++, syn++) {
        const a = A[Math.floor(rng() * A.length)], b = B[Math.floor(rng() * B.length)];
        seg(a, b, nodes[l.target].index, nodes[l.source].index, 0.12 + 0.1 * rng(), rng() < 0.4 ? 1 : 0);
      }
    }
    // (a) Nachbarn innerhalb einer Wolke, (b) Speichen zum Kern
    const rest = cap - amb.count / 2;
    const pNear = Math.min(1, (rest * 0.78) / Math.max(1, dustTotal));
    const pSpoke = Math.min(1, (rest * 0.22) / Math.max(1, dustTotal));
    for (let i = 0; i < N; i++) {
      const L = dustOf[i];
      if (L.length < 2) continue;
      for (const a of L) {
        if (rng() < pNear) {
          let best = -1, bd = Infinity;
          const tries = Math.min(L.length - 1, 40);
          for (let t = 0; t < tries; t++) {
            const b = L.length <= 41 ? L[t] : L[Math.floor(rng() * L.length)];
            if (b === a) continue;
            const dx = dustOffset[a * 3] - dustOffset[b * 3], dy = dustOffset[a * 3 + 1] - dustOffset[b * 3 + 1], dz = dustOffset[a * 3 + 2] - dustOffset[b * 3 + 2];
            const d = dx * dx + dy * dy + dz * dz;
            if (d < bd) { bd = d; best = b; }
          }
          if (best >= 0) seg(a, best, i, i, 0.1 + 0.12 * rng(), rng() < 0.15 ? 1 : 0);
        }
        if (rng() < pSpoke) {
          const t0 = rng(), speed = 0.06 + 0.12 * rng();
          const z: [number, number, number] = [0, 0, 0];
          amb.vertex(i, i, [dustOffset[a * 3], dustOffset[a * 3 + 1], dustOffset[a * 3 + 2]], dustSeed[a], 0, t0, speed, 0, dustColor[a], 1, 0.08);
          amb.vertex(i, i, z, nodeSeed[i], 1, t0, speed, 0, nodeColor[i], 1, 0.08);
        }
      }
    }
    if (amb.count) { ambient = amb.geometry(); lineCount += amb.count / 2; }
  }

  return {
    nodes: nodeBuf.geometry(),
    dust: dustBuf.geometry(),
    links: linkBuf.geometry(),
    ambient,
    nodeSize,
    particleCount: N + dustSeed.length,
    lineCount,
  };
}
