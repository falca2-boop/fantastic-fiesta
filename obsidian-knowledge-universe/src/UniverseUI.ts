import { GNode, GraphData, UniverseSettings } from './types';
import { PALETTE, clusterColor } from './GeometryBuilder';

// Statische Linien-Symbole (feste Zeichenketten, enthalten keine Nutzerdaten)
const ICON = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};

function svg(name: keyof typeof ICON): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ku-icon');
  s.innerHTML = ICON[name];            // nur feste Konstanten oben
  return s;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function iconButton(icon: keyof typeof ICON, title: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'ku-btn');
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.appendChild(svg(icon));
  b.addEventListener('click', onClick);
  return b;
}

export interface UIActions {
  zoom(factor: number): void;
  reset(): void;
  togglePause(): boolean;
  fullscreen(): void;
  search(query: string): number[];                 // Trefferliste (beste zuerst)
  highlight(indices: number[] | null): void;
  focusNode(index: number): void;
  openNode(index: number): void;
  setHidden(mask: Uint8Array | null): void;
  settingsChanged(patch: Partial<UniverseSettings>, rebuild: boolean): void;
}

type Panel = 'filter' | 'settings' | null;

export class UniverseUI {
  private data: GraphData | null = null;
  private statNodes!: HTMLElement; private statLinks!: HTMLElement; private statTags!: HTMLElement;
  private searchInput!: HTMLInputElement; private results!: HTMLElement;
  private panelFilter!: HTMLElement; private panelSettings!: HTMLElement;
  private filterBtn!: HTMLButtonElement; private settingsBtn!: HTMLButtonElement;
  private pauseBtn!: HTMLButtonElement;
  private tooltip!: HTMLElement; private details!: HTMLElement;
  private empty!: HTMLElement;
  private loading!: HTMLElement;
  private hint!: HTMLElement;
  private resultIdx: number[] = [];
  private active = -1;
  private panel: Panel = null;
  private selTags = new Set<string>();
  private selFolders = new Set<string>();
  private hideOrphans = false;
  private root: HTMLElement;
  private cleanup: (() => void)[] = [];

  constructor(parent: HTMLElement, private settings: UniverseSettings, private actions: UIActions) {
    this.root = el('div', 'ku-ui');
    parent.appendChild(this.root);
    this.buildTop();
    this.buildBottom();
    this.tooltip = el('div', 'ku-tooltip'); this.tooltip.hidden = true; this.root.appendChild(this.tooltip);
    this.details = el('aside', 'ku-details'); this.details.hidden = true; this.root.appendChild(this.details);
    this.empty = el('div', 'ku-empty', 'Keine Notizen gefunden.'); this.empty.hidden = true; this.root.appendChild(this.empty);
    this.loading = el('div', 'ku-empty', 'Universum wird aufgebaut …'); this.root.appendChild(this.loading);
    this.hint = el('div', 'ku-hint'); this.hint.hidden = true; this.root.appendChild(this.hint);
  }

  // ------------------------------------------------------------------------------------- Aufbau

