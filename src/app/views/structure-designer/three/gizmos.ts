/**
 * structure-designer gizmos — the dimension lines and the drag handles of the
 * 3D view. A handle keeps the same size on screen at any zoom; dragging it
 * moves along its axis only, and gives back the wanted value of its
 * dimension. The labels themselves are HTML, placed by the host from
 * `labels()`.
 *
 * A dimension LINE (the guide) is in the scene only while its handle is under
 * the pointer or dragged, or its label is pointed at or typed in: one guide
 * at most, from one end of the measured size to the other. Nothing of it
 * stands in the structure while the user is only looking.
 */

import {
  BufferGeometry,
  Camera,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  SphereGeometry,
  Vector3,
} from 'three';
import { Dim } from '../../../shared/structure-model';

export interface DragValue {
  id: string;
  value: number;
}

interface Handle {
  dim: Dim;
  group: Group;
}

interface DragState {
  id: string;
  origin: Vector3;
  axis: Vector3;
  t0: number;
  start: number;
  gain: number;
  min: number;
  max: number;
  step: number;
  last: number;
}

/** Radius of a handle's ball on screen, CSS px. */
const HANDLE_PX = 10;
/** Half the tick across each end of a guide, mm. */
const GUIDE_TICK = 45;
const UP = new Vector3(0, 1, 0);

