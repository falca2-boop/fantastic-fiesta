/* Browser-Nachbau der benutzten Obsidian-API, nur für dev/plugin-harness. Bildet das Verhalten ab, das das Plugin nutzt. */
declare global {
  interface HTMLElement {
    empty(): void; addClass(c: string): void;
    createDiv(o?: { cls?: string; text?: string }): HTMLDivElement;
  }
}
HTMLElement.prototype.empty = function () { this.replaceChildren(); };
HTMLElement.prototype.addClass = function (c: string) { this.classList.add(c); };
HTMLElement.prototype.createDiv = function (o = {}) { const d = document.createElement('div'); if (o.cls) d.className = o.cls; if (o.text) d.textContent = o.text; this.appendChild(d); return d; };

type Handler = (...a: unknown[]) => void;
export class Events { private h = new Map<string, Handler[]>();
  on(name: string, cb: Handler) { (this.h.get(name) ?? this.h.set(name, []).get(name)!).push(cb); return { name, cb }; }
  trigger(name: string, ...a: unknown[]) { (this.h.get(name) ?? []).forEach((f) => f(...a)); } }

export class TFile { path = ''; basename = ''; extension = 'md'; parent: { path: string } | null = null; stat = { mtime: 0 };
  constructor(path: string) { this.path = path; this.basename = path.split('/').pop()!.replace(/\.md$/, ''); this.parent = { path: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/' }; this.stat.mtime = Date.now(); } }
export class Notice { constructor(public msg: string) { console.log('NOTICE:', msg); (window as unknown as { notices: string[] }).notices?.push(msg); } }
export const debounce = (fn: () => void, ms: number) => { let t: number | undefined; const f = () => { clearTimeout(t); t = window.setTimeout(fn, ms); }; f.cancel = () => clearTimeout(t); return f; };
export function prepareFuzzySearch(q: string) { const s = q.toLowerCase(); return (text: string) => { const i = text.toLowerCase().indexOf(s); return i < 0 ? null : { score: -i / 10, matches: [] }; }; }
export function getAllTags(cache: { tags?: { tag: string }[] }) { const t = (cache.tags ?? []).map((x) => x.tag); return t.length ? t : null; }

export class Plugin { app: unknown; views = new Map<string, (leaf: unknown) => unknown>(); commands: { id: string; name: string }[] = []; ribbons: string[] = []; data: unknown = {};
  constructor(app: unknown) { this.app = app; }
  async loadData() { return this.data; } async saveData(d: unknown) { this.data = d; }
  registerView(t: string, f: (leaf: unknown) => unknown) { this.views.set(t, f); }
  addRibbonIcon(icon: string) { this.ribbons.push(icon); return document.createElement('div'); }
  addCommand(c: { id: string; name: string }) { this.commands.push(c); }
  addSettingTab() {} }
export class PluginSettingTab { containerEl = document.createElement('div'); constructor(public app: unknown, public plugin: unknown) {} }
export class Setting { constructor() { return new Proxy(this, { get: (_t, k) => (k === 'then' ? undefined : () => this) }); } }

export class ItemView { containerEl = document.createElement('div'); contentEl = document.createElement('div'); app: unknown; private refs: { name: string; cb: Handler }[] = [];
  constructor(public leaf: { app: unknown }) { this.app = leaf.app; this.containerEl.appendChild(this.contentEl); }
  registerEvent(r: { name: string; cb: Handler }) { this.refs.push(r); } }
export class WorkspaceLeaf { opened: string[] = []; view: unknown = null; constructor(public app: unknown) {} async openFile(f: TFile) { this.opened.push(f.path); (window as unknown as { opened: string[] }).opened.push(f.path); }
  async setViewState() {} }