  private buildTop() {
    const left = el('div', 'ku-top-left');
    left.appendChild(el('div', 'ku-title', 'KNOWLEDGE UNIVERSE'));
    const stats = el('div', 'ku-stats');
    const mk = (label: string) => { const s = el('span', 'ku-stat'); const v = el('b', undefined, '0'); s.append(v, ' ' + label); stats.appendChild(s); return v; };
    this.statNodes = mk('NODES'); this.statLinks = mk('CONNECTIONS'); this.statTags = mk('TAGS');
    left.appendChild(stats);
    this.root.appendChild(left);

    const right = el('div', 'ku-top-right');
    const searchWrap = el('div', 'ku-search');
    searchWrap.appendChild(svg('search'));
    this.searchInput = el('input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = 'Notiz suchen …';
    this.searchInput.setAttribute('aria-label', 'Notiz suchen');
    this.searchInput.spellcheck = false;
    this.searchInput.addEventListener('input', () => this.onSearch());
    this.searchInput.addEventListener('keydown', (e) => this.onSearchKey(e));
    this.searchInput.addEventListener('focus', () => { if (this.resultIdx.length) this.results.hidden = false; });
    searchWrap.appendChild(this.searchInput);
    this.results = el('div', 'ku-results'); this.results.hidden = true;
    searchWrap.appendChild(this.results);
    right.appendChild(searchWrap);

    this.filterBtn = iconButton('filter', 'Filter', () => this.togglePanel('filter'));
    this.settingsBtn = iconButton('settings', 'Einstellungen', () => this.togglePanel('settings'));
    right.append(this.filterBtn, this.settingsBtn);
    this.root.appendChild(right);

    this.panelFilter = el('div', 'ku-panel'); this.panelFilter.hidden = true;
    this.panelSettings = el('div', 'ku-panel'); this.panelSettings.hidden = true;
    this.root.append(this.panelFilter, this.panelSettings);
    this.buildSettingsPanel();

    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!searchWrap.contains(t)) this.results.hidden = true;
      if (this.panel && !this.panelFilter.contains(t) && !this.panelSettings.contains(t) && !this.filterBtn.contains(t) && !this.settingsBtn.contains(t)) this.togglePanel(null);
    };
    document.addEventListener('mousedown', onDoc);
    this.cleanup.push(() => document.removeEventListener('mousedown', onDoc));
  }

  private buildBottom() {
    const bar = el('div', 'ku-bottom');
    bar.append(
      iconButton('minus', 'Herauszoomen', () => this.actions.zoom(1.3)),
      iconButton('plus', 'Hineinzoomen', () => this.actions.zoom(1 / 1.3)),
      iconButton('reset', 'Ansicht zurücksetzen', () => this.actions.reset()),
    );
    this.pauseBtn = iconButton('pause', 'Animation anhalten', () => { const p = this.actions.togglePause(); this.setPaused(p); });
    bar.append(this.pauseBtn, iconButton('full', 'Vollbild', () => this.actions.fullscreen()));
    this.root.appendChild(bar);
  }

  setPaused(p: boolean) {
    this.pauseBtn.replaceChildren(svg(p ? 'play' : 'pause'));
    this.pauseBtn.title = p ? 'Animation fortsetzen' : 'Animation anhalten';
    this.pauseBtn.setAttribute('aria-label', this.pauseBtn.title);
  }

  private togglePanel(p: Panel) {
    this.panel = this.panel === p ? null : p;
    this.panelFilter.hidden = this.panel !== 'filter';
    this.panelSettings.hidden = this.panel !== 'settings';
    this.filterBtn.classList.toggle('is-active', this.panel === 'filter');
    this.settingsBtn.classList.toggle('is-active', this.panel === 'settings');
  }

  // -------------------------------------------------------------------------------------- Daten

  /** Dezenter Hinweis unten links (z. B. vereinfachte Darstellung). */
  showHint(text: string, ms = 14000) {
    this.hint.replaceChildren(el('span', undefined, text));
    const x = iconButton('close', 'Schließen', () => { this.hint.hidden = true; });
    this.hint.appendChild(x);
    this.hint.hidden = false;
    window.setTimeout(() => { this.hint.hidden = true; }, ms);
  }

  /** Fehler sichtbar machen, statt leer zu bleiben. */
  showError(text: string) {
    this.loading.hidden = false;
    this.loading.classList.add('ku-error-text');
    this.loading.textContent = text;
  }

  setGraph(data: GraphData) {
    this.data = data;
    this.loading.hidden = true;
    this.empty.hidden = data.noteCount > 0;
    this.buildFilterPanel();
    this.applyFilter();
    if (this.searchInput.value) this.onSearch();
    // geöffnete Detailkarte bleibt, solange der Knoten existiert
    this.details.hidden = true;
  }

  /** Nur die Metadaten austauschen (Knotenindizes sind unverändert). */
  setGraphMeta(data: GraphData) { this.data = data; }

  private buildSettingsPanel() {
    const p = this.panelSettings;
    p.replaceChildren(el('div', 'ku-panel-title', 'Einstellungen'));
    const s = this.settings;
    const slider = (label: string, min: number, max: number, step: number, value: number, set: (v: number) => void) => {
      const row = el('label', 'ku-row');
      row.appendChild(el('span', undefined, label));
      const i = el('input'); i.type = 'range'; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(value);
      i.addEventListener('input', () => set(Number(i.value)));
      row.appendChild(i); p.appendChild(row);
    };
    const toggle = (label: string, value: boolean, set: (v: boolean) => void) => {
      const row = el('label', 'ku-row');
      row.appendChild(el('span', undefined, label));
      const i = el('input'); i.type = 'checkbox'; i.checked = value;
      i.addEventListener('change', () => set(i.checked));
      row.appendChild(i); p.appendChild(row);
    };
    slider('Leuchten', 0, 2.5, 0.05, s.bloom, (v) => { s.bloom = v; this.actions.settingsChanged({ bloom: v }, false); });
    slider('Drehung', 0, 2, 0.05, s.rotationSpeed, (v) => { s.rotationSpeed = v; this.actions.settingsChanged({ rotationSpeed: v }, false); });
    toggle('Lichtimpulse', s.pulses, (v) => { s.pulses = v; this.actions.settingsChanged({ pulses: v }, false); });
    toggle('Feines Geflecht', s.ambientLines, (v) => { s.ambientLines = v; this.actions.settingsChanged({ ambientLines: v }, true); });
    toggle('Tags als Knoten', s.showTagNodes, (v) => { s.showTagNodes = v; this.actions.settingsChanged({ showTagNodes: v }, true); });
    toggle('Verwaiste Notizen', s.showOrphans, (v) => { s.showOrphans = v; this.actions.settingsChanged({ showOrphans: v }, true); });
    const row = el('label', 'ku-row');
    row.appendChild(el('span', undefined, 'Qualität'));
    const sel = el('select');
    for (const [v, t] of [['auto', 'Automatisch'], ['minimal', 'Minimal'], ['low', 'Niedrig'], ['medium', 'Mittel'], ['high', 'Hoch']]) {
      const o = el('option', undefined, t); o.value = v; if (v === s.quality) o.selected = true; sel.appendChild(o);
    }
    sel.addEventListener('change', () => { s.quality = sel.value as UniverseSettings['quality']; this.actions.settingsChanged({ quality: s.quality }, true); });
    row.appendChild(sel); p.appendChild(row);
  }

  // ------------------------------------------------------------------------------------- Filter

  private buildFilterPanel() {
    const p = this.panelFilter;
    p.replaceChildren(el('div', 'ku-panel-title', 'Filter'));
    const data = this.data;
    if (!data) return;

    const orphanRow = el('label', 'ku-row');
    orphanRow.appendChild(el('span', undefined, 'Verwaiste ausblenden'));
    const oc = el('input'); oc.type = 'checkbox'; oc.checked = this.hideOrphans;
    oc.addEventListener('change', () => { this.hideOrphans = oc.checked; this.applyFilter(); });
    orphanRow.appendChild(oc); p.appendChild(orphanRow);

    const chips = (title: string, items: { key: string; count: number }[], sel: Set<string>) => {
      if (!items.length) return;
      p.appendChild(el('div', 'ku-panel-sub', title));
      const wrap = el('div', 'ku-chips');
      for (const it of items) {
        const c = el('button', 'ku-chip' + (sel.has(it.key) ? ' is-on' : ''));
        c.type = 'button';
        c.append(it.key, el('i', undefined, String(it.count)));
        c.addEventListener('click', () => { if (sel.has(it.key)) sel.delete(it.key); else sel.add(it.key); c.classList.toggle('is-on'); this.applyFilter(); });
        wrap.appendChild(c);
      }
      p.appendChild(wrap);
    };
    chips('Tags', data.tags.slice(0, 24).map((t) => ({ key: t.tag, count: t.count })), this.selTags);

    const folders = new Map<string, number>();
    for (const n of data.nodes) if (n.kind === 'note') { const f = n.folder.split('/')[0] || '(Hauptordner)'; folders.set(f, (folders.get(f) ?? 0) + 1); }
    chips('Ordner', [...folders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([key, count]) => ({ key, count })), this.selFolders);

    const reset = el('button', 'ku-link', 'Filter zurücksetzen');
    reset.type = 'button';
    reset.addEventListener('click', () => { this.selTags.clear(); this.selFolders.clear(); this.hideOrphans = false; this.buildFilterPanel(); this.applyFilter(); });
    p.appendChild(reset);
  }

  filterByTag(tag: string) {
    this.selTags = new Set([tag]);
    this.buildFilterPanel();
    this.applyFilter();
    if (this.panel !== 'filter') this.togglePanel('filter');
  }

  private applyFilter() {
    const data = this.data;
    if (!data) return;
    const N = data.nodes.length;
    const active = this.selTags.size > 0 || this.selFolders.size > 0 || this.hideOrphans;
    if (!active) { this.actions.setHidden(null); this.updateStats(null); this.filterBtn.classList.remove('has-filter'); return; }
    const hidden = new Uint8Array(N);
    for (const n of data.nodes) {
      if (n.kind !== 'note') continue;
      let ok = true;
      if (this.hideOrphans && n.orphan) ok = false;
      if (ok && this.selTags.size && !n.tags.some((t) => this.selTags.has(t))) ok = false;
      if (ok && this.selFolders.size && !this.selFolders.has(n.folder.split('/')[0] || '(Hauptordner)')) ok = false;
      hidden[n.index] = ok ? 0 : 1;
    }
    for (const n of data.nodes) {
      if (n.kind !== 'tag') continue;
      const anyVisible = n.tagMembers.some((m) => !hidden[m]);
      const wanted = this.selTags.size === 0 || this.selTags.has(n.title);
      hidden[n.index] = anyVisible && wanted ? 0 : 1;
    }
    this.actions.setHidden(hidden);
    this.updateStats(hidden);
    this.filterBtn.classList.add('has-filter');
  }

  private updateStats(hidden: Uint8Array | null) {
    const d = this.data;
    if (!d) return;
    const fmt = (n: number) => n.toLocaleString('de-DE');
    if (!hidden) {
      this.statNodes.textContent = fmt(d.noteCount); this.statLinks.textContent = fmt(d.linkCount); this.statTags.textContent = fmt(d.tagCount);
      return;
    }
    let nodes = 0, links = 0;
    for (const n of d.nodes) if (n.kind === 'note' && !hidden[n.index]) nodes++;
    for (const l of d.links) if (l.kind === 'link' && !hidden[l.source] && !hidden[l.target]) links++;
    this.statNodes.textContent = fmt(nodes) + ' / ' + fmt(d.noteCount);
    this.statLinks.textContent = fmt(links) + ' / ' + fmt(d.linkCount);
    this.statTags.textContent = fmt(d.tagCount);
  }

  // --------------------------------------------------------------------------------------- Suche

  private onSearch() {
    const q = this.searchInput.value.trim();
    this.active = -1;
    if (!q) { this.resultIdx = []; this.results.hidden = true; this.actions.highlight(null); return; }
    this.resultIdx = this.actions.search(q);
    this.actions.highlight(this.resultIdx.slice(0, 300));
    this.renderResults();
  }

  private renderResults() {
    const data = this.data;
    this.results.replaceChildren();
    if (!data) return;
    if (!this.resultIdx.length) { this.results.appendChild(el('div', 'ku-result-empty', 'Keine Treffer')); this.results.hidden = false; return; }
    this.resultIdx.slice(0, 8).forEach((idx, k) => {
      const n = data.nodes[idx];
      const r = el('button', 'ku-result' + (k === this.active ? ' is-active' : ''));
      r.type = 'button';
      const dot = el('span', 'ku-dot'); dot.style.background = '#' + clusterColor(n.cluster).getHexString();
      r.append(dot, el('span', 'ku-result-title', n.title));
      if (n.folder) r.appendChild(el('span', 'ku-result-sub', n.folder));
      r.addEventListener('mousedown', (e) => { e.preventDefault(); this.pickResult(idx); });
      r.addEventListener('mouseenter', () => this.actions.highlight([idx]));
      r.addEventListener('mouseleave', () => this.actions.highlight(this.resultIdx.slice(0, 300)));
      this.results.appendChild(r);
    });
    this.results.hidden = false;
  }

  private onSearchKey(e: KeyboardEvent) {
    const shown = Math.min(8, this.resultIdx.length);
    if (e.key === 'ArrowDown' && shown) { e.preventDefault(); this.active = (this.active + 1) % shown; this.renderResults(); }
    else if (e.key === 'ArrowUp' && shown) { e.preventDefault(); this.active = (this.active - 1 + shown) % shown; this.renderResults(); }
    else if (e.key === 'Enter' && shown) { e.preventDefault(); this.pickResult(this.resultIdx[Math.max(0, this.active)]); }
    else if (e.key === 'Escape') { this.searchInput.value = ''; this.resultIdx = []; this.results.hidden = true; this.actions.highlight(null); this.searchInput.blur(); }
  }

  private pickResult(idx: number) {
    this.results.hidden = true;
    this.actions.highlight([idx]);
    this.actions.focusNode(idx);
    this.showDetails(idx);
  }

  // ------------------------------------------------------------------------------- Tooltip / Details

  showTooltip(node: GNode | null, x: number, y: number) {
    if (!node) { this.tooltip.hidden = true; return; }
    this.tooltip.replaceChildren(el('b', undefined, node.kind === 'tag' ? node.title : node.title));
    const meta = node.kind === 'tag' ? `${node.tagMembers.length} Notizen` : `${node.out.length} Links · ${node.in.length} Backlinks`;
    this.tooltip.appendChild(el('span', undefined, meta));
    this.tooltip.hidden = false;
    const w = this.root.clientWidth;
    this.tooltip.style.left = Math.min(w - 230, x + 16) + 'px';
    this.tooltip.style.top = Math.max(8, y + 14) + 'px';
  }

  hideDetails() { this.details.hidden = true; }

  showDetails(index: number) {
    const data = this.data;
    if (!data) return;
    const n = data.nodes[index];
    if (!n) return;
    const d = this.details;
    d.replaceChildren();
    const head = el('div', 'ku-d-head');
    const dot = el('span', 'ku-dot'); dot.style.background = '#' + clusterColor(n.cluster).getHexString();
    head.append(dot, el('h3', undefined, n.title));
    const close = iconButton('close', 'Schließen', () => { d.hidden = true; });
    head.appendChild(close);
    d.appendChild(head);
    if (n.path) d.appendChild(el('div', 'ku-d-path', n.path));

    const links = (title: string, ids: number[]) => {
      if (!ids.length) return;
      d.appendChild(el('div', 'ku-panel-sub', `${title} (${ids.length})`));
      const list = el('div', 'ku-d-list');
      ids.slice(0, 8).forEach((i) => {
        const b = el('button', 'ku-d-link', data.nodes[i].title);
        b.type = 'button';
        b.addEventListener('click', () => { this.actions.focusNode(i); this.showDetails(i); });
        list.appendChild(b);
      });
      if (ids.length > 8) list.appendChild(el('span', 'ku-d-more', `+ ${ids.length - 8} weitere`));
      d.appendChild(list);
    };

    if (n.kind === 'tag') {
      d.appendChild(el('div', 'ku-d-stats', `${n.tagMembers.length} Notizen mit diesem Tag`));
      links('Notizen', n.tagMembers);
      const f = el('button', 'ku-btn-wide', 'Nur diesen Tag zeigen');
      f.type = 'button'; f.addEventListener('click', () => this.filterByTag(n.title));
      d.appendChild(f);
    } else {
      const date = n.mtime ? new Date(n.mtime).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      d.appendChild(el('div', 'ku-d-stats', `${n.out.length} Links · ${n.in.length} Backlinks${date ? ' · geändert ' + date : ''}`));
      if (n.tags.length) {
        const tg = el('div', 'ku-chips');
        for (const t of n.tags.slice(0, 12)) {
          const c = el('button', 'ku-chip', t); c.type = 'button';
          c.addEventListener('click', () => this.filterByTag(t));
          tg.appendChild(c);
        }
        d.appendChild(tg);
      }
      const fm = Object.entries(n.frontmatter);
      if (fm.length) {
        d.appendChild(el('div', 'ku-panel-sub', 'Eigenschaften'));
        const table = el('div', 'ku-d-props');
        for (const [k, v] of fm.slice(0, 8)) { table.append(el('span', 'ku-k', k), el('span', 'ku-v', v)); }
        d.appendChild(table);
      }
      links('Backlinks', n.in);
      links('Verlinkt auf', n.out);
      const open = el('button', 'ku-btn-wide');
      open.type = 'button';
      open.append(svg('open'), 'Notiz öffnen');
      open.addEventListener('click', () => this.actions.openNode(index));
      d.appendChild(open);
    }
    d.hidden = false;
  }

  dispose() {
    for (const c of this.cleanup) c();
    this.root.remove();
  }
}

export { PALETTE };
