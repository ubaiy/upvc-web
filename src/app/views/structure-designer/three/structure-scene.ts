/**
 * structure-designer scene — renderer, camera, light, ground, orbit, picking,
 * drag handles and pictures for ONE structure.
 *
 * Rules: a frame is drawn only when something changed; the pixel ratio is
 * capped at 2; the shadow map is redrawn only when the structure changes;
 * geometry is disposed on every rebuild and everything on destroy.
 */

import {
  ACESFilmicToneMapping,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Raycaster,
  Scene,
  ShadowMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { bounds, Dim, Structure } from '../../../shared/structure-model';
import { Gizmos } from './gizmos';
import {
  applyAppearance,
  buildHighlight,
  buildStructure,
  createMaterials,
  disposeHighlight,
  disposeMaterials,
  disposeStructure,
  PickTarget,
  StructureMaterials,
  StructureObject,
} from './structure-mesh';

export const MAX_PIXEL_RATIO = 2;
export type ViewPreset = '3d' | 'front' | 'side' | 'top';
const FOV_DEG = 32;
const WORLD_UP = new Vector3(0, 1, 0);
const BACKGROUND = '#eef1f1';
const ACCENT = '#0e6f6a';
const VIEW: Record<ViewPreset, Vector3> = {
  '3d': new Vector3(0.62, 0.4, 1).normalize(),
  front: new Vector3(0, 0.02, 1).normalize(),
  side: new Vector3(1, 0.02, 0).normalize(),
  top: new Vector3(0, 1, 0.001).normalize(),
};

export interface LabelPosition {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface OrbitBenchmark {
  frames: number;
  fps: number;
  meanFrameMs: number;
  worstFrameMs: number;
  meanRenderMs: number;
  triangles: number;
  drawCalls: number;
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export class StructureScene {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV_DEG, 1, 10, 200000);
  readonly controls: OrbitControls;
  private readonly materials: StructureMaterials = createMaterials();
  private readonly sun = new DirectionalLight(0xffffff, 2.1);
  private readonly ground: Mesh;
  private grid: GridHelper | null = null;
  private readonly human: Mesh;
  private readonly gizmos: Gizmos;
  private readonly raycaster = new Raycaster();
  private object: StructureObject | null = null;
  private highlight: Group | null = null;
  private structure: Structure | null = null;
  private centre = new Vector3();
  private radius = 1000;
  private half = new Vector3(500, 500, 500);
  /** Centre and radius the camera was last fitted to. */
  private fitted = { centre: new Vector3(), radius: 0 };
  private direction = VIEW['3d'].clone();
  private frame = 0;
  private disposed = false;
  private down: { x: number; y: number; t: number } | null = null;

  /** A face or bar was tapped (null = empty space). `additive` = with Shift or Ctrl. */
  onPick: ((hit: PickTarget | null, additive: boolean) => void) | null = null;
  /** A handle is dragged: the wanted value of that dimension. */
  onDimDrag: ((id: string, value: number, phase: 'start' | 'move' | 'end') => void) | null = null;
  /** After each frame: where each dimension label belongs on the canvas, CSS px. */
  onLabels: ((labels: LabelPosition[]) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly plain = false) {
    // Throws when the device has no WebGL: the host shows its own notice.
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'default' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.scene.background = new Color(BACKGROUND);
    this.scene.fog = new Fog(BACKGROUND, 20000, 60000);

    // A soft studio room for the reflections in glass and the gloss of the profile.
    const pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();

    this.scene.add(new HemisphereLight(0xffffff, 0xc9d0d2, 0.45));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(plain ? 1024 : 2048, plain ? 1024 : 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 12;
    this.sun.shadow.radius = 5;
    this.scene.add(this.sun, this.sun.target);

    // The ground shows only the shadow: the page colour stays clean in the view and in pictures.
    this.ground = new Mesh(new CircleGeometry(1, 48), new ShadowMaterial({ color: '#1c2a2e', opacity: 0.2 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -1;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.human = buildHuman();
    this.human.visible = !plain;
    this.scene.add(this.human);

    this.gizmos = new Gizmos(ACCENT);
    this.gizmos.root.visible = !plain;
    this.scene.add(this.gizmos.root);

    // Our pointerdown is added before the orbit's: a handle takes the drag first.
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.01;
    this.controls.addEventListener('change', this.requestRender);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private readonly onContextLost = (e: Event): void => e.preventDefault();
  private readonly onContextRestored = (): void => {
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  };

  /**
   * Show a structure. The geometry of the one before is disposed. `refit`
   * moves the camera to it; 'auto' does so only when it has outgrown (or
   * shrunk well inside) the view it was fitted to, keeping the user's angle.
   */
  setStructure(structure: Structure, dims: Dim[], refit: boolean | 'auto'): void {
    if (this.object) disposeStructure(this.object);
    applyAppearance(this.materials, structure.appearance);
    this.structure = structure;
    this.object = buildStructure(structure, this.materials);
    this.scene.add(this.object.root);
    this.gizmos.setDims(dims);

    const box = bounds(structure);
    const size = new Vector3(box.max[0] - box.min[0], box.max[1], box.max[2] - box.min[2]);
    this.centre.set((box.min[0] + box.max[0]) / 2, box.max[1] / 2, (box.min[2] + box.max[2]) / 2);
    this.radius = Math.max(600, size.length() / 2);
    this.half.copy(size).multiplyScalar(0.5);
    this.placeStage(box.min[0], box.max[2]);
    this.renderer.shadowMap.needsUpdate = true;
    const moved = this.centre.distanceTo(this.fitted.centre) > this.fitted.radius * 0.12;
    const resized = Math.abs(this.radius - this.fitted.radius) > this.fitted.radius * 0.08;
    if (refit === true) this.fit();
    else if (refit === 'auto' && (moved || resized)) this.fit(true);
    else this.requestRender();
  }

  /** Ground, grid, sun and the person follow the size of the structure. */
  private placeStage(minX: number, maxZ: number): void {
    const r = this.radius;
    this.ground.scale.setScalar(r * 14);
    this.ground.position.set(this.centre.x, -1, this.centre.z);
    const fog = this.scene.fog as Fog;
    fog.near = r * 7;
    fog.far = r * 15;
    // One grid line a metre, redrawn only when the structure outgrows it.
    const metres = Math.max(8, Math.ceil((r * 5) / 1000 / 2) * 2);
    if (!this.grid || this.grid.userData['metres'] !== metres) {
      if (this.grid) {
        this.grid.geometry.dispose();
        (this.grid.material as Material).dispose();
        this.grid.removeFromParent();
      }
      this.grid = new GridHelper(metres * 1000, metres, 0xb4bcbc, 0xd3d8d7);
      this.grid.userData['metres'] = metres;
      this.grid.position.y = 1;
      (this.grid.material as Material).transparent = true;
      (this.grid.material as Material).opacity = 0.7;
      this.scene.add(this.grid);
    }
    this.sun.position.set(this.centre.x - r * 1.1, r * 2.6, this.centre.z + r * 1.5);
    this.sun.target.position.copy(this.centre);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -r * 1.7;
    cam.right = cam.top = r * 1.7;
    cam.near = r * 0.2;
    cam.far = r * 6;
    cam.updateProjectionMatrix();
    // To the left of the front: clear of the structure from the usual three-quarter view.
    this.human.position.set(minX - 900, 0, maxZ - 200);
  }

  setSelection(faceIds: string[], barId: string | null): void {
    if (this.highlight) disposeHighlight(this.highlight);
    this.highlight = null;
    if (this.structure && (faceIds.length || barId)) {
      this.highlight = buildHighlight(this.structure, faceIds, barId, ACCENT);
      this.scene.add(this.highlight);
    }
    this.requestRender();
  }

  setGizmosVisible(visible: boolean): void {
    this.gizmos.root.visible = visible && !this.plain;
    this.requestRender();
  }

  view(preset: ViewPreset): void {
    this.direction.copy(VIEW[preset]);
    this.fit();
  }

  /** The whole structure in view, from the direction the camera looks now. */
  fit(keepDirection = false): void {
    if (keepDirection) this.direction.copy(this.camera.position).sub(this.controls.target).normalize();
    const el = this.renderer.domElement;
    this.frameCamera(el.width / Math.max(1, el.height));
    this.controls.update();
    this.requestRender();
  }

  private frameCamera(aspect: number): void {
    const tanV = Math.tan((FOV_DEG * Math.PI) / 360);
    const tanH = tanV * aspect;
    // Far enough for every corner of the structure's box to be in view, plus room for handles and labels.
    const right = new Vector3().crossVectors(WORLD_UP, this.direction).normalize();
    const upward = new Vector3().crossVectors(this.direction, right);
    const rel = new Vector3();
    let distance = 0;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          rel.set(sx * this.half.x, sy * this.half.y, sz * this.half.z);
          distance = Math.max(distance, rel.dot(this.direction) + Math.max(Math.abs(rel.dot(upward)) / tanV, Math.abs(rel.dot(right)) / tanH));
        }
      }
    }
    distance = Math.max(distance * 1.16, this.radius * 1.1);
    this.camera.aspect = aspect;
    this.camera.near = Math.max(20, distance / 200);
    this.camera.far = distance * 30;
    this.camera.position.copy(this.centre).addScaledVector(this.direction, distance);
    this.camera.lookAt(this.centre);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(this.centre);
    this.fitted = { centre: this.centre.clone(), radius: this.radius };
    this.controls.minDistance = this.radius * 0.4;
    this.controls.maxDistance = distance * 5;
  }

  resize(widthPx: number, heightPx: number): void {
    if (widthPx < 2 || heightPx < 2) return;
    this.renderer.setSize(widthPx, heightPx, false);
    this.camera.aspect = widthPx / heightPx;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  // --- pointer: handles first, then a tap picks, everything else is the orbit ---

  private ray(e: { clientX: number; clientY: number }): Raycaster {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (!this.gizmos.root.visible || e.button !== 0) return;
    const start = this.gizmos.grab(this.ray(e), e.pointerType === 'touch');
    if (!start) return;
    this.controls.enabled = false;
    this.canvas.setPointerCapture(e.pointerId);
    this.down = null;
    this.onDimDrag?.(start.id, start.value, 'start');
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.gizmos.dragging) {
      const next = this.gizmos.drag(this.ray(e));
      if (next) this.onDimDrag?.(next.id, next.value, 'move');
      return;
    }
    if (e.pointerType === 'mouse' && e.buttons === 0 && this.gizmos.root.visible) {
      const over = this.gizmos.hover(this.ray(e));
      this.canvas.style.cursor = over ? 'grab' : '';
      if (over !== null) this.requestRender();
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.gizmos.dragging) {
      const last = this.gizmos.release();
      this.controls.enabled = true;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
      if (last) this.onDimDrag?.(last.id, last.value, 'end');
      return;
    }
    const d = this.down;
    this.down = null;
    // A tap, not the end of an orbit.
    if (!d || e.type !== 'pointerup' || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
    this.onPick?.(this.pick(e), e.shiftKey || e.ctrlKey || e.metaKey);
  };

  /** What is under a point of the canvas. A bar in front of glass wins; glass wins over what is behind it. */
  pick(e: { clientX: number; clientY: number }): PickTarget | null {
    if (!this.object) return null;
    const hits = this.ray(e).intersectObjects(this.object.pickables, false);
    for (const hit of hits) {
      const owner = (hit.object.userData['owner'] as PickTarget[] | undefined)?.[hit.faceIndex ?? -1];
      if (owner?.id) return owner;
    }
    return null;
  }

  // --- drawing ---

  readonly requestRender = (): void => {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  };

  render(): void {
    if (this.disposed) return;
    this.human.rotation.y = Math.atan2(this.camera.position.x - this.human.position.x, this.camera.position.z - this.human.position.z);
    this.gizmos.face(this.camera, this.renderer.domElement.clientHeight);
    this.renderer.render(this.scene, this.camera);
    if (this.onLabels && this.gizmos.root.visible) {
      const el = this.renderer.domElement;
      this.onLabels(this.gizmos.labels(this.camera, el.clientWidth, el.clientHeight));
    }
  }

  info(): { triangles: number; drawCalls: number; geometries: number } {
    const i = this.renderer.info;
    return { triangles: i.render.triangles, drawCalls: i.render.calls, geometries: i.memory.geometries };
  }

  /**
   * PNG data URL at widthPx × heightPx on white: the user's own view, or the
   * standing three-quarter view. Handles, labels and the grid are left out.
   */
  snapshot(widthPx: number, heightPx: number, standing = false): string {
    const el = this.renderer.domElement;
    const before = {
      w: el.width,
      h: el.height,
      ratio: this.renderer.getPixelRatio(),
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
      aspect: this.camera.aspect,
      near: this.camera.near,
      far: this.camera.far,
      target: this.controls.target.clone(),
      direction: this.direction.clone(),
      gizmos: this.gizmos.root.visible,
      highlight: this.highlight?.visible ?? false,
    };
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(widthPx, heightPx, false);
    this.gizmos.root.visible = false;
    if (this.highlight) this.highlight.visible = false;
    if (this.grid) this.grid.visible = false;
    this.scene.background = new Color('#ffffff');
    (this.scene.fog as Fog).color.set('#ffffff');
    // Framed again for the shape of the picture: from the standing view, or from where the user looks.
    if (standing) this.direction.copy(VIEW['3d']);
    else this.direction.copy(this.camera.position).sub(this.controls.target).normalize();
    const fitted = this.fitted;
    this.frameCamera(widthPx / heightPx);
    this.fitted = fitted;
    this.human.rotation.y = Math.atan2(this.camera.position.x - this.human.position.x, this.camera.position.z - this.human.position.z);
    this.renderer.render(this.scene, this.camera);
    // Read in the same task as the draw: no preserveDrawingBuffer needed.
    const png = el.toDataURL('image/png');

    this.scene.background = new Color(BACKGROUND);
    (this.scene.fog as Fog).color.set(BACKGROUND);
    if (this.grid) this.grid.visible = true;
    if (this.highlight) this.highlight.visible = before.highlight;
    this.gizmos.root.visible = before.gizmos;
    this.renderer.setPixelRatio(before.ratio);
    this.renderer.setSize(before.w / before.ratio, before.h / before.ratio, false);
    this.direction.copy(before.direction);
    this.camera.position.copy(before.position);
    this.camera.quaternion.copy(before.quaternion);
    this.camera.aspect = before.aspect;
    this.camera.near = before.near;
    this.camera.far = before.far;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(before.target);
    this.controls.update();
    this.render();
    return png;
  }

  /** Turn the camera once round the structure, one step a frame, and time it. */
  orbitBenchmark(frames = 120): Promise<OrbitBenchmark> {
    return new Promise((resolve) => {
      const offset = this.camera.position.clone().sub(this.centre);
      const radius = Math.hypot(offset.x, offset.z);
      const start = Math.atan2(offset.x, offset.z);
      const stamps: number[] = [];
      let renderMs = 0;
      const step = (now: number): void => {
        stamps.push(now);
        const n = stamps.length;
        if (n > frames || this.disposed) {
          const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
          const mean = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);
          this.camera.position.copy(this.centre).add(offset);
          this.camera.lookAt(this.centre);
          this.render();
          resolve({
            frames: gaps.length,
            fps: mean ? 1000 / mean : 0,
            meanFrameMs: mean,
            worstFrameMs: Math.max(0, ...gaps),
            meanRenderMs: renderMs / Math.max(1, n - 1),
            ...this.info(),
          });
          return;
        }
        const a = start + (2 * Math.PI * n) / frames;
        this.camera.position.set(this.centre.x + radius * Math.sin(a), this.centre.y + offset.y, this.centre.z + radius * Math.cos(a));
        this.camera.lookAt(this.centre);
        const t0 = performance.now();
        this.render();
        renderMs += performance.now() - t0;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('webglcontextlost', this.onContextLost);
    c.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.controls.removeEventListener('change', this.requestRender);
    this.controls.dispose();
    if (this.object) disposeStructure(this.object);
    if (this.highlight) disposeHighlight(this.highlight);
    this.gizmos.dispose();
    disposeMaterials(this.materials);
    for (const mesh of [this.ground, this.human]) {
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    }
    if (this.grid) {
      this.grid.geometry.dispose();
      (this.grid.material as Material).dispose();
    }
    this.scene.environment?.dispose();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
    // Give the GPU context back now; a browser allows only a few at a time.
    this.renderer.forceContextLoss();
  }
}

/** A flat 1.7 m figure that always faces the camera: it gives the structure its scale. */
function buildHuman(): Mesh {
  const s = new Shape();
  const half: [number, number][] = [
    [40, 0], [150, 0], [160, 60], [125, 820], [170, 900], [215, 1380], [150, 1450], [70, 1470], [60, 1500],
  ];
  s.moveTo(half[0][0], half[0][1]);
  half.slice(1).forEach(([x, y]) => s.lineTo(x, y));
  s.absarc(0, 1595, 105, -0.6, Math.PI + 0.6, false);
  [...half].reverse().forEach(([x, y]) => s.lineTo(-x, y));
  s.lineTo(0, 780);
  s.closePath();
  const mesh = new Mesh(
    new ShapeGeometry(s, 10),
    new MeshBasicMaterial({ color: '#9aa5ab', side: DoubleSide, fog: false })
  );
  return mesh;
}
