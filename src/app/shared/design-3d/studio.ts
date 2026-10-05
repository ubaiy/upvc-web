/**
 * design-3d studio — what makes the picture read as a product and not as a
 * diagram: a procedural room for reflections (no image file, no licence), a
 * soft key light, a contact shadow on the floor, a neutral gradient behind,
 * and filmic tone mapping. All of it is cheap: no shadow maps, no
 * transmission pass, three small textures, one extra draw call.
 */

import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const BACKDROP = { top: '#f3f5f8', bottom: '#c9d0d9' };
const PAPER = new Color('#ffffff');
const EXPOSURE = 0.82;
const KEY_INTENSITY = 1.35;
const SHADOW_OPACITY = 0.34;

function gradientTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, BACKDROP.top);
  g.addColorStop(1, BACKDROP.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A soft dark blob: the shadow a window leaves on the floor it stands on. */
function shadowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

export class Studio {
  private room: Texture | null = null;
  /** Stands in for the room until the room is ready, so the first frame does not wait for it. */
  private fill: HemisphereLight | null = new HemisphereLight(0xffffff, 0x9aa4b0, 1.5);
  private readonly backdrop = gradientTexture();
  private readonly shadowMap = shadowTexture();
  private readonly shadowGeometry = new PlaneGeometry(1, 1);
  private readonly shadowMaterial = new MeshBasicMaterial({
    map: this.shadowMap,
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly shadow = new Mesh(this.shadowGeometry, this.shadowMaterial);

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene
  ) {
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    scene.background = this.backdrop;
    if (this.fill) scene.add(this.fill);

    const key = new DirectionalLight(0xffffff, KEY_INTENSITY);
    key.position.set(-0.7, 1.1, 1.3);
    scene.add(key);

    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = -1;
    scene.add(this.shadow);
  }

  /**
   * Build the room: drawn once into a small pre-filtered map that every
   * material reflects. Called after the first frame is on screen.
   */
  furnish(): void {
    if (this.room) return;
    const pmrem = new PMREMGenerator(this.renderer);
    const roomScene = new RoomEnvironment();
    this.room = pmrem.fromScene(roomScene, 0.04).texture;
    pmrem.dispose();
    roomScene.traverse((o) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
      (mesh.material as MeshBasicMaterial | undefined)?.dispose?.();
    });
    this.scene.environment = this.room;
    this.fill?.removeFromParent();
    this.fill = null;
  }

  /** Put the floor shadow under the box the scene shows. */
  place(min: Vector3, max: Vector3): void {
    const width = max.x - min.x;
    const depth = max.z - min.z;
    this.shadow.position.set((min.x + max.x) / 2, min.y - 1, (min.z + max.z) / 2);
    this.shadow.scale.set(width * 1.25, Math.max(depth * 1.6, width * 0.32), 1);
  }

  /** White sheet for the picture that goes on paper; the gradient on screen. */
  paper(on: boolean): void {
    this.scene.background = on ? PAPER : this.backdrop;
  }

  dispose(): void {
    this.shadow.removeFromParent();
    this.scene.environment = null;
    this.scene.background = null;
    this.room?.dispose();
    this.fill?.removeFromParent();
    this.backdrop.dispose();
    this.shadowMap.dispose();
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
  }
}
