/**
 * design-3d scene — renderer, camera, lights, orbit, fit, render on demand,
 * dispose and context loss for ONE window (or, later, one structure).
 *
 * Rules kept here for every phase: a frame is drawn only when something
 * changed; the pixel ratio is capped at 2; geometries are disposed on every
 * rebuild and everything on destroy; a lost context is given back by the
 * browser and three.js uploads the buffers again.
 */

import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CornerDemo, buildCornerDemo } from './corner-demo';
import { Studio } from './studio';
import { WindowParts } from './window-parts';
import {
  DEFAULT_LOOK,
  WindowLook,
  WindowMaterials,
  WindowObject,
  applyLook,
  buildWindowGroup,
  createMaterials,
  disposeMaterials,
  disposeWindow,
  setOpen,
} from './window-mesh';

export const MAX_PIXEL_RATIO = 2;
const FOV_DEG = 30;
/** The standing view: from outside, a little to the right and above. */
const VIEW_DIRECTION = new Vector3(0.5, 0.28, 1).normalize();
const WORLD_UP = new Vector3(0, 1, 0);
const FIT_MARGIN = 1.22;

export interface SceneInfo {
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  programs: number;
}

export interface OrbitBenchmark {
  frames: number;
  fps: number;
  meanFrameMs: number;
  worstFrameMs: number;
  meanRenderCallMs: number;
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

type DocumentListener = [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined];

/**
 * OrbitControls of three r160 puts a keydown listener on the document and its
 * dispose() does not take it off again, which keeps the controls, the canvas
 * and the GL context of every closed view alive. Until three is upgraded, the
 * listeners it adds to the document while it is constructed are noted here
 * and removed by release().
 */
function createControls(camera: PerspectiveCamera, canvas: HTMLCanvasElement): { controls: OrbitControls; release: () => void } {
  const added: DocumentListener[] = [];
  const add = document.addEventListener;
  document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    added.push([type, listener, options]);
    add.call(document, type, listener, options);
  }) as typeof document.addEventListener;
  try {
    const controls = new OrbitControls(camera, canvas);
    return { controls, release: () => added.forEach(([type, listener, options]) => document.removeEventListener(type, listener, options)) };
  } finally {
    document.addEventListener = add;
  }
}

