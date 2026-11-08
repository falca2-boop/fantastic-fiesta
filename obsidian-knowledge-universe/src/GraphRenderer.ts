import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildGeometry, BuiltGeometry } from './GeometryBuilder';
import { analyzeGraph, ForceLayout } from './GraphLayout';
import { LINES_FRAGMENT, LINES_VERTEX, POINTS_FRAGMENT, POINTS_VERTEX } from './shaders';
import { GNode, GraphData, Quality, UniverseSettings } from './types';

export interface RendererEvents {
  onHover(node: GNode | null, x: number, y: number): void;
  /** einfacher Klick: Knoten (oder null bei Klick ins Leere) */
  onClick(node: GNode | null): void;
  /** Doppelklick auf einen Knoten */
  onDoubleClick(node: GNode): void;
}

export type RenderSettings = Pick<UniverseSettings, 'quality' | 'bloom' | 'rotationSpeed' | 'pulses' | 'ambientLines'>;

const BG = 0x030305;
const BUDGETS: Record<Exclude<Quality, 'auto'>, { particles: number; lines: number }> = {
  low: { particles: 3000, lines: 4500 },
  medium: { particles: 6500, lines: 9000 },
  high: { particles: 10000, lines: 16000 },
};

export function resolveQuality(q: Quality): Exclude<Quality, 'auto'> {
  if (q !== 'auto') return q;
  const cores = navigator.hardwareConcurrency || 4;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  if (small || cores <= 4) return 'low';
  if (cores >= 12) return 'high';
  return 'medium';
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class GraphRenderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private layout = new ForceLayout();
  private data: GraphData | null = null;
  private built: BuiltGeometry | null = null;
  private objects: THREE.Object3D[] = [];
  private pointsMat: THREE.ShaderMaterial;
  private linesMat: THREE.ShaderMaterial;
  private uniforms: Record<string, THREE.IUniform>;
  private nodeTex: THREE.DataTexture | null = null;
  private texData = new Float32Array(4);
  private texDirty = false;

  private adjacency: number[][] = [];
  private hidden: Uint8Array | null = null;
  private hover = -1;
  private selected = -1;
  private search: Set<number> | null = null;
  private focusTarget = 0;

  private paused = false;
  private time = 0;
  private lastT = 0;
  private raf = 0;
  private disposed = false;
  private visible = true;
  private cameraReady = false;
  private autoFrame = true;          // Kamera folgt der Ausdehnung, bis der Nutzer selbst steuert
  private wasRunning = false;
  private pixelRatio = 1;
  private basePixelRatio = 1;
  private perfEma = 16;
  private perfSlowFrames = 0;
  private perfLevel = 0;
  private bloomForcedOff = false;
  private resizeObs: ResizeObserver;
  private intersectObs?: IntersectionObserver;

  private ptr = { x: 0, y: 0, inside: false };
  private pickDirty = false;
  private interacting = false;
  private down = { x: 0, y: 0, t: 0, button: -1 };
  private clickTimer: number | null = null;
  private tween: { t0: number; dur: number; fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null = null;
  private pv = new THREE.Matrix4();

  constructor(private container: HTMLElement, private settings: RenderSettings, private events: RendererEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
    this.canvas = this.renderer.domElement;
    this.canvas.classList.add('ku-canvas');
    this.container.appendChild(this.canvas);
    // Hintergrund #030305 über scene.background: wird erst beim Rendern ins richtige Ziel umgerechnet
    // (setClearColor würde hier doppelt nach sRGB umgerechnet und den Hintergrund aufhellen)
    this.renderer.setClearColor(0x000000, 1);
    this.scene.background = new THREE.Color(BG);
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.pixelRatio = this.basePixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);

    this.camera = new THREE.PerspectiveCamera(55, 1, 1, 8000);
    this.camera.position.set(0, 40, 260);

    this.uniforms = {
      uNodes: { value: null },
      uTexW: { value: 1 },
      uTime: { value: 0 },
      uAmp: { value: 0.9 },
      uScale: { value: 800 },
      uFocus: { value: 0 },
      uFogNear: { value: 100 },
      uFogFar: { value: 600 },
      uMinPx: { value: 1.4 },
      uBrightness: { value: 0.6 },
      uPulse: { value: settings.pulses ? 1 : 0 },
    };
    const common = { uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending } as const;
    this.pointsMat = new THREE.ShaderMaterial({ ...common, vertexShader: POINTS_VERTEX, fragmentShader: POINTS_FRAGMENT });
    this.linesMat = new THREE.ShaderMaterial({ ...common, vertexShader: LINES_VERTEX, fragmentShader: LINES_FRAGMENT });

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.8;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 2000;
    // links drehen, Mausrad zoomen, rechts verschieben
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('start', () => { this.interacting = true; this.autoFrame = false; this.tween = null; this.setHover(-1); });
    this.controls.addEventListener('end', () => { this.interacting = false; this.pickDirty = true; });

    // Nachbearbeitung: Bloom (Glühen)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), settings.bloom, 0.5, 0.12);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('dblclick', this.onDblClick);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.container);
    if ('IntersectionObserver' in window) {
      this.intersectObs = new IntersectionObserver((e) => { this.visible = e[0]?.isIntersecting ?? true; });
      this.intersectObs.observe(this.container);
    }
    this.resize();
    this.applySettings(settings);
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ----------------------------------------------------------------------------------------- Daten

  /** Neuen Graphen laden. Bestehende Positionen bleiben erhalten, damit das Universum nicht "springt". */
  setGraph(data: GraphData) {
    analyzeGraph(data);
    const prev = this.data && this.layout.n ? this.layout.snapshot(this.data) : undefined;
    this.data = data;
    this.layout.set(data, prev);
    const N = data.nodes.length;

    this.adjacency = Array.from({ length: N }, () => []);
    for (const l of data.links) { this.adjacency[l.source].push(l.target); this.adjacency[l.target].push(l.source); }

    // Knoten-Textur (xyz = Position, w = Zustand)
    const w = Math.max(1, Math.ceil(Math.sqrt(N)));
    const h = Math.max(1, Math.ceil(N / w));
    this.texData = new Float32Array(w * h * 4);
    this.nodeTex?.dispose();
    const tex = new THREE.DataTexture(this.texData, w, h, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.nodeTex = tex;
    this.uniforms.uNodes.value = tex;
    this.uniforms.uTexW.value = w;

    this.rebuildGeometry();
    this.hover = -1;
    if (this.selected >= N) this.selected = -1;
    this.search = null;
    this.writePositions();
    this.refreshStates();

    // kleine Vaults: Partikel verteilen sich auf wenige Knoten, daher etwas heller
    this.uniforms.uBrightness.value = 0.6 + 0.55 * (1 - Math.min(1, N / 150));
    const R = this.layout.radius;
    this.uniforms.uFogNear.value = R * 2.2;
    this.uniforms.uFogFar.value = R * 5.2;
    this.uniforms.uAmp.value = this.layout.restLength * 0.03;
    this.controls.maxDistance = R * 8;
    if (!this.cameraReady) { this.placeCamera(R); this.cameraReady = true; }
  }

  /** Nur Metadaten (Titel, Frontmatter …) ersetzen, ohne den Graphen neu aufzubauen. */
  replaceData(data: GraphData) {
    analyzeGraph(data);
    this.data = data;
  }

  private rebuildGeometry() {
    for (const o of this.objects) this.scene.remove(o);
    this.objects = [];
    if (this.built) {
      this.built.nodes.dispose(); this.built.dust.dispose(); this.built.links.dispose(); this.built.ambient?.dispose();
    }
    if (!this.data) return;
    const q = BUDGETS[resolveQuality(this.settings.quality)];
    const scale = this.perfLevel >= 2 ? 0.6 : 1;
    this.built = buildGeometry(this.data, {
      budget: Math.round(q.particles * scale), ambientBudget: Math.round(q.lines * scale),
      ambient: this.settings.ambientLines && this.perfLevel < 3, restLength: this.layout.restLength,
    });
    const add = (o: THREE.Object3D) => { o.frustumCulled = false; this.scene.add(o); this.objects.push(o); };
    add(new THREE.Points(this.built.dust, this.pointsMat));
    if (this.built.ambient) add(new THREE.LineSegments(this.built.ambient, this.linesMat));
    add(new THREE.LineSegments(this.built.links, this.linesMat));
    add(new THREE.Points(this.built.nodes, this.pointsMat));
  }

  get stats() { return { particles: this.built?.particleCount ?? 0, lines: this.built?.lineCount ?? 0 }; }
  get radius() { return this.layout.radius; }

  /** Ändert Einstellungen. Gibt true zurück, wenn die Geometrie neu aufgebaut werden musste. */
  applySettings(s: RenderSettings): boolean {
    const rebuild = !!this.data && (s.quality !== this.settings.quality || s.ambientLines !== this.settings.ambientLines);
    this.settings = s;
    this.bloom.strength = s.bloom;
    this.bloom.enabled = s.bloom > 0.01 && !this.bloomForcedOff;
    this.uniforms.uPulse.value = s.pulses ? 1 : 0;
    this.controls.autoRotate = !this.paused && s.rotationSpeed > 0;
    this.controls.autoRotateSpeed = s.rotationSpeed * 1.2;
    if (rebuild) this.rebuildGeometry();
    return rebuild;
  }

  // ------------------------------------------------------------------------------------- Zustände

  setHiddenMask(mask: Uint8Array | null) { this.hidden = mask; this.refreshStates(); }
  setSearchHighlight(indices: number[] | null) { this.search = indices && indices.length ? new Set(indices) : null; this.refreshStates(); }
  setSelected(i: number) { this.selected = i; this.refreshStates(); }

  private setHover(i: number) {
    if (i === this.hover) return;
    this.hover = i;
    this.canvas.style.cursor = i >= 0 ? 'pointer' : '';
    this.refreshStates();
    const node = i >= 0 && this.data ? this.data.nodes[i] : null;
    this.events.onHover(node, this.ptr.x, this.ptr.y);
  }

  private refreshStates() {
    if (!this.data) return;
    const N = this.data.nodes.length;
    const t = this.texData;
    const state = new Float32Array(N);
    for (let i = 0; i < N; i++) state[i] = this.hidden && this.hidden[i] ? -1 : 0;
    if (this.search) for (const i of this.search) if (i < N && state[i] >= 0) state[i] = 3;
    const focus = this.hover >= 0 ? this.hover : this.selected;
    if (focus >= 0 && focus < N && state[focus] >= 0) {
      if (state[focus] < 2) state[focus] = 2;
      for (const j of this.adjacency[focus]) if (state[j] === 0) state[j] = 1;
    }
    for (let i = 0; i < N; i++) t[i * 4 + 3] = state[i];
    this.texDirty = true;
    this.focusTarget = this.search || (focus >= 0 && focus < N) ? 1 : 0;
  }

  private writePositions() {
    const p = this.layout.pos;
    const t = this.texData;
    for (let i = 0; i < this.layout.n; i++) { t[i * 4] = p[i * 3]; t[i * 4 + 1] = p[i * 3 + 1]; t[i * 4 + 2] = p[i * 3 + 2]; }
    this.texDirty = true;
  }

  nodePosition(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.layout.pos;
    return out.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  }

  // ---------------------------------------------------------------------------------------- Kamera

  /** Abstand, bei dem das ganze Universum mit etwas Rand ins Bild passt. */
  private frameDistance(): number {
    const r = Math.max(this.layout.radius * 0.6, this.layout.extent());
    const aspect = this.camera.aspect || 1;
    return r * 3.5 * Math.max(1, 1.25 / aspect);
  }

  private placeCamera(R: number) {
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, R * 0.55, R * 3.3);
    this.controls.update();
  }

  private flyTo(target: THREE.Vector3, distance: number, dur: number) {
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.2, 1);
    dir.normalize();
    const toP = target.clone().add(dir.multiplyScalar(Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, distance))));
    this.tween = { t0: performance.now(), dur, fromP: this.camera.position.clone(), toP, fromT: this.controls.target.clone(), toT: target.clone() };
  }

  resetView() {
    const d = this.frameDistance();
    const toT = new THREE.Vector3(0, 0, 0);
    const toP = new THREE.Vector3(0, d * 0.16, d * 0.987);
    this.tween = { t0: performance.now(), dur: 1000, fromP: this.camera.position.clone(), toP, fromT: this.controls.target.clone(), toT };
  }

  zoomBy(factor: number) {
    const d = this.camera.position.distanceTo(this.controls.target);
    this.flyTo(this.controls.target.clone(), d * factor, 350);
  }

  focusNode(i: number) {
    if (!this.data || i < 0 || i >= this.data.nodes.length) return;
    this.flyTo(this.nodePosition(i), Math.max(this.layout.radius * 0.3, 40), 1100);
  }

  // ------------------------------------------------------------------------------------- Steuerung

  setPaused(p: boolean) {
    this.paused = p;
    this.controls.autoRotate = !p && this.settings.rotationSpeed > 0;
  }
  get isPaused() { return this.paused; }

  // ----------------------------------------------------------------------------------------- Maus

  private localPointer(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.ptr.x = e.clientX - r.left;
    this.ptr.y = e.clientY - r.top;
  }

  private onPointerMove = (e: PointerEvent) => {
    this.localPointer(e);
    this.ptr.inside = true;
    if (e.buttons === 0) this.pickDirty = true;
  };
  private onPointerLeave = () => { this.ptr.inside = false; this.setHover(-1); };
  private onPointerDown = (e: PointerEvent) => {
    this.localPointer(e);
    this.down = { x: this.ptr.x, y: this.ptr.y, t: performance.now(), button: e.button };
  };
  private onPointerUp = (e: PointerEvent) => {
    this.localPointer(e);
    if (this.down.button !== 0 || e.button !== 0) return;
    const moved = Math.hypot(this.ptr.x - this.down.x, this.ptr.y - this.down.y);
    if (moved > 5 || performance.now() - this.down.t > 600) return;
    const i = this.pickAt(this.ptr.x, this.ptr.y);
    if (this.clickTimer) { window.clearTimeout(this.clickTimer); this.clickTimer = null; }
    if (i < 0 || !this.data) { this.events.onClick(null); return; }
    const node = this.data.nodes[i];
    // kurz warten, damit ein Doppelklick nicht zusätzlich die Notiz öffnet
    this.clickTimer = window.setTimeout(() => { this.clickTimer = null; this.events.onClick(node); }, 260);
  };
  private onDblClick = (e: MouseEvent) => {
    const r = this.canvas.getBoundingClientRect();
    const i = this.pickAt(e.clientX - r.left, e.clientY - r.top);
    if (this.clickTimer) { window.clearTimeout(this.clickTimer); this.clickTimer = null; }
    if (i >= 0 && this.data) this.events.onDoubleClick(this.data.nodes[i]);
  };
  private onContextLost = (e: Event) => { e.preventDefault(); };

  /** Knoten unter dem Mauszeiger (Bildschirmraum, schnell auch bei vielen Tausend Knoten). */
  private pickAt(px: number, py: number): number {
    if (!this.data) return -1;
    this.camera.updateMatrixWorld();
    const e = this.pv.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse).elements;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const scale = (this.uniforms.uScale.value as number) / this.pixelRatio;
    const p = this.layout.pos;
    const sizes = this.built?.nodeSize;
    const N = this.data.nodes.length;
    const depthNorm = this.layout.radius * 8;
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < N; i++) {
      if (this.hidden && this.hidden[i]) continue;
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (cw <= 0.5) continue;
      const sx = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw * 0.5 + 0.5) * w;
      const sy = (1 - ((e[1] * x + e[5] * y + e[9] * z + e[13]) / cw * 0.5 + 0.5)) * h;
      const dx = sx - px, dy = sy - py;
      const d2 = dx * dx + dy * dy;
      const rad = Math.max(11, ((sizes ? sizes[i] : 3) * scale) / cw * 0.6);
      if (d2 > rad * rad) continue;
      const score = d2 / (rad * rad) + cw / depthNorm;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  // -------------------------------------------------------------------------------------- Schleife

  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w < 2 || h < 2) return;
    this.applyPixelRatio();
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.updateScale();
  }
  private applyPixelRatio() { this.renderer.setPixelRatio(this.pixelRatio); }
  private updateScale() {
    const h = this.renderer.domElement.height;
    this.uniforms.uScale.value = h / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.uniforms.uMinPx.value = 1.4 * this.pixelRatio;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    const raw = now - this.lastT;
    this.lastT = now;
    if (document.hidden || !this.visible || this.container.clientWidth < 2) return;

    if (!this.paused) this.time += dt;
    this.uniforms.uTime.value = this.time;

    if (this.layout.running) {
      this.layout.step(6);
      this.writePositions();
      this.wasRunning = true;
    } else if (this.wasRunning) {
      this.wasRunning = false;
      if (this.autoFrame && !this.interacting) { this.resetView(); this.autoFrame = true; }
    }
    if (this.texDirty && this.nodeTex) { this.nodeTex.needsUpdate = true; this.texDirty = false; }

    const f = this.uniforms.uFocus.value as number;
    this.uniforms.uFocus.value = f + (this.focusTarget - f) * Math.min(1, dt * 6);

    if (this.tween) {
      const k = Math.min(1, (now - this.tween.t0) / this.tween.dur);
      const e = ease(k);
      this.camera.position.lerpVectors(this.tween.fromP, this.tween.toP, e);
      this.controls.target.lerpVectors(this.tween.fromT, this.tween.toT, e);
      if (k >= 1) this.tween = null;
    }
    this.controls.update(dt);

    if (this.pickDirty && !this.interacting) {
      this.pickDirty = false;
      this.setHover(this.ptr.inside ? this.pickAt(this.ptr.x, this.ptr.y) : -1);
    }

    this.composer.render(dt);
    this.monitorPerformance(raw);
  };

  /** Senkt bei Rucklern schrittweise Auflösung, dann Partikelzahl und Bloom. */
  private monitorPerformance(frameMs: number) {
    if (this.settings.quality !== 'auto' || frameMs > 250) return;
    this.perfEma += (frameMs - this.perfEma) * 0.05;
    if (this.perfEma > 34) this.perfSlowFrames++; else this.perfSlowFrames = Math.max(0, this.perfSlowFrames - 1);
    if (this.perfSlowFrames < 90 || this.perfLevel >= 3) return;
    this.perfSlowFrames = 0;
    this.perfLevel++;
    if (this.perfLevel === 1) { this.pixelRatio = Math.max(0.75, this.basePixelRatio * 0.7); this.resize(); }
    else if (this.perfLevel === 2) { this.rebuildGeometry(); }
    else { this.bloomForcedOff = true; this.bloom.enabled = false; this.rebuildGeometry(); }
    this.perfEma = 16;
  }

  // ----------------------------------------------------------------------------------- Aufräumen

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.clickTimer) window.clearTimeout(this.clickTimer);
    this.resizeObs.disconnect();
    this.intersectObs?.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('dblclick', this.onDblClick);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.controls.dispose();
    for (const o of this.objects) this.scene.remove(o);
    if (this.built) { this.built.nodes.dispose(); this.built.dust.dispose(); this.built.links.dispose(); this.built.ambient?.dispose(); }
    this.pointsMat.dispose(); this.linesMat.dispose();
    this.nodeTex?.dispose();
    this.composer.dispose();
    this.bloom.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
