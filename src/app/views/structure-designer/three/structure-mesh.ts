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
 * Hardware and the opening sign are placed on the EDGES of the sash's real
 * outline (its hinge stile, lock stile, head, sill), never on its bounding
 * box: under a sloped roof a sash has a raked head, and nothing may be drawn
 * outside it. A piece that would not fit inside its sash is left out.
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

/**
 * A convex anticlockwise outline moved inward by d on every edge. A side of a few millimetres (two
 * corners of a roof that all but fall together) has no direction worth the name: its corner is dropped.
 */
export function insetOutline(points: Vec2[], d: number): Vec2[] {
  const kept = points.filter((p, i) => {
    const q = points[(i + 1) % points.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]) > 8;
  });
  const outline = kept.length >= 3 ? kept : points;
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
  const normals = outline.map((_, i) => inward(i));
  return outline.map((p, i) => {
    const n0 = normals[(i + n - 1) % n];
    const n1 = normals[i];
    const k = safe / Math.max(0.2, 1 + n0[0] * n1[0] + n0[1] * n1[1]);
    const moved: Vec2 = [p[0] + (n0[0] + n1[0]) * k, p[1] + (n0[1] + n1[1]) * k];
    // Beside a very pointed corner a short side has no room for the whole inset: a corner that would pass
    // another side of the outline is brought back onto it. Nothing inset ever leaves its outline.
    outline.forEach((a, j) => {
      const inside = (moved[0] - a[0]) * normals[j][0] + (moved[1] - a[1]) * normals[j][1];
      if (inside < 0) {
        moved[0] -= normals[j][0] * inside;
        moved[1] -= normals[j][1] * inside;
      }
    });
    return moved;
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

/** A knuckle stays inside the section of the bars it closes: nothing stands out past a ridge end or a corner. */
const HUB_RADIUS: Readonly<Record<string, number>> = { crown: 60, ridge_end: 40, node: 44 };
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
    profile.knuckle(hub.at, HUB_RADIUS[hub.role] ?? 44, owner);
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

/** What one face draws for the way it opens, in the face's own (u, v) mm: for the checks that nothing leaves the sash. */
export interface OpeningTrace {
  faceId: string;
  /** The outer outline of what opens (the sash, or the two leaves together). */
  sash: Vec2[];
  /** The glass of the sash: the opening sign is drawn on it. */
  pane: Vec2[];
  /** The footprint of each piece of hardware (handle plate, lever, hinge, stay, pull). */
  parts: Vec2[][];
  /** The lines of the opening sign. */
  lines: [Vec2, Vec2][];
}

/** The hardware and opening signs of every face that opens, exactly as buildStructure draws them. */
export function traceOpenings(structure: Structure): OpeningTrace[] {
  const soups: Soups = { profile: new Soup(), glass: new Soup(), panel: new Soup(), gasket: new Soup(), metal: new Soup(), hidden: new Soup(), lines: [] };
  const out: OpeningTrace[] = [];
  for (const face of structure.faces) {
    const trace: OpeningTrace = { faceId: face.id, sash: [], pane: [], parts: [], lines: [] };
    addFace(face, soups, trace);
    if (trace.sash.length) out.push(trace);
  }
  return out;
}

/** True when p is inside a convex anticlockwise outline, or no more than tol outside it. */
export function insideOutline(outline: Vec2[], p: Vec2, tol = 0): boolean {
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) continue;
    // Distance outside this edge (the inside is on the left of a → b).
    if (((b[1] - a[1]) * (p[0] - a[0]) - (b[0] - a[0]) * (p[1] - a[1])) / l > tol) return false;
  }
  return outline.length >= 3;
}

/** One side of a sash: from a to b going anticlockwise, its unit direction and its unit outward normal. */
interface SashEdge {
  a: Vec2;
  b: Vec2;
  length: number;
  dir: Vec2;
  out: Vec2;
}

function sashEdges(outline: Vec2[]): SashEdge[] {
  return outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dir: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    return { a, b, length, dir, out: [dir[1], -dir[0]] };
  });
}

/** The side that looks most the given way (hinge stile, lock stile, head, sill); null when the sash has no such side. */
function sideLooking(edges: SashEdge[], way: Vec2, not?: SashEdge | null): SashEdge | null {
  let best: SashEdge | null = null;
  let bestDot = 0.5;
  for (const e of edges) {
    const d = e.out[0] * way[0] + e.out[1] * way[1];
    if (e === not || e.length < 200 || d < bestDot) continue;
    best = e;
    bestDot = d;
  }
  return best;
}

