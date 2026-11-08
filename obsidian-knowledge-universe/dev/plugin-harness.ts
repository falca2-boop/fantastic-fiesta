/* Lässt das echte Plugin (src/main.ts) gegen den Browser-Nachbau der Obsidian-API laufen. */
import KnowledgeUniversePlugin from '../src/main';
import { UniverseView, VIEW_TYPE_UNIVERSE } from '../src/GraphView';
import { Events, TFile, WorkspaceLeaf } from './obsidian-browser-mock';
import { mulberry32 } from '../src/GraphLayout';

const w = window as unknown as Record<string, unknown>;
w.opened = []; w.notices = [];

const rng = mulberry32(11);
const folders = ['Projekte', 'Areas', 'Ressourcen', 'Daily'];
const files: TFile[] = [];
const caches = new Map<string, { tags?: { tag: string }[]; frontmatter?: Record<string, unknown> }>();
const resolvedLinks: Record<string, Record<string, number>> = {};
for (let i = 0; i < 180; i++) { const f = new TFile(`${folders[i % 4]}/Notiz ${i}.md`); files.push(f); resolvedLinks[f.path] = {};
  caches.set(f.path, { tags: rng() < 0.5 ? [{ tag: '#' + ['idee', 'ki', 'projekt'][i % 3] }] : [], frontmatter: i % 7 === 0 ? { status: 'aktiv' } : undefined }); }
for (let i = 0; i < 180; i++) for (let k = 0; k < 1 + Math.floor(rng() * 3); k++) { const j = Math.floor(Math.pow(rng(), 2) * 180); if (i % 4 === j % 4 && i !== j) resolvedLinks[files[i].path][files[j].path] = 1; }

const vaultEvents = new Events(), cacheEvents = new Events();
const leaves: WorkspaceLeaf[] = [];
const app = {
  vault: { getMarkdownFiles: () => files, getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null, on: (n: string, cb: (...a: unknown[]) => void) => vaultEvents.on(n, cb) },
  metadataCache: { resolvedLinks, getFileCache: (f: TFile) => caches.get(f.path) ?? {}, on: (n: string, cb: (...a: unknown[]) => void) => cacheEvents.on(n, cb) },
  workspace: {
    getLeavesOfType: () => [], getLeaf: (..._a: unknown[]) => { const l = new WorkspaceLeaf(app); leaves.push(l); return l; }, revealLeaf: async () => {},
  },
};

async function main() {
  const plugin = new KnowledgeUniversePlugin(app as never, {} as never);
  await plugin.onload();
  const P = plugin as unknown as { views: Map<string, (l: unknown) => UniverseView>; commands: { id: string }[]; ribbons: string[] };
  const root = document.getElementById('root') as HTMLElement;
  const leaf = new WorkspaceLeaf(app);
  const view = P.views.get(VIEW_TYPE_UNIVERSE)!(leaf);
  root.appendChild(view.contentEl);
  view.contentEl.style.cssText = 'position:absolute;inset:0';
  await view.onOpen();
  w.plugin = plugin; w.view = view; w.vaultEvents = vaultEvents; w.cacheEvents = cacheEvents; w.files = files; w.resolvedLinks = resolvedLinks; w.leaves = leaves; w.kuCaches = caches;
  w.info = { commands: P.commands.map((c) => c.id), ribbons: P.ribbons, viewType: view.getViewType(), title: view.getDisplayText() };
  w.ready = true;
}
main().catch((e) => { w.error = String(e && (e as Error).stack || e); console.error(e); });
