import { App, CachedMetadata, TFile, getAllTags } from 'obsidian';
import { GLink, GNode, GraphData, UniverseSettings } from './types';

const MAX_TAG_NODES = 40;

function stringify(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(stringify).filter(Boolean).join(', ');
  if (typeof v === 'object') return '';
  return String(v);
}

function frontmatterOf(cache: CachedMetadata | null): Record<string, string> {
  const out: Record<string, string> = {};
  const fm = cache?.frontmatter as Record<string, unknown> | undefined;
  if (!fm) return out;
  let n = 0;
  for (const [k, v] of Object.entries(fm)) {
    if (k === 'position' || n >= 10) continue;
    const s = stringify(v).slice(0, 120);
    if (s) { out[k] = s; n++; }
  }
  return out;
}

function isExcluded(path: string, folders: string[]): boolean {
  return folders.some((f) => path === f || path.startsWith(f + '/'));
}

/**
 * Liest den Vault und baut daraus den Graphen:
 *  - jede Markdown-Notiz = ein Knoten
 *  - Wikilinks und Markdown-Links (aus metadataCache.resolvedLinks) = Kanten
 *  - Frontmatter und Tags (inline + Frontmatter) pro Notiz
 *  - Backlinks = umgekehrte Kanten
 *  - optional: häufige Tags als eigene Knoten, die ihre Notizen bündeln
 */
export function parseVault(app: App, settings: Pick<UniverseSettings, 'showTagNodes' | 'showOrphans' | 'excludeFolders'>): GraphData {
  const excluded = settings.excludeFolders.split(',').map((s) => s.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean);
  const files: TFile[] = app.vault.getMarkdownFiles().filter((f) => !isExcluded(f.path, excluded));
  const resolved = app.metadataCache.resolvedLinks;

  // 1) Notizen-Verknüpfungen (ungerichtet gewichtet, gerichtet für Backlinks)
  const known = new Set(files.map((f) => f.path));
  const pairWeight = new Map<string, number>();
  const outSets = new Map<string, Set<string>>();
  const inSets = new Map<string, Set<string>>();
  for (const f of files) { outSets.set(f.path, new Set()); inSets.set(f.path, new Set()); }

  for (const [src, targets] of Object.entries(resolved)) {
    if (!known.has(src)) continue;
    for (const [tgt, count] of Object.entries(targets)) {
      if (tgt === src || !known.has(tgt)) continue;      // Bilder/PDFs/ausgeschlossene Ordner ignorieren
      outSets.get(src)!.add(tgt);
      inSets.get(tgt)!.add(src);
      const key = src < tgt ? src + '\u0000' + tgt : tgt + '\u0000' + src;
      pairWeight.set(key, (pairWeight.get(key) ?? 0) + count);
    }
  }

  // 2) Verwaiste Notizen ggf. weglassen
  let kept = files;
  if (!settings.showOrphans) kept = files.filter((f) => outSets.get(f.path)!.size + inSets.get(f.path)!.size > 0);
  const index = new Map<string, number>();
  kept.forEach((f, i) => index.set(f.path, i));

  const nodes: GNode[] = kept.map((f, i) => {
    const cache = app.metadataCache.getFileCache(f);
    const tags = [...new Set((cache ? getAllTags(cache) : null) ?? [])];
    const out = [...outSets.get(f.path)!].map((p) => index.get(p)).filter((x): x is number => x !== undefined);
    const inn = [...inSets.get(f.path)!].map((p) => index.get(p)).filter((x): x is number => x !== undefined);
    const neighbours = new Set([...out, ...inn]);
    return {
      index: i, id: f.path, kind: 'note', title: f.basename, path: f.path,
      folder: f.parent?.path && f.parent.path !== '/' ? f.parent.path : '',
      tags, mtime: f.stat.mtime, frontmatter: frontmatterOf(cache),
      out, in: inn, tagMembers: [], degree: neighbours.size,
      orphan: outSets.get(f.path)!.size + inSets.get(f.path)!.size === 0,
      weight: 0, cluster: 0,
    };
  });

  const links: GLink[] = [];
  for (const [key, w] of pairWeight) {
    const [a, b] = key.split('\u0000');
    const ia = index.get(a), ib = index.get(b);
    if (ia === undefined || ib === undefined) continue;
    links.push({ source: ia, target: ib, kind: 'link', weight: w });
  }
  const linkCount = links.length;
  const noteCount = nodes.length;

  // 3) Tags: häufige Tags werden zu Knoten, die ihre Notizen bündeln
  const tagCounts = new Map<string, number>();
  for (const n of nodes) for (const t of n.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const tags = [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  let tagCount = 0;
  if (settings.showTagNodes) {
    const chosen = tags.filter((t) => t.count >= 2).slice(0, MAX_TAG_NODES);
    for (const { tag } of chosen) {
      const idx = nodes.length;
      const members = nodes.filter((n) => n.kind === 'note' && n.tags.includes(tag)).map((n) => n.index);
      nodes.push({
        index: idx, id: 'tag:' + tag, kind: 'tag', title: tag, path: '', folder: '', tags: [], mtime: 0, frontmatter: {},
        out: [], in: [], tagMembers: members, degree: members.length, orphan: false, weight: 0, cluster: 0,
      });
      for (const m of members) links.push({ source: m, target: idx, kind: 'tag', weight: 1 });
      tagCount++;
    }
  } else tagCount = tags.length;

  return { nodes, links, noteCount, linkCount, tagCount, clusterCount: 0, tags };
}
