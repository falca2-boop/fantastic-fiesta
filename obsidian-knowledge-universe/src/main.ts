import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { UniverseSettingTab } from './settings';
import { DEFAULT_SETTINGS, UniverseSettings } from './types';
import { UniverseView, VIEW_TYPE_UNIVERSE } from './GraphView';

export default class KnowledgeUniversePlugin extends Plugin {
  settings: UniverseSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_UNIVERSE, (leaf: WorkspaceLeaf) => new UniverseView(leaf, this));
    this.addRibbonIcon('orbit', 'Knowledge Universe öffnen', () => void this.activateView());
    this.addCommand({ id: 'open-knowledge-universe', name: 'Knowledge Universe öffnen', callback: () => void this.activateView() });
    // obsidian://knowledge-universe?note=<Titel>  (Jarvis nutzt das, um die Ansicht zu öffnen und eine Notiz anzusteuern)
    this.registerObsidianProtocolHandler('knowledge-universe', (params) => {
      void this.activateView().then(() => {
        const note = (params.note || '').trim();
        if (!note) return;
        // Der Graph baut sich kurz nach dem Öffnen auf; ein paar Versuche genügen
        let tries = 0;
        const t = window.setInterval(() => {
          const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_UNIVERSE)[0]?.view as UniverseView | undefined;
          if ((view && view.focusQuery(note)) || ++tries >= 10) window.clearInterval(t);
        }, 600);
        this.registerInterval(t);
      });
    });
    this.addSettingTab(new UniverseSettingTab(this.app, this));
  }

  async activateView() {
    try { await this.openUniverse(); }
    catch (err) { console.error('[Knowledge Universe] Öffnen fehlgeschlagen', err); new Notice('Knowledge Universe konnte nicht geöffnet werden: ' + (err instanceof Error ? err.message : String(err))); }
  }

  private async openUniverse() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | undefined = workspace.getLeavesOfType(VIEW_TYPE_UNIVERSE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE_UNIVERSE, active: true });
    }
    await workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  /** Speichert und gibt die Einstellungen an alle offenen Ansichten weiter. */
  async saveSettings(rebuild: boolean) {
    await this.saveData(this.settings);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_UNIVERSE)) {
      const v = leaf.view;
      if (v instanceof UniverseView) v.applySettings(rebuild);
    }
  }
}