export class Gizmos {
  readonly root = new Group();
  private readonly sphere = new SphereGeometry(1, 20, 14);
  private readonly cone = new ConeGeometry(0.62, 1.5, 16);
  private readonly fill: MeshBasicMaterial;
  private readonly rim = new MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true });
  private readonly lineMaterial: LineBasicMaterial;
  private lines: LineSegments | null = null;
  /** The dimension whose label the user points at or types in. */
  private active: string | null = null;
  private handles: Handle[] = [];
  private dims: Dim[] = [];
  private state: DragState | null = null;
  private hovered: string | null = null;

  constructor(colour: string) {
    this.fill = new MeshBasicMaterial({ color: colour, depthTest: false, transparent: true });
    this.lineMaterial = new LineBasicMaterial({ color: colour, transparent: true, opacity: 0.8, depthTest: false });
  }

  get dragging(): boolean {
    return this.state !== null;
  }

  setDims(dims: Dim[]): void {
    this.dims = dims;
    this.clear();
    if (this.hovered && !dims.some((d) => d.id === this.hovered)) this.hovered = null;
    if (this.active && !dims.some((d) => d.id === this.active)) this.active = null;
    this.syncGuide();
    for (const dim of dims) {
      if (!dim.handle) continue;
      const group = new Group();
      const rim = new Mesh(this.sphere, this.rim);
      rim.scale.setScalar(1.28);
      rim.renderOrder = 9;
      const ball = new Mesh(this.sphere, this.fill);
      ball.renderOrder = 10;
      group.add(rim, ball);
      const axis = new Vector3(...dim.handle.axis);
      for (const sign of [1, -1]) {
        const arrow = new Mesh(this.cone, this.fill);
        arrow.renderOrder = 10;
        arrow.quaternion.setFromUnitVectors(UP, axis.clone().multiplyScalar(sign));
        arrow.position.copy(axis).multiplyScalar(sign * 2.4);
        group.add(arrow);
      }
      group.position.set(...dim.handle.at);
      this.root.add(group);
      this.handles.push({ dim, group });
    }
  }

  /** The dimension whose guide is wanted now: the one dragged, else the one under the pointer, else the one whose label is in use. */
  get guide(): string | null {
    return this.state?.id ?? this.hovered ?? this.active;
  }

  /** The label of a dimension is pointed at or typed in (null = none). True when the picture changed. */
  setActive(id: string | null): boolean {
    this.active = id;
    return this.syncGuide();
  }

  /** The pointer left the view: nothing is hovered. True when the picture changed. */
  unhover(): boolean {
    if (!this.hovered) return false;
    this.hovered = null;
    this.syncGuide();
    return true;
  }

  /** Put the one wanted guide in the scene and take any other out. True when something changed. */
  private syncGuide(): boolean {
    const dim = this.dims.find((d) => d.id === this.guide) ?? null;
    const a = dim ? new Vector3(...dim.a) : null;
    const b = dim ? new Vector3(...dim.b) : null;
    const wanted = dim && a && b && a.distanceTo(b) >= 1 ? dim.id : null;
    if (!wanted && !this.lines) return false;
    if (this.lines) {
      this.lines.geometry.dispose();
      this.lines.removeFromParent();
      this.lines = null;
    }
    if (!wanted || !a || !b) return true;
    // From one end of the size to the other, with a short tick across each end.
    const along = b.clone().sub(a).normalize();
    const tick = Math.abs(along.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3().crossVectors(along, UP).normalize();
    const pts: number[] = [...a.toArray(), ...b.toArray()];
    for (const p of [a, b]) pts.push(...p.clone().addScaledVector(tick, -GUIDE_TICK).toArray(), ...p.clone().addScaledVector(tick, GUIDE_TICK).toArray());
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.lines = new LineSegments(g, this.lineMaterial);
    this.lines.name = 'guide';
    this.lines.userData['dim'] = wanted;
    this.lines.renderOrder = 8;
    this.root.add(this.lines);
    return true;
  }

  /** Keep every handle the same size on screen, whatever the zoom and the height of the view. */
  face(camera: Camera, viewHeightPx = 720): void {
    const fov = (camera as PerspectiveCamera).fov ?? 32;
    const perPx = (2 * Math.tan((fov * Math.PI) / 360)) / Math.max(120, viewHeightPx);
    for (const h of this.handles) {
      const k = camera.position.distanceTo(h.group.position) * perPx * HANDLE_PX * (h.dim.id === this.hovered || h.dim.id === this.state?.id ? 1.3 : 1);
      h.group.scale.setScalar(k);
    }
  }

  private near(ray: Raycaster, reach: number): Handle | null {
    let best: Handle | null = null;
    let bestD = Infinity;
    for (const h of this.handles) {
      const d = ray.ray.distanceToPoint(h.group.position);
      // The arrows reach 3.1 radii along the axis: a generous round target.
      if (d < h.group.scale.x * reach && d < bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  }

  hover(ray: Raycaster): boolean | null {
    const id = this.near(ray, 2.4)?.dim.id ?? null;
    if (id === this.hovered) return id ? true : null;
    this.hovered = id;
    this.syncGuide();
    return !!id;
  }

  grab(ray: Raycaster, touch: boolean): DragValue | null {
    const h = this.near(ray, touch ? 4.2 : 2.6);
    if (!h || !h.dim.handle) return null;
    const origin = new Vector3(...h.dim.handle.at);
    const axis = new Vector3(...h.dim.handle.axis).normalize();
    const t0 = along(ray, origin, axis);
    if (t0 === null) return null;
    this.state = {
      id: h.dim.id,
      origin,
      axis,
      t0,
      start: h.dim.value,
      gain: h.dim.handle.gain,
      min: h.dim.min,
      max: h.dim.max,
      step: h.dim.unit === 'deg' ? 0.5 : 10,
      last: h.dim.value,
    };
    this.syncGuide();
    return { id: h.dim.id, value: h.dim.value };
  }

  drag(ray: Raycaster): DragValue | null {
    const s = this.state;
    if (!s) return null;
    const t = along(ray, s.origin, s.axis);
    if (t === null) return null;
    const raw = s.start + (t - s.t0) * s.gain;
    const value = Math.min(s.max, Math.max(s.min, Math.round(raw / s.step) * s.step));
    if (value === s.last) return null;
    s.last = value;
    return { id: s.id, value };
  }

  release(): DragValue | null {
    const s = this.state;
    this.state = null;
    this.syncGuide();
    return s ? { id: s.id, value: s.last } : null;
  }

  /** Where each dimension's label belongs, in CSS px of the canvas. */
  labels(camera: Camera, width: number, height: number): { id: string; x: number; y: number; visible: boolean }[] {
    const p = new Vector3();
    return this.dims.map((d) => {
      p.set((d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2, (d.a[2] + d.b[2]) / 2).project(camera);
      return { id: d.id, x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height, visible: p.z > -1 && p.z < 1 };
    });
  }

  private clear(): void {
    if (this.lines) {
      this.lines.geometry.dispose();
      this.lines.removeFromParent();
      this.lines = null;
    }
    for (const h of this.handles) h.group.removeFromParent();
    this.handles = [];
  }

  dispose(): void {
    this.clear();
    this.sphere.dispose();
    this.cone.dispose();
    this.fill.dispose();
    this.rim.dispose();
    this.lineMaterial.dispose();
  }
}

/** Distance along the axis line of the point closest to the pointer's ray (null when looking straight down the axis). */
function along(ray: Raycaster, origin: Vector3, axis: Vector3): number | null {
  const d = ray.ray.direction;
  const w = origin.clone().sub(ray.ray.origin);
  const b = axis.dot(d);
  const denom = 1 - b * b;
  if (denom < 0.02) return null;
  return (b * d.dot(w) - axis.dot(w)) / denom;
}
