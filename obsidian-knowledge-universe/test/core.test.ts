import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVault } from '../src/VaultParser';
import { analyzeGraph, ForceLayout } from '../src/GraphLayout';
import type { GraphData } from '../src/types';

interface FakeFile { path: string; basename: string; extension: string; parent: { path: string } | null; stat: { mtime: number }; cache: unknown }
function file(path: string, cache: unknown = {}): FakeFile {
  const name = path.split('/').pop()!;
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/';
  return { path, basename: name.replace(/\.md$/, ''), extension: 'md', parent: { path: folder }, stat: { mtime: 1700000000000 }, cache };
}
function fakeApp(files: FakeFile[], resolved: Record<string, Record<string, number>>) {
  return {
    vault: { getMarkdownFiles: () => files },
    metadataCache: { resolvedLinks: resolved, getFileCache: (f: FakeFile) => f.cache },
  } as never;
}
const all = { showTagNodes: true, showOrphans: true, excludeFolders: '' };

const vault = () => {
  const files = [
    file('Projekte/A.md', { tags: [{ tag: '#idee' }], frontmatter: { status: 'aktiv', tags: ['projekt'], position: {} } }),
    file('Projekte/B.md', { tags: [{ tag: '#idee' }] }),
    file('Archiv/C.md', { tags: [{ tag: '#idee' }, { tag: '#einmal' }] }),
    file('Lose.md', {}),
  ];
  const resolved = {
    'Projekte/A.md': { 'Projekte/B.md': 2, 'Archiv/C.md': 1, 'bild.png': 1, 'Projekte/A.md': 1 },
    'Projekte/B.md': { 'Projekte/A.md': 1 },
    'Archiv/C.md': {},
    'Lose.md': {},
  };
  return fakeApp(files, resolved);
};

test('Parser: Notizen, Links (ungerichtet gewichtet), Backlinks, Verwaiste', () => {
  const g = parseVault(vault(), { ...all, showTagNodes: false });
  assert.equal(g.noteCount, 4);
  const byTitle = Object.fromEntries(g.nodes.map((n) => [n.title, n]));
  assert.equal(g.links.length, 2);                                   // A–B (zusammengefasst) und A–C; Bild und Selbstlink ignoriert
  const ab = g.links.find((l) => [l.source, l.target].sort().join() === [byTitle.A.index, byTitle.B.index].sort().join())!;
  assert.equal(ab.weight, 3);                                        // 2 + 1 aus beiden Richtungen
  assert.deepEqual(byTitle.A.out.sort(), [byTitle.B.index, byTitle.C.index].sort());
  assert.deepEqual(byTitle.A.in, [byTitle.B.index]);                 // Backlink von B
  assert.equal(byTitle.Lose.orphan, true);
  assert.equal(byTitle.A.orphan, false);
  assert.equal(byTitle.A.degree, 2);
});

test('Parser: Tags (inline + Frontmatter), Frontmatter ohne "position", Tag-Knoten nur ab 2 Notizen', () => {
  const g = parseVault(vault(), all);
  const a = g.nodes.find((n) => n.title === 'A')!;
  assert.deepEqual(a.tags.sort(), ['#idee', '#projekt']);
  assert.equal(a.frontmatter.status, 'aktiv');
  assert.ok(!('position' in a.frontmatter));
  const tagNodes = g.nodes.filter((n) => n.kind === 'tag');
  assert.deepEqual(tagNodes.map((t) => t.title), ['#idee']);          // #einmal / #projekt kommen nur 1× vor
  assert.equal(tagNodes[0].tagMembers.length, 3);
  assert.equal(g.links.filter((l) => l.kind === 'tag').length, 3);
  assert.equal(g.noteCount, 4);
  assert.equal(g.linkCount, 2);                                      // Tag-Kanten zählen nicht als Notiz-Verbindungen
});

test('Parser: Verwaiste ausblenden und Ordner ausschließen', () => {
  const g1 = parseVault(vault(), { ...all, showOrphans: false });
  assert.equal(g1.noteCount, 3);
  assert.ok(!g1.nodes.some((n) => n.title === 'Lose'));
  const g2 = parseVault(vault(), { ...all, excludeFolders: 'Archiv, /Lose.md' });
  assert.deepEqual(g2.nodes.filter((n) => n.kind === 'note').map((n) => n.title).sort(), ['A', 'B']);
  assert.equal(g2.links.filter((l) => l.kind === 'link').length, 1);
});

