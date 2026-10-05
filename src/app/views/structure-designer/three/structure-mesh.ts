/**
 * structure-designer mesh — a Structure as three.js objects, in world mm.
 *
 * Everything of one material is ONE merged geometry (bars, glass, panels,
 * gaskets), so a 12 rib dome is a handful of draw calls. Each merged mesh
 * keeps a table from triangle to the face or bar it belongs to, for picking.
 * Bars are plain boxes of the role's section (bar-sections.ts); a framed face
 * gets its own inner frame, and a sash and handle when it opens. This is the
 * designer's own simple geometry; the mitred window builder of
 * shared/design-3d takes over the inside of a face on a later card.
 */

import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';
import { barSection, Face, faceNormal, fillKey, Structure, Vec2, Vec3 } from '../../../shared/structure-model';

export interface PickTarget {
  kind: 'face' | 'bar';
  id: string;
}

type V = [number, number, number];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Triangles of one material, with the thing each triangle belongs to. */
class Soup {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly owner: PickTarget[] = [];

  tri(a: V, b: V, c: V, owner: PickTarget, n?: V): void {
    const m = n ?? norm(cross(sub(b, a), sub(c, a)));
    this.pos.push(...a, ...b, ...c);
    this.nor.push(...m, ...m, ...m);
    this.owner.push(owner);
  }

  quad(a: V, b: V, c: V, d: V, owner: PickTarget): void {
    this.tri(a, b, c, owner);
    this.tri(a, c, d, owner);
  }

  /** A box along a → b: `width` across, `depth` along `out` (made square to the bar). */
  box(a: V, b: V, width: number, depth: number, out: V, owner: PickTarget): void {
    const x = norm(sub(b, a));
    let z = sub(out, mul(x, dot(out, x)));
    if (Math.hypot(...z) < 1e-4) z = Math.abs(x[1]) < 0.9 ? cross(x, [0, 1, 0]) : cross(x, [1, 0, 0]);
    z = norm(z);
    const y = cross(z, x);
    const c = (p: V, sy: number, sz: number): V => add(p, add(mul(y, (sy * width) / 2), mul(z, (sz * depth) / 2)));
    const a0 = c(a, -1, -1), a1 = c(a, 1, -1), a2 = c(a, 1, 1), a3 = c(a, -1, 1);
    const b0 = c(b, -1, -1), b1 = c(b, 1, -1), b2 = c(b, 1, 1), b3 = c(b, -1, 1);
    this.quad(a3, b3, b2, a2, owner); // outside
    this.quad(a1, b1, b0, a0, owner); // inside
    this.quad(a2, b2, b1, a1, owner);
    this.quad(a0, b0, b3, a3, owner);
    this.quad(a0, a3, a2, a1, owner);
    this.quad(b1, b2, b3, b0, owner);
  }

  /** A small eight-sided knuckle where bars meet. */
  knuckle(at: V, r: number, owner: PickTarget): void {
    const px: V[] = [[r, 0, 0], [0, 0, r], [-r, 0, 0], [0, 0, -r]];
    for (let i = 0; i < 4; i++) {
      const p = add(at, px[i]);
      const q = add(at, px[(i + 1) % 4]);
      this.tri(add(at, [0, r, 0]), q, p, owner);
      this.tri(add(at, [0, -r, 0]), p, q, owner);
    }
  }

  mesh(material: Material): Mesh | null {
    if (!this.pos.length) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    const mesh = new Mesh(g, material);
    mesh.userData['owner'] = this.owner;
    return mesh;
  }
}

/** A convex anticlockwise outline moved inward by d on every edge. */
export function insetOutline(outline: Vec2[], d: number): Vec2[] {
  const n = outline.length;
  let area = 0;
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const p = outline[i];
    const q = outline[(i + 1) % n];
    area += p[0] * q[1] - q[0] * p[1];
    perimeter += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  // Never past 45 % of the way to the middle (a thin triangle would turn inside out).
  const safe = Math.min(d, (0.45 * Math.abs(area)) / (perimeter || 1));
  const inward = (i: number): Vec2 => {
    const p = outline[i];
    const q = outline[(i + 1) % n];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
  };
  return outline.map((p, i) => {
    const n0 = inward((i + n - 1) % n);
    const n1 = inward(i);
    const k = safe / Math.max(0.2, 1 + n0[0] * n1[0] + n0[1] * n1[1]);
    return [p[0] + (n0[0] + n1[0]) * k, p[1] + (n0[1] + n1[1]) * k];
  });
}

export interface StructureMaterials {
  profile: MeshStandardMaterial;
  glass: MeshStandardMaterial;
  panel: MeshStandardMaterial;
  gasket: MeshStandardMaterial;
  hidden: MeshBasicMaterial;
  line: LineBasicMaterial;
}

