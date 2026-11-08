/* Testseite: zeigt die 3D-Ansicht mit einem künstlichen Vault, ohne Obsidian. Nur für die Entwicklung. */
import { GraphRenderer } from '../src/GraphRenderer';
import { UniverseUI } from '../src/UniverseUI';
import { mulberry32 } from '../src/GraphLayout';
import { DEFAULT_SETTINGS, GLink, GNode, GraphData } from '../src/types';

function makeVault(count: number, seed = 5): GraphData {
  const rng = mulberry32(seed);
  const folders = ['10-PROJEKTE', '20-AREAS', '30-RESOURCES', '70-DAILY', '00-INBOX'];
  const tagPool = ['#projekt', '#idee', '#buch', '#ki', '#gesundheit', '#finanzen', '#jarvis', '#lernen'];
  const topics = ['Jarvis', 'Obsidian', 'Finanzen', 'Training', 'Reise', 'Musik', 'Recht', 'Küche'];
  const nodes: GNode[] = [];
  for (let i = 0; i < count; i++) {
    const c = Math.floor(rng() * 6);
    const orphan = rng() < 0.04;
    nodes.push({
      index: i, id: `${folders[c % 5]}/Notiz ${i}.md`, kind: 'note',
      title: `${topics[(c + Math.floor(rng() * 2)) % topics.length]} ${i}`, path: `${folders[c % 5]}/Notiz ${i}.md`, folder: folders[c % 5],
      tags: rng() < 0.6 ? [tagPool[(c + Math.floor(rng() * 3)) % tagPool.length]] : [], mtime: Date.now() - rng() * 9e9,
      frontmatter: rng() < 0.3 ? { status: 'aktiv', erstellt: '2026-10-01' } : {},
      out: [], in: [], tagMembers: [], degree: 0, orphan, weight: 0, cluster: c,
    });
  }
  const links: GLink[] = [];
  const seen = new Set<string>();
  const add = (a: number, b: number) => {
    if (a === undefined || b === undefined || a === b || nodes[a].orphan || nodes[b].orphan) return;
    const k = a < b ? a + ',' + b : b + ',' + a;
    if (seen.has(k)) return; seen.add(k);
    links.push({ source: a, target: b, kind: 'link', weight: 1 + Math.floor(rng() * 3) });
    nodes[a].out.push(b); nodes[b].in.push(a);
  };
  const byCluster = [0, 1, 2, 3, 4, 5].map((c) => nodes.filter((n) => n.cluster === c).map((n) => n.index));
  for (const n of nodes) {
    const k = 1 + Math.floor(rng() * rng() * 6);
    for (let j = 0; j < k; j++) {
      const pool = rng() < 0.9 ? byCluster[n.cluster] : byCluster[Math.floor(rng() * 6)];
      // bevorzugt "Hubs" am Anfang der Liste
      if (pool.length) add(n.index, pool[Math.floor(Math.pow(rng(), 2.2) * pool.length)]);
    }
  }
  for (const n of nodes) n.degree = new Set([...n.out, ...n.in]).size;
  const noteCount = nodes.length, linkCount = links.length;
  const tags = new Map<string, number>();
  for (const n of nodes) for (const t of n.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  let tagCount = 0;
  for (const [tag] of tags) {
    const idx = nodes.length;
    const members = nodes.filter((n) => n.tags.includes(tag)).map((n) => n.index);
    nodes.push({ index: idx, id: 'tag:' + tag, kind: 'tag', title: tag, path: '', folder: '', tags: [], mtime: 0, frontmatter: {}, out: [], in: [], tagMembers: members, degree: members.length, orphan: false, weight: 0, cluster: 0 });
    for (const m of members) links.push({ source: m, target: idx, kind: 'tag', weight: 1 });
    tagCount++;
  }
  return { nodes, links, noteCount, linkCount, tagCount, clusterCount: 0, tags: [...tags.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count) };
}

const params = new URLSearchParams(location.search);
const count = Number(params.get('n') || 450);
const settings = { ...DEFAULT_SETTINGS, quality: (params.get('q') as 'low' | 'medium' | 'high') || 'high' };
const root = document.getElementById('root') as HTMLElement;

let ui!: UniverseUI;
const data = makeVault(count);
const renderer = new GraphRenderer(root, settings, {
  onHover: (n, x, y) => ui.showTooltip(n, x, y),
  onClick: (n) => { if (n) console.log('open', n.title); else ui.hideDetails(); },
  onDoubleClick: (n) => { renderer.setSelected(n.index); ui.showDetails(n.index); },
});
ui = new UniverseUI(root, settings, {
  zoom: (f) => renderer.zoomBy(f), reset: () => renderer.resetView(),
  togglePause: () => { renderer.setPaused(!renderer.isPaused); return renderer.isPaused; },
  fullscreen: () => void root.requestFullscreen?.(),
  search: (q) => data.nodes.filter((n) => n.kind === 'note' && n.title.toLowerCase().includes(q.toLowerCase())).map((n) => n.index),
  highlight: (i) => renderer.setSearchHighlight(i), focusNode: (i) => { renderer.focusNode(i); renderer.setSelected(i); },
  openNode: (i) => console.log('open', data.nodes[i].title), setHidden: (m) => renderer.setHiddenMask(m),
  settingsChanged: (patch, rebuild) => { Object.assign(settings, patch); renderer.applySettings(settings); if (rebuild) { /* Testseite: kein Neuaufbau nötig */ } },
});
renderer.setGraph(data);
ui.setGraph(data);
(window as unknown as Record<string, unknown>).KU = { renderer, ui, data };