function ring(clusters: number, size: number): GraphData {
  const nodes: GraphData['nodes'] = [];
  const links: GraphData['links'] = [];
  for (let c = 0; c < clusters; c++) {
    for (let i = 0; i < size; i++) {
      const index = nodes.length;
      nodes.push({ index, id: `n${index}`, kind: 'note', title: `n${index}`, path: `n${index}.md`, folder: '', tags: [], mtime: 0, frontmatter: {}, out: [], in: [], tagMembers: [], degree: 0, orphan: false, weight: 0, cluster: 0 });
    }
    const base = c * size;
    for (let i = 1; i < size; i++) links.push({ source: base, target: base + i, kind: 'link', weight: 1 });          // Stern: n(base) ist Hub
    for (let i = 1; i < size - 1; i++) links.push({ source: base + i, target: base + i + 1, kind: 'link', weight: 1 });
  }
  if (clusters > 1) links.push({ source: 0, target: size, kind: 'link', weight: 1 });                               // eine Brücke
  for (const l of links) { nodes[l.source].out.push(l.target); nodes[l.target].in.push(l.source); }
  for (const n of nodes) n.degree = new Set([...n.out, ...n.in]).size;
  return { nodes, links, noteCount: nodes.length, linkCount: links.length, tagCount: 0, clusterCount: 0, tags: [] };
}

test('Analyse: Gewicht nach Verlinkung, getrennte Gruppen werden zu Clustern', () => {
  const g = ring(3, 12);
  analyzeGraph(g);
  assert.ok(g.nodes[0].weight > g.nodes[5].weight);                  // Hub schwerer als Blatt
  assert.ok(g.nodes.every((n) => n.weight >= 0 && n.weight <= 1));
  assert.equal(new Set(g.nodes.slice(0, 12).map((n) => n.cluster)).size, 1);   // jede Gruppe liegt in einem Cluster
  assert.equal(new Set(g.nodes.map((n) => n.cluster)).size, g.clusterCount);
  assert.ok(g.clusterCount >= 2 && g.clusterCount <= 3);
});

test('Layout: endlich, Hubs näher an der Mitte, Knoten überlagern sich nicht, Neustart behält Positionen', () => {
  const g = ring(3, 40);
  analyzeGraph(g);
  const L = new ForceLayout();
  L.set(g);
  let guard = 0;
  while (L.step(50) && guard++ < 2000);
  assert.ok(!L.running);
  assert.ok(L.pos.every(Number.isFinite));
  const r = (i: number) => Math.hypot(L.pos[i * 3], L.pos[i * 3 + 1], L.pos[i * 3 + 2]);
  const hubs = [0, 40, 80].map(r), leaves = g.nodes.filter((n) => n.degree <= 3).map((n) => r(n.index));
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(hubs) < mean(leaves), `Hubs ${mean(hubs).toFixed(1)} sollen innen liegen, Blätter ${mean(leaves).toFixed(1)}`);
  let minD = Infinity;
  for (let i = 0; i < g.nodes.length; i++) for (let j = i + 1; j < g.nodes.length; j++) {
    minD = Math.min(minD, Math.hypot(L.pos[i * 3] - L.pos[j * 3], L.pos[i * 3 + 1] - L.pos[j * 3 + 1], L.pos[i * 3 + 2] - L.pos[j * 3 + 2]));
  }
  assert.ok(minD > 1, `kleinster Abstand ${minD.toFixed(2)}`);
  // Neustart mit bekannten Positionen: Knoten springen nicht
  const snap = L.snapshot(g);
  const L2 = new ForceLayout();
  L2.set(g, snap);
  assert.ok(Math.abs(L2.pos[0] - L.pos[0]) < 1e-4);
  assert.ok(L2.alpha < 1);
});

test('Layout: leerer und einzelner Graph laufen sauber', () => {
  const empty: GraphData = { nodes: [], links: [], noteCount: 0, linkCount: 0, tagCount: 0, clusterCount: 0, tags: [] };
  analyzeGraph(empty);
  const L = new ForceLayout(); L.set(empty);
  assert.equal(L.running, false);
  const one = ring(1, 1);
  analyzeGraph(one);
  L.set(one);
  while (L.step(20));
  assert.ok(L.pos.every(Number.isFinite));
});