export function createMaterials(): StructureMaterials {
  return {
    // uPVC: white, a slight gloss; the environment gives the edge catch.
    profile: new MeshStandardMaterial({ color: '#f4f4f1', roughness: 0.38, metalness: 0.02, envMapIntensity: 0.75 }),
    glass: new MeshStandardMaterial({
      color: '#9fc4cf',
      roughness: 0.04,
      metalness: 0.25,
      envMapIntensity: 1.6,
      transparent: true,
      opacity: 0.34,
      side: DoubleSide,
      depthWrite: false,
    }),
    panel: new MeshStandardMaterial({ color: '#ecece8', roughness: 0.72, metalness: 0, side: DoubleSide, envMapIntensity: 0.4 }),
    gasket: new MeshStandardMaterial({ color: '#1d2124', roughness: 0.9, metalness: 0, side: DoubleSide }),
    hidden: new MeshBasicMaterial({ visible: false, side: DoubleSide }),
    line: new LineBasicMaterial({ color: '#27323a', transparent: true, opacity: 0.55 }),
  };
}

export function applyAppearance(m: StructureMaterials, appearance: Structure['appearance']): void {
  m.profile.color.set(appearance.profileColour);
  // A solid panel follows the profile colour, a little duller.
  m.panel.color.set(appearance.profileColour).lerp(new Color('#d9d9d4'), 0.25);
  m.glass.color.set(appearance.glassTint);
}

export function disposeMaterials(m: StructureMaterials): void {
  Object.values(m).forEach((mat) => (mat as Material).dispose());
}

export interface StructureObject {
  root: Group;
  /** Meshes to ray-cast; each has userData.owner, one PickTarget per triangle. */
  pickables: Mesh[];
}

const FRAME_W = 46;
const SASH_W = 42;
const JOINT_HALF = 26;

export function buildStructure(structure: Structure, m: StructureMaterials): StructureObject {
  const profile = new Soup();
  const glass = new Soup();
  const panel = new Soup();
  const gasket = new Soup();
  const hidden = new Soup();
  const lines: number[] = [];
  const faces = new Map(structure.faces.map((f) => [f.id, f]));

  for (const joint of structure.joints) {
    const section = barSection(joint.role);
    let out: V = [0, 0, 0];
    for (const id of joint.faceIds) {
      const f = faces.get(id);
      if (f) out = add(out, faceNormal(f));
    }
    profile.box(joint.a, joint.b, section.widthMm, section.depthMm, out, { kind: 'bar', id: joint.id });
  }
  // A knuckle only where bars meet out of square (dome nodes, hips): it closes the open wedge.
  for (const hub of structure.hubs) {
    const owner: PickTarget = { kind: 'bar', id: hub.jointIds[0] ?? '' };
    profile.knuckle(hub.at, hub.role === 'node' ? 44 : 78, owner);
  }

  for (const face of structure.faces) addFace(face, { profile, glass, panel, gasket, hidden, lines });

  const root = new Group();
  const pickables: Mesh[] = [];
  const put = (soup: Soup, material: Material, cast: boolean, order = 0): void => {
    const mesh = soup.mesh(material);
    if (!mesh) return;
    mesh.castShadow = cast;
    mesh.receiveShadow = cast;
    mesh.renderOrder = order;
    root.add(mesh);
    pickables.push(mesh);
  };
  put(profile, m.profile, true);
  put(panel, m.panel, true);
  put(gasket, m.gasket, false);
  put(hidden, m.hidden, false);
  put(glass, m.glass, false, 2);
  if (lines.length) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(lines, 3));
    root.add(new LineSegments(g, m.line));
  }
  return { root, pickables };
}

interface Soups {
  profile: Soup;
  glass: Soup;
  panel: Soup;
  gasket: Soup;
  hidden: Soup;
  lines: number[];
}

