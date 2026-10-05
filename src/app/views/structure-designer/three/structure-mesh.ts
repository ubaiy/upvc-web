/**
 * structure-designer mesh — a Structure as three.js objects, in world mm.
 *
 * Everything of one material is ONE merged geometry (bars, glass, panels,
 * gaskets), so a 12 rib dome is a handful of draw calls. Each merged mesh
 * keeps a table from triangle to the face or bar it belongs to, for picking.
 * Bars are boxes of the role's section (bar-sections.ts) with a small chamfer
 * on the long edges, which is what catches the light. A framed face gets its
 * own inner frame; what opens shows how: a sash, hinges and a lever handle, or
 * two lapped sliding leaves. Glass carries its tint a face, as vertex colour.
 * This is the designer's own simple geometry; the mitred window builder of
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
  MeshPhysicalMaterial,
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

/** Triangles of a chamfered bar: eight sides and two eight-cornered ends. */
export const BAR_TRIANGLES = 28;
/** The chamfer on the long edges of a profile bar, mm. */
const CHAMFER = 5;

/** Triangles of one material, with the thing each triangle belongs to. */
class Soup {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];
  readonly owner: PickTarget[] = [];
  /** When set, every triangle added takes this colour (linear RGB). */
  colour: V | null = null;

  tri(a: V, b: V, c: V, owner: PickTarget, n?: V): void {
    const m = n ?? norm(cross(sub(b, a), sub(c, a)));
    this.pos.push(...a, ...b, ...c);
    this.nor.push(...m, ...m, ...m);
    if (this.colour) this.col.push(...this.colour, ...this.colour, ...this.colour);
    this.owner.push(owner);
  }

  quad(a: V, b: V, c: V, d: V, owner: PickTarget): void {
    this.tri(a, b, c, owner);
    this.tri(a, c, d, owner);
  }

  /**
   * A box along a → b: `width` across, `depth` along `out` (made square to
   * the bar). With a chamfer the four long edges are cut at 45°.
   */
  box(a: V, b: V, width: number, depth: number, out: V, owner: PickTarget, chamfer = 0): void {
    const x = norm(sub(b, a));
    let z = sub(out, mul(x, dot(out, x)));
    if (Math.hypot(...z) < 1e-4) z = Math.abs(x[1]) < 0.9 ? cross(x, [0, 1, 0]) : cross(x, [1, 0, 0]);
    z = norm(z);
    const y = cross(z, x);
    const k = Math.min(chamfer, width * 0.2, depth * 0.2);
    if (k > 0) {
      const hw = width / 2;
      const hd = depth / 2;
      // Round the section, +y first along the outside (+z).
      const section: [number, number][] = [
        [-hw + k, hd], [hw - k, hd], [hw, hd - k], [hw, -hd + k], [hw - k, -hd], [-hw + k, -hd], [-hw, -hd + k], [-hw, hd - k],
      ];
      const A = section.map(([sy, sz]) => add(a, add(mul(y, sy), mul(z, sz))));
      const B = section.map(([sy, sz]) => add(b, add(mul(y, sy), mul(z, sz))));
      for (let i = 0; i < 8; i++) this.quad(A[i], B[i], B[(i + 1) % 8], A[(i + 1) % 8], owner);
      for (let i = 1; i < 7; i++) {
        this.tri(A[0], A[i], A[i + 1], owner);
        this.tri(B[0], B[i + 1], B[i], owner);
      }
      return;
    }
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
    if (this.col.length) g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
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
  metal: MeshStandardMaterial;
  hidden: MeshBasicMaterial;
  line: LineBasicMaterial;
}