export class DesignScene {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV_DEG, 1, 10, 100000);
  readonly controls: OrbitControls;
  private readonly releaseControls: () => void;
  private readonly studio: Studio;
  private readonly materials: WindowMaterials = createMaterials();
  private window: WindowObject | null = null;
  private parts: WindowParts | null = null;
  private corner: CornerDemo | null = null;
  private cornerOn = false;
  private size = { w: 0, h: 0, d: 0 };
  /** What the camera has to show: the frame box, or the pair of the corner demo. */
  private boxMin = new Vector3();
  private boxMax = new Vector3();
  private open = 0;
  private frame = 0;
  private disposed = false;
  private furnished = false;
  /** Called after each drawn frame (the host uses the first one for its timing). */
  onFrame: (() => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // Throws when the device has no WebGL: the host shows its own notice.
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'default' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.studio = new Studio(this.renderer, this.scene);

    const made = createControls(this.camera, canvas);
    this.controls = made.controls;
    this.releaseControls = made.release;
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', this.requestRender);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.requestRender);
  }

  private readonly onContextLost = (e: Event): void => e.preventDefault();

  /** Replace the window. The geometry of the one before is disposed. */
  setParts(parts: WindowParts, look: WindowLook = DEFAULT_LOOK): void {
    const first = !this.window;
    const resized =
      this.size.w !== parts.widthMm || this.size.h !== parts.heightMm || this.size.d !== parts.depthMm;
    if (this.window) disposeWindow(this.window);
    applyLook(this.materials, look);
    this.window = buildWindowGroup(parts, this.materials);
    this.parts = parts;
    setOpen(this.window, this.open);
    this.scene.add(this.window.root);
    this.size = { w: parts.widthMm, h: parts.heightMm, d: parts.depthMm };
    this.boxMin.set(0, 0, -parts.depthMm);
    this.boxMax.set(parts.widthMm, parts.heightMm, 0);
    this.buildCorner();
    this.studio.place(this.boxMin, this.boxMax);
    if (first || resized) this.fit();
    else this.requestRender();
  }

  /** Lab only: the same window on a second face at 90°, with a post (see corner-demo.ts). */
  setCornerDemo(on: boolean): void {
    if (on === this.cornerOn) return;
    this.cornerOn = on;
    if (!this.parts) return;
    this.boxMin.set(0, 0, -this.size.d);
    this.boxMax.set(this.size.w, this.size.h, 0);
    this.buildCorner();
    this.studio.place(this.boxMin, this.boxMax);
    this.fit();
  }

  private buildCorner(): void {
    this.corner?.dispose();
    this.corner = null;
    if (!this.cornerOn || !this.parts) return;
    this.corner = buildCornerDemo(this.parts, this.materials);
    setOpen(this.corner.face, this.open);
    this.scene.add(this.corner.root);
    this.boxMin.copy(this.corner.min);
    this.boxMax.copy(this.corner.max);
  }

  /** 0 = closed, 1 = fully open. */
  setOpen(t: number): void {
    this.open = t;
    if (this.window) setOpen(this.window, t);
    if (this.corner) setOpen(this.corner.face, t);
    this.requestRender();
  }

  get movers(): number {
    return this.window?.movers.length ?? 0;
  }

  get hingedMovers(): number {
    return this.window?.movers.filter((m) => m.def.kind === 'hinge').length ?? 0;
  }

  private centre(): Vector3 {
    return new Vector3().addVectors(this.boxMin, this.boxMax).multiplyScalar(0.5);
  }

  /** Camera at the standing view, far enough for the whole window at this aspect. */
  private standingCamera(aspect: number): void {
    const centre = this.centre();
    const tanV = Math.tan((FOV_DEG * Math.PI) / 360);
    const tanH = tanV * aspect;
    // Far enough for every corner of the frame box to be inside the view, plus a margin.
    const right = new Vector3().crossVectors(WORLD_UP, VIEW_DIRECTION).normalize();
    const upward = new Vector3().crossVectors(VIEW_DIRECTION, right);
    let distance = 0;
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [-0.5, 0.5]) {
        for (const sz of [-0.5, 0.5]) {
          const rel = new Vector3().subVectors(this.boxMax, this.boxMin).multiply(new Vector3(sx, sy, sz));
          const need = rel.dot(VIEW_DIRECTION) + Math.max(Math.abs(rel.dot(upward)) / tanV, Math.abs(rel.dot(right)) / tanH);
          distance = Math.max(distance, need);
        }
      }
    }
    distance *= FIT_MARGIN;
    this.camera.aspect = aspect;
    this.camera.near = Math.max(10, distance / 100);
    this.camera.far = distance * 10;
    this.camera.position.copy(centre).addScaledVector(VIEW_DIRECTION, distance);
    this.camera.lookAt(centre);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(centre);
    this.controls.minDistance = distance * 0.2;
    this.controls.maxDistance = distance * 4;
  }

  fit(): void {
    if (!this.size.w) return;
    const el = this.renderer.domElement;
    this.standingCamera(el.width / Math.max(1, el.height));
    this.controls.update();
    this.requestRender();
  }

  resize(widthPx: number, heightPx: number): void {
    if (widthPx < 2 || heightPx < 2) return;
    this.renderer.setSize(widthPx, heightPx, false);
    this.camera.aspect = widthPx / heightPx;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  readonly requestRender = (): void => {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  };

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
    if (!this.furnished) {
      // The first frame is out; now the room for the reflections, and one more frame with it.
      this.furnished = true;
      setTimeout(() => {
        if (this.disposed) return;
        this.studio.furnish();
        this.requestRender();
      }, 0);
    }
  }

  info(): SceneInfo {
    const i = this.renderer.info;
    return {
      triangles: i.render.triangles,
      drawCalls: i.render.calls,
      geometries: i.memory.geometries,
      textures: i.memory.textures,
      programs: i.programs?.length ?? 0,
    };
  }

  /**
   * PNG data URL at exactly widthPx × heightPx on white, from the standing
   * view (not the user's orbit), so two devices give the same picture.
   */
  snapshot(widthPx: number, heightPx: number): string {
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
    };
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(widthPx, heightPx, false);
    this.studio.furnish();
    this.furnished = true;
    this.studio.paper(true);
    this.standingCamera(widthPx / heightPx);
    this.renderer.render(this.scene, this.camera);
    // Read in the same task as the draw: no preserveDrawingBuffer needed.
    const png = el.toDataURL('image/png');

    this.studio.paper(false);
    this.renderer.setPixelRatio(before.ratio);
    this.renderer.setSize(before.w / before.ratio, before.h / before.ratio, false);
    this.camera.position.copy(before.position);
    this.camera.quaternion.copy(before.quaternion);
    this.camera.aspect = before.aspect;
    this.camera.near = before.near;
    this.camera.far = before.far;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(before.target);
    this.render();
    return png;
  }

  /** Turn the camera once round the window, one step per animation frame, and time it. */
  orbitBenchmark(frames = 120): Promise<OrbitBenchmark> {
    return new Promise((resolve) => {
      const centre = this.centre();
      const offset = this.camera.position.clone().sub(centre);
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
          this.camera.position.copy(centre).add(offset);
          this.camera.lookAt(centre);
          this.render();
          resolve({
            frames: gaps.length,
            fps: mean ? 1000 / mean : 0,
            meanFrameMs: mean,
            worstFrameMs: Math.max(0, ...gaps),
            meanRenderCallMs: renderMs / Math.max(1, n - 1),
          });
          return;
        }
        const a = start + (2 * Math.PI * n) / frames;
        this.camera.position.set(centre.x + radius * Math.sin(a), centre.y + offset.y, centre.z + radius * Math.cos(a));
        this.camera.lookAt(centre);
        const t0 = performance.now();
        this.renderer.render(this.scene, this.camera);
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
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.requestRender);
    this.controls.removeEventListener('change', this.requestRender);
    this.controls.dispose();
    this.releaseControls();
    if (this.window) disposeWindow(this.window);
    this.window = null;
    this.corner?.dispose();
    this.corner = null;
    disposeMaterials(this.materials);
    this.studio.dispose();
    this.renderer.dispose();
    // Give the GPU context back now; a browser allows only a few at a time.
    this.renderer.forceContextLoss();
  }
}