function addFace(face: Face, s: Soups): void {
  const { origin, u, v } = face.plane;
  const n = faceNormal(face);
  const owner: PickTarget = { kind: 'face', id: face.id };
  const at = (p: Vec2, lift = 0): V => add(origin, add(add(mul(u, p[0]), mul(v, p[1])), mul(n, lift)));
  const fan = (soup: Soup, outline: Vec2[], lift: number): void => {
    for (let i = 1; i < outline.length - 1; i++) soup.tri(at(outline[0], lift), at(outline[i], lift), at(outline[i + 1], lift), owner, n);
  };
  const ring = (soup: Soup, outer: Vec2[], inner: Vec2[], lift: number): void => {
    for (let i = 0; i < outer.length; i++) {
      const j = (i + 1) % outer.length;
      soup.quad(at(outer[i], lift), at(outer[j], lift), at(inner[j], lift), at(inner[i], lift), owner);
    }
  };
  const frame = (centre: Vec2[], width: number, depth: number, lift: number): void => {
    for (let i = 0; i < centre.length; i++) s.profile.box(at(centre[i], lift), at(centre[(i + 1) % centre.length], lift), width, depth, n, owner);
  };
  const key = fillKey(face);
  const fill = face.fill.kind;

  if (fill === 'open') {
    fan(s.hidden, face.outline, 0);
    return;
  }
  if (fill === 'panel') {
    fan(s.panel, insetOutline(face.outline, JOINT_HALF - 6), 0);
    return;
  }
  if (fill === 'glass') {
    ring(s.gasket, insetOutline(face.outline, JOINT_HALF - 8), insetOutline(face.outline, JOINT_HALF + 4), 3);
    fan(s.glass, insetOutline(face.outline, JOINT_HALF - 4), 0);
    return;
  }

  // A framed unit: its own frame inside the bars, then a sash when it opens.
  let edge = JOINT_HALF;
  frame(insetOutline(face.outline, edge + FRAME_W / 2), FRAME_W, 62, 0);
  edge += FRAME_W;
  if (key !== 'fixed') {
    const w = key === 'door' ? SASH_W + 26 : SASH_W;
    frame(insetOutline(face.outline, edge + w / 2 - 6), w, 56, 10);
    edge += w - 6;
  }
  const pane = insetOutline(face.outline, edge);
  ring(s.gasket, insetOutline(face.outline, edge - 5), insetOutline(face.outline, edge + 7), key === 'fixed' ? 3 : 13);
  fan(s.glass, pane, key === 'fixed' ? 0 : 10);
  if (key === 'fixed') return;

  // The opening sign of a workshop drawing, and a handle, on the pane's bounding box.
  const us = pane.map((p) => p[0]);
  const vs = pane.map((p) => p[1]);
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const seg = (a: Vec2, b: Vec2): void => void s.lines.push(...at(a, 16), ...at(b, 16));
  if (key === 'top-hung') {
    seg([u0, v0], [(u0 + u1) / 2, v1]);
    seg([u1, v0], [(u0 + u1) / 2, v1]);
    s.gasket.box(at([(u0 + u1) / 2 - 55, v0 - 20], 44), at([(u0 + u1) / 2 + 55, v0 - 20], 44), 16, 26, n, owner);
  } else {
    // Hinged on the left as seen from outside; the sign points at the hinges.
    seg([u1, v0], [u0, (v0 + v1) / 2]);
    seg([u1, v1], [u0, (v0 + v1) / 2]);
    const hv = key === 'door' ? Math.min(v0 + 1000, (v0 + v1) / 2) : (v0 + v1) / 2;
    s.gasket.box(at([u1 + 20, hv - 70], 44), at([u1 + 20, hv + 70], 44), 16, 26, n, owner);
  }
}

export function disposeStructure(object: StructureObject): void {
  object.root.traverse((o) => {
    const g = (o as Mesh).geometry as BufferGeometry | undefined;
    if (g) g.dispose();
  });
  object.root.removeFromParent();
}

/** A translucent skin over the selected faces and bars. */
export function buildHighlight(structure: Structure, faceIds: string[], barId: string | null, colour: string): Group {
  const root = new Group();
  const soup = new Soup();
  const ids = new Set(faceIds);
  for (const face of structure.faces) {
    if (!ids.has(face.id)) continue;
    const { origin, u, v } = face.plane;
    const n = faceNormal(face);
    const outline = insetOutline(face.outline, 8);
    for (const lift of [22, -22]) {
      const at = (p: Vec2): V => add(origin, add(add(mul(u, p[0]), mul(v, p[1])), mul(n, lift)));
      for (let i = 1; i < outline.length - 1; i++) soup.tri(at(outline[0]), at(outline[i]), at(outline[i + 1]), { kind: 'face', id: face.id }, n);
    }
  }
  const joint = barId ? structure.joints.find((j) => j.id === barId) : undefined;
  if (joint) {
    const section = barSection(joint.role);
    let out: V = [0, 0, 0];
    for (const f of structure.faces) if (joint.faceIds.includes(f.id)) out = add(out, faceNormal(f));
    soup.box(joint.a as Vec3, joint.b as Vec3, section.widthMm + 22, section.depthMm + 22, out, { kind: 'bar', id: joint.id });
  }
  const mesh = soup.mesh(
    new MeshBasicMaterial({ color: colour, transparent: true, opacity: joint ? 0.6 : 0.36, side: DoubleSide, depthWrite: false })
  );
  if (mesh) {
    mesh.renderOrder = 5;
    root.add(mesh);
  }
  return root;
}

export function disposeHighlight(group: Group): void {
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) (mesh.material as Material).dispose();
  });
  group.removeFromParent();
}
