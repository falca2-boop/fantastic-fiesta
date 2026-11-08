import { ItemView, Notice, TFile, WorkspaceLeaf, debounce, prepareFuzzySearch } from 'obsidian';
import type KnowledgeUniversePlugin from './main';
import { GraphRenderer } from './GraphRenderer';
import { UniverseUI } from './UniverseUI';
import { parseVault } from './VaultParser';
import { GNode, GraphData, UniverseSettings } from './types';

export const VIEW_TYPE_UNIVERSE = 'knowledge-universe-view';

function signature(d: GraphData): string {
  let h = 2166136261;
  const mix = (s: string) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= 10; h = Math.imul(h, 16777619); };
  for (const n of d.nodes) mix(n.id + '|' + n.tags.join(','));
  for (const l of d.links) mix(l.source + ',' + l.target + ',' + l.kind + ',' + l.weight);
  return d.nodes.length + ':' + d.links.length + ':' + (h >>> 0).toString(36);
}

export class UniverseView extends ItemView {
  private renderer: GraphRenderer | null = null;
  private ui: UniverseUI | null = null;
  private data: GraphData | null = null;
  private lastSig = '';
  private refresh = debounce(() => this.reload(false), 1500, true);

  constructor(leaf: WorkspaceLeaf, private plugin: KnowledgeUniversePlugin) { super(leaf); }

  getViewType() { return VIEW_TYPE_UNIVERSE; }
  getDisplayText() { return 'Knowledge Universe'; }
  getIcon() { return 'orbit'; }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass('ku-root');

    try {
      this.renderer = new GraphRenderer(root, this.plugin.settings, {
        onHover: (node, x, y) => this.ui?.showTooltip(node, x, y),
        onClick: (node) => this.handleClick(node),
        onDoubleClick: (node) => this.handleDoubleClick(node),
      });
    } catch (err) {
      console.error('[Knowledge Universe] WebGL konnte nicht gestartet werden', err);
      root.createDiv({ cls: 'ku-error', text: 'WebGL ist in dieser Umgebung nicht verfügbar. Die 3D-Ansicht kann nicht gestartet werden.' });
      return;
    }

    this.ui = new UniverseUI(root, this.plugin.settings, {
      zoom: (f) => this.renderer?.zoomBy(f),
      reset: () => this.renderer?.resetView(),
      togglePause: () => { const r = this.renderer; if (!r) return false; r.setPaused(!r.isPaused); return r.isPaused; },
      fullscreen: () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void root.requestFullscreen?.().catch(() => new Notice('Vollbild wird hier nicht unterstützt.'));
      },
      search: (q) => this.search(q),
      highlight: (idx) => this.renderer?.setSearchHighlight(idx),
      focusNode: (i) => { this.renderer?.focusNode(i); this.renderer?.setSelected(i); },
      openNode: (i) => void this.openNode(i),
      setHidden: (mask) => this.renderer?.setHiddenMask(mask),
      settingsChanged: (patch, rebuild) => { Object.assign(this.plugin.settings, patch); void this.plugin.saveSettings(rebuild); },
    });

    // Der Vault ändert sich: Graph nach kurzer Ruhephase aktualisieren
    const isMd = (f: unknown) => f instanceof TFile && f.extension === 'md';
    this.registerEvent(this.app.metadataCache.on('resolved', () => this.refresh()));
    this.registerEvent(this.app.metadataCache.on('changed', () => this.refresh()));
    this.registerEvent(this.app.metadataCache.on('deleted', () => this.refresh()));
    this.registerEvent(this.app.vault.on('create', (f) => { if (isMd(f)) this.refresh(); }));
    this.registerEvent(this.app.vault.on('delete', (f) => { if (isMd(f)) this.refresh(); }));
    this.registerEvent(this.app.vault.on('rename', (f) => { if (isMd(f)) this.refresh(); }));

    this.reload(true);
  }

  async onClose() {
    this.refresh.cancel();
    this.ui?.dispose(); this.ui = null;
    this.renderer?.dispose(); this.renderer = null;
    this.data = null;
    this.contentEl.empty();
  }

  /** Vault neu einlesen. Ändert sich die Struktur nicht, bleibt die Szene unberührt. */
  reload(force: boolean) {
    if (!this.renderer || !this.ui) return;
    try {
      const data = parseVault(this.app, this.plugin.settings);
      const sig = signature(data);
      if (!force && sig === this.lastSig && this.data) {
        this.renderer.replaceData(data);
        this.data = data;
        this.ui.setGraphMeta(data);
        return;
      }
      this.lastSig = sig;
      this.data = data;
      this.renderer.setGraph(data);       // setzt cluster/weight in data
      this.ui.setGraph(data);
    } catch (err) {
      console.error('[Knowledge Universe] Vault konnte nicht gelesen werden', err);
      new Notice('Knowledge Universe: Vault konnte nicht gelesen werden (siehe Konsole).');
    }
  }

  /** Einstellungen von außen (Einstellungsseite oder Panel) anwenden. */
  applySettings(rebuild: boolean) {
    if (!this.renderer) return;
    if (rebuild) this.reload(true);
    this.renderer.applySettings(this.plugin.settings as UniverseSettings);
  }

  // ---------------------------------------------------------------------------------- Interaktion

  private handleClick(node: GNode | null) {
    if (!node) { this.renderer?.setSelected(-1); this.ui?.hideDetails(); return; }
    if (node.kind === 'tag') { this.ui?.filterByTag(node.title); return; }
    void this.openNode(node.index);
  }

  private handleDoubleClick(node: GNode) {
    this.renderer?.setSelected(node.index);
    this.ui?.showDetails(node.index);
  }

  private async openNode(index: number) {
    const n = this.data?.nodes[index];
    if (!n || n.kind !== 'note') return;
    const file = this.app.vault.getAbstractFileByPath(n.path);
    if (!(file instanceof TFile)) { new Notice('Notiz nicht gefunden: ' + n.path); return; }
    const mode = this.plugin.settings.openMode;
    const leaf = mode === 'split' ? this.app.workspace.getLeaf('split', 'vertical') : this.app.workspace.getLeaf(mode);
    await leaf.openFile(file);
  }

  private search(query: string): number[] {
    const data = this.data;
    if (!data) return [];
    const fuzzy = prepareFuzzySearch(query);
    const scored: { i: number; s: number }[] = [];
    for (const n of data.nodes) {
      if (n.kind !== 'note') continue;
      let best = -Infinity;
      const t = fuzzy(n.title); if (t) best = Math.max(best, t.score);
      const p = fuzzy(n.path); if (p) best = Math.max(best, p.score - 0.5);
      for (const tag of n.tags) { const r = fuzzy(tag); if (r) best = Math.max(best, r.score - 1); }
      if (best > -Infinity) scored.push({ i: n.index, s: best });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 300).map((x) => x.i);
  }
}
