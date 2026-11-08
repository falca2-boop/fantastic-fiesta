export type NodeKind = 'note' | 'tag';

export interface GNode {
  index: number;
  id: string;                 // Vault-Pfad der Notiz, bzw. "tag:#name"
  kind: NodeKind;
  title: string;
  path: string;
  folder: string;
  tags: string[];
  mtime: number;
  frontmatter: Record<string, string>;
  out: number[];              // Indizes der Notizen, auf die diese Notiz verlinkt
  in: number[];               // Indizes der Notizen, die auf diese verlinken (Backlinks)
  tagMembers: number[];       // nur bei Tag-Knoten: zugehörige Notizen
  degree: number;             // Anzahl verschiedener Nachbarn (Links bzw. Mitglieder)
  orphan: boolean;            // Notiz ohne jede Verlinkung
  // werden von analyzeGraph() gesetzt
  weight: number;             // 0..1, Gewicht nach Verlinkung
  cluster: number;
}

export interface GLink {
  source: number;
  target: number;
  kind: 'link' | 'tag';
  weight: number;
}

export interface GraphData {
  nodes: GNode[];
  links: GLink[];
  noteCount: number;
  linkCount: number;          // Verbindungen zwischen Notizen
  tagCount: number;
  clusterCount: number;
  tags: { tag: string; count: number }[];
}

export type Quality = 'auto' | 'low' | 'medium' | 'high';
export type OpenMode = 'split' | 'tab' | 'window';

export interface UniverseSettings {
  quality: Quality;
  bloom: number;              // 0 .. 2.5
  rotationSpeed: number;      // 0 .. 2
  pulses: boolean;
  ambientLines: boolean;
  showTagNodes: boolean;
  showOrphans: boolean;
  excludeFolders: string;     // kommagetrennt
  openMode: OpenMode;
}

export const DEFAULT_SETTINGS: UniverseSettings = {
  quality: 'auto',
  bloom: 0.9,
  rotationSpeed: 0.4,
  pulses: true,
  ambientLines: true,
  showTagNodes: true,
  showOrphans: true,
  excludeFolders: '',
  openMode: 'split',
};
