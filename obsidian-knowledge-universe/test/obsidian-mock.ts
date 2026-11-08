/* Minimaler Ersatz für das "obsidian"-Modul, nur für die Tests der reinen Logik. */
export class TFile {}
export interface CachedMetadata { tags?: { tag: string }[]; frontmatter?: Record<string, unknown> }
export function getAllTags(cache: CachedMetadata): string[] | null {
  const out: string[] = [];
  for (const t of cache.tags ?? []) out.push(t.tag);
  const fm = cache.frontmatter?.tags;
  const arr = Array.isArray(fm) ? fm : typeof fm === 'string' ? [fm] : [];
  for (const t of arr) out.push('#' + String(t).replace(/^#/, ''));
  return out.length ? out : null;
}
export const debounce = <T extends (...a: never[]) => unknown>(fn: T) => fn;