export function createMaterials(): StructureMaterials {
  return {
    // uPVC: a satin body under a thin gloss coat; the room in the reflections lights the chamfers.
    profile: new MeshPhysicalMaterial({ color: '#f4f4f1', roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 0.85 }),
    // Glass: the tint is a vertex colour (a face can have its own); the room is what it reflects.
    glass: new MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.03,
      metalness: 0.35,
      envMapIntensity: 2.1,
      transparent: true,
      opacity: 0.4,
      side: DoubleSide,
      depthWrite: false,
    }),
    panel: new MeshStandardMaterial({ color: '#ecece8', roughness: 0.72, metalness: 0, side: DoubleSide, envMapIntensity: 0.4 }),
    gasket: new MeshStandardMaterial({ color: '#1d2124', roughness: 0.9, metalness: 0, side: DoubleSide }),
    // Handles and hinges: brushed metal.
    metal: new MeshStandardMaterial({ color: '#c3c7cc', roughness: 0.3, metalness: 1, envMapIntensity: 1.25 }),
    hidden: new MeshBasicMaterial({ visible: false, side: DoubleSide }),
    line: new LineBasicMaterial({ color: '#27323a', transparent: true, opacity: 0.55 }),
  };
}

export function applyAppearance(m: StructureMaterials, appearance: Structure['appearance']): void {
  m.profile.color.set(appearance.profileColour);
  // A solid panel follows the profile colour, a little duller.
  m.panel.color.set(appearance.profileColour).lerp(new Color('#d9d9d4'), 0.25);
  // The glass tint is in the geometry: buildStructure gives every pane its own.
}

