import { App, PluginSettingTab, Setting } from 'obsidian';
import type KnowledgeUniversePlugin from './main';
import { Quality, OpenMode } from './types';

export class UniverseSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: KnowledgeUniversePlugin) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = async (rebuild: boolean) => { await this.plugin.saveSettings(rebuild); };

    new Setting(containerEl).setName('Qualität')
      .setDesc('Anzahl der Partikel: niedrig ≈ 3.000, mittel ≈ 6.000, hoch ≈ 10.000. „Automatisch“ wählt nach Rechner und senkt die Auflösung bei Rucklern.')
      .addDropdown((d) => d.addOptions({ auto: 'Automatisch', low: 'Niedrig', medium: 'Mittel', high: 'Hoch' })
        .setValue(s.quality).onChange(async (v) => { s.quality = v as Quality; await save(true); }));

    new Setting(containerEl).setName('Leuchten (Bloom)').setDesc('Stärke des Leucht-Effekts.')
      .addSlider((sl) => sl.setLimits(0, 2.5, 0.05).setValue(s.bloom).setDynamicTooltip().onChange(async (v) => { s.bloom = v; await save(false); }));

    new Setting(containerEl).setName('Rotationsgeschwindigkeit').setDesc('0 = keine automatische Drehung.')
      .addSlider((sl) => sl.setLimits(0, 2, 0.05).setValue(s.rotationSpeed).setDynamicTooltip().onChange(async (v) => { s.rotationSpeed = v; await save(false); }));

    new Setting(containerEl).setName('Lichtimpulse').setDesc('Impulse, die durch die Verbindungen wandern.')
      .addToggle((t) => t.setValue(s.pulses).onChange(async (v) => { s.pulses = v; await save(false); }));

    new Setting(containerEl).setName('Neuronales Geflecht').setDesc('Zusätzliche feine Linien zwischen Partikeln. Abschalten spart Leistung.')
      .addToggle((t) => t.setValue(s.ambientLines).onChange(async (v) => { s.ambientLines = v; await save(true); }));

    new Setting(containerEl).setName('Tags als Knoten').setDesc('Häufige Tags (mindestens 2 Notizen) erscheinen als Ring und bündeln ihre Notizen.')
      .addToggle((t) => t.setValue(s.showTagNodes).onChange(async (v) => { s.showTagNodes = v; await save(true); }));

    new Setting(containerEl).setName('Verwaiste Notizen anzeigen').setDesc('Notizen ohne jeden Link.')
      .addToggle((t) => t.setValue(s.showOrphans).onChange(async (v) => { s.showOrphans = v; await save(true); }));

    new Setting(containerEl).setName('Ordner ausschließen').setDesc('Kommagetrennt, z. B. „Templates, 40-ARCHIVE“.')
      .addText((t) => t.setPlaceholder('Templates, 40-ARCHIVE').setValue(s.excludeFolders).onChange(async (v) => { s.excludeFolders = v; await save(true); }));

    new Setting(containerEl).setName('Notiz öffnen in').setDesc('Wo sich eine Notiz beim Klick auf einen Knoten öffnet.')
      .addDropdown((d) => d.addOptions({ split: 'Geteilte Ansicht', tab: 'Neuer Tab', window: 'Neues Fenster' })
        .setValue(s.openMode).onChange(async (v) => { s.openMode = v as OpenMode; await save(false); }));
  }
}