function addFace(face: Face, s: Soups, trace?: OpeningTrace): void {
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
  /** The outlines nothing of this face's opening may leave: set once the sash (or the leaves) is known. */
  let sash: Vec2[] = [];
  let pane: Vec2[] = [];
  const within = (sashOutline: Vec2[], paneOutline: Vec2[]): void => {
    sash = sashOutline;
    pane = paneOutline;
    if (trace) {
      trace.sash = sashOutline;
      trace.pane = paneOutline;
    }
  };
  /** A piece of hardware a → b; left out (false) when its footprint would not lie on the sash. */
  const part = (a: Vec2, b: Vec2, width: number, depth: number, lift: number): boolean => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1) return false;
    const y: Vec2 = [(-(b[1] - a[1]) / l) * (width / 2), ((b[0] - a[0]) / l) * (width / 2)];
    const corners: Vec2[] = [[a[0] + y[0], a[1] + y[1]], [b[0] + y[0], b[1] + y[1]], [b[0] - y[0], b[1] - y[1]], [a[0] - y[0], a[1] - y[1]]];
    if (!corners.every((c) => insideOutline(sash, c, 0.5))) return false;
    s.metal.box(at(a, lift), at(b, lift), width, depth, n, owner);
    trace?.parts.push(corners);
    return true;
  };
  /** A line of the opening sign; left out when an end would be off the glass. */
  const seg = (a: Vec2, b: Vec2, lift = 16): void => {
    if (!insideOutline(pane, a, 0.5) || !insideOutline(pane, b, 0.5)) return;
    s.lines.push(...at(a, lift), ...at(b, lift));
    trace?.lines.push([a, b]);
  };
  /** A point of a side: t mm from its start along it, off mm outward of it. */
  const on = (e: SashEdge, t: number, off = 0): Vec2 => [e.a[0] + e.dir[0] * t + e.out[0] * off, e.a[1] + e.dir[1] * t + e.out[1] * off];
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
      const leaves: Vec2[] = [[a, c], [b, c], [b, d], [a, d]];
      within(leaves, leaves);
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

  // The opening sign of a workshop drawing, the hinges and a lever handle: on the sides of the sash as it really is.
  const paneOutline = insetOutline(face.outline, edge);
  within(insetOutline(face.outline, edge - w + 6), paneOutline);
  const edges = sashEdges(paneOutline);
  const stile = w - 6;
  const [u0, u1] = box(paneOutline);
  /** The sign: from the middle of the hinged side to every corner that is not on it. */
  const sign = (hinged: SashEdge): void => {
    const apex = on(hinged, hinged.length / 2);
    for (const p of paneOutline) if (p !== hinged.a && p !== hinged.b) seg(p, apex);
  };
  /** Hinges (or stays) on a side, set in from its ends. */
  const hang = (side: SashEdge, inset: number, half: number, middle: boolean): void => {
    const m = Math.min(inset, side.length * 0.25);
    const h = Math.min(half, side.length * 0.12);
    for (const t of middle ? [m, side.length / 2, side.length - m] : [m, side.length - m]) part(on(side, t - h, stile - 12), on(side, t + h, stile - 12), 16, 16, 40);
  };

  if (key === 'top-hung') {
    const head = sideLooking(edges, [0, 1]);
    if (!head) return;
    sign(head);
    hang(head, 120, 45, false);
    // The handle in the middle of the bottom rail, its lever along the rail.
    const sill = sideLooking(edges, [0, -1], head);
    if (!sill) return;
    const t = sill.length / 2;
    const reach = Math.min(60, sill.length * 0.2);
    part(on(sill, t - reach, stile / 2), on(sill, t + reach, stile / 2), 24, 8, 42);
    part(on(sill, t - reach / 5, stile / 2), on(sill, t + reach * 1.6, stile / 2), 15, 12, 52);
    return;
  }
  // Hinged on the left as seen from outside; the sign points at the hinges.
  const door = key === 'door';
  const hinged = sideLooking(edges, [-1, 0]);
  if (!hinged) return;
  sign(hinged);
  hang(hinged, door ? 200 : 160, 50, door);
  // The handle on the stile across from the hinges: a plate along the stile, a lever towards the hinges.
  const lock = sideLooking(edges, [1, 0], hinged);
  if (!lock) return;
  // The lock stile runs anticlockwise, so upward: a door handle is a metre above its foot.
  const t = door ? Math.min(1000, lock.length / 2) : lock.length / 2;
  const plate = Math.min(door ? 105 : 62, lock.length * 0.3);
  part(on(lock, t - plate, stile / 2), on(lock, t + plate, stile / 2), door ? 30 : 24, 8, 42);
  const from = on(lock, t + Math.min(24, plate / 2), stile / 2);
  for (const reach of [door ? 150 : 115, 80, 50]) {
    const length = Math.min(reach, (u1 - u0) * 0.3);
    if (part(from, [from[0] - lock.out[0] * length, from[1] - lock.out[1] * length], door ? 18 : 15, 12, 52)) break;
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