/** The tint a face's glass is drawn with: its own, or the one of the structure. */
export function glassTintOf(structure: Structure, face: Face): string {
  return face.glassTint ?? structure.appearance.glassTint;
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
const LEAF_W = 40;

export function buildStructure(structure: Structure, m: StructureMaterials): StructureObject {
  const profile = new Soup();
  const glass = new Soup();
  const panel = new Soup();
  const gasket = new Soup();
  const metal = new Soup();
  const hidden = new Soup();
  const tints = new Map<string, V>();
  const tint = (hex: string): V => {
    let c = tints.get(hex);
    if (!c) {
      const colour = new Color(hex);
      c = [colour.r, colour.g, colour.b];
      tints.set(hex, c);
    }
    return c;
  };
  const lines: number[] = [];
  const faces = new Map(structure.faces.map((f) => [f.id, f]));

  for (const joint of structure.joints) {
    const section = barSection(joint.role);
    let out: V = [0, 0, 0];
    for (const id of joint.faceIds) {
      const f = faces.get(id);
      if (f) out = add(out, faceNormal(f));
    }
    profile.box(joint.a, joint.b, section.widthMm, section.depthMm, out, { kind: 'bar', id: joint.id }, CHAMFER);
  }
  // A knuckle only where bars meet out of square (dome nodes, hips): it closes the open wedge.
  for (const hub of structure.hubs) {
    const owner: PickTarget = { kind: 'bar', id: hub.jointIds[0] ?? '' };
    profile.knuckle(hub.at, hub.role === 'node' ? 44 : 78, owner);
  }

  for (const face of structure.faces) {
    glass.colour = tint(glassTintOf(structure, face));
    addFace(face, { profile, glass, panel, gasket, metal, hidden, lines });
  }

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
  put(metal, m.metal, true);
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
  metal: Soup;
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
    for (let i = 0; i < centre.length; i++) s.profile.box(at(centre[i], lift), at(centre[(i + 1) % centre.length], lift), width, depth, n, owner, CHAMFER);
  };
  /** A pane `edge` inside an outline, with the dark gasket line round it. */
  const glaze = (outline: Vec2[], edge: number, lift: number): void => {
    ring(s.gasket, insetOutline(outline, edge - 7), insetOutline(outline, edge + 9), lift + 3);
    fan(s.glass, insetOutline(outline, edge), lift);
  };
  const part = (a: Vec2, b: Vec2, width: number, depth: number, lift: number): void => s.metal.box(at(a, lift), at(b, lift), width, depth, n, owner);
  const seg = (a: Vec2, b: Vec2, lift = 16): void => void s.lines.push(...at(a, lift), ...at(b, lift));
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
    // Held by the bars themselves: the gasket shows just inside them.
    ring(s.gasket, insetOutline(face.outline, JOINT_HALF - 8), insetOutline(face.outline, JOINT_HALF + 10), 3);
    fan(s.glass, insetOutline(face.outline, JOINT_HALF - 4), 0);
    return;
  }

  // A framed unit: its own frame inside the bars.
  let edge = JOINT_HALF;
  frame(insetOutline(face.outline, edge + FRAME_W / 2), FRAME_W, 62, 0);
  edge += FRAME_W;
  const box = (outline: Vec2[]): [number, number, number, number] => {
    const us = outline.map((p) => p[0]);
    const vs = outline.map((p) => p[1]);
    return [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  };

  if (key === 'sliding') {
    const [a, b, c, d] = box(insetOutline(face.outline, edge));
    const square = face.outline.length === 4 && insetOutline(face.outline, edge).every((p) => Math.min(Math.abs(p[0] - a), Math.abs(p[0] - b)) < 1 && Math.min(Math.abs(p[1] - c), Math.abs(p[1] - d)) < 1);
    if (square && b - a > 6 * LEAF_W) {
      // Two leaves on two tracks, lapped at the meeting stiles; the outside leaf is the left one.
      const mid = (a + b) / 2;
      const lap = LEAF_W / 2;
      const vm = (c + d) / 2;
      const leaf = (u0: number, u1: number, lift: number, pull: number, towards: 1 | -1): void => {
        const outline: Vec2[] = [[u0, c], [u1, c], [u1, d], [u0, d]];
        frame(insetOutline(outline, LEAF_W / 2), LEAF_W, 26, lift);
        glaze(outline, LEAF_W, lift);
        // A pull on the stile by the jamb, on the room side of the inside leaf.
        const out = lift > 0 ? lift + 17 : lift - 17;
        part([pull, vm - 90], [pull, vm + 90], 14, 8, out);
        // The way it travels.
        const from = towards > 0 ? u0 + LEAF_W + 70 : u1 - LEAF_W - 70;
        const tip = from + towards * Math.min(260, (u1 - u0) / 3);
        seg([from, vm], [tip, vm], lift + 6);
        seg([tip, vm], [tip - towards * 60, vm + 36], lift + 6);
        seg([tip, vm], [tip - towards * 60, vm - 36], lift + 6);
      };
      leaf(a, mid + lap, 16, a + LEAF_W / 2, 1);
      leaf(mid - lap, b, -14, b - LEAF_W / 2, -1);
      return;
    }
  }

  // Fixed glass, or a sash that opens (a sliding panel that is not a plain rectangle is drawn fixed).
  const opens = key === 'casement' || key === 'door' || key === 'top-hung';
  const w = key === 'door' ? SASH_W + 26 : SASH_W;
  if (opens) {
    frame(insetOutline(face.outline, edge + w / 2 - 6), w, 56, 10);
    edge += w - 6;
  }
  glaze(face.outline, edge, opens ? 10 : 0);
  if (!opens) return;

  // The opening sign of a workshop drawing, the hinges and a lever handle, on the pane's bounding box.
  const [u0, u1, v0, v1] = box(insetOutline(face.outline, edge));
  const stile = w - 6;
  if (key === 'top-hung') {
    seg([u0, v0], [(u0 + u1) / 2, v1]);
    seg([u1, v0], [(u0 + u1) / 2, v1]);
    const um = (u0 + u1) / 2;
    const hv = v0 - stile / 2;
    part([um - 60, hv], [um + 60, hv], 24, 8, 42);
    part([um - 12, hv], [um + 100, hv], 15, 12, 52);
    for (const u of [u0 + 120, u1 - 120]) part([u - 45, v1 + stile], [u + 45, v1 + stile], 16, 16, 40);
    return;
  }
  // Hinged on the left as seen from outside; the sign points at the hinges.
  seg([u1, v0], [u0, (v0 + v1) / 2]);
  seg([u1, v1], [u0, (v0 + v1) / 2]);
  const door = key === 'door';
  const hv = door ? Math.min(v0 + 1000, (v0 + v1) / 2) : (v0 + v1) / 2;
  const hu = u1 + stile / 2;
  part([hu, hv - (door ? 105 : 62)], [hu, hv + (door ? 105 : 62)], door ? 30 : 24, 8, 42);
  part([hu, hv + 24], [hu - (door ? 150 : 115), hv + 24], door ? 18 : 15, 12, 52);
  const hinges = door ? [v0 + 200, (v0 + v1) / 2, v1 - 200] : [v0 + 160, v1 - 160];
  for (const v of hinges) part([u0 - stile, v - 50], [u0 - stile, v + 50], 16, 16, 40);
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
