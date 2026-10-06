/**
 * structure-model builder — what every template uses to turn 3D polygons into
 * the faces, joints and hubs of a Structure. Pure.
 *
 * A template gives each polygon as 3D corners plus one bar role per edge
 * ('' = this face puts no bar there, another face or an explicit bar owns
 * it). The builder turns the polygon to face outward, works out its plane
 * and (u, v) outline, and keeps ONE joint per distinct edge.
 */

import { DEFAULT_APPEARANCE, Face, FaceFill, Hub, Joint, Params, STRUCTURE_SCHEMA, Structure, Vec2, Vec3 } from './types';
import { add, centroid, cross, dist, dot, edgeKey, EPS, onSegment, pointKey, polygonNormal, scale, sub, unit } from './vec';

export interface TaggedPoly {
  pts: Vec3[];
  /** roles[i] is the bar role of the edge pts[i] → pts[i + 1]. */
  roles: string[];
}

export interface FaceSpec extends TaggedPoly {
  id: string;
  label: string;
  role: 'wall' | 'roof';
  group: string;
  groupLabel: string;
  fill: FaceFill;
  /** The way the face looks, when the one point inside the structure cannot tell (a plan with inward corners). */
  outward?: Vec3;
}

export interface SlicedSpec extends Omit<FaceSpec, 'id' | 'label'> {
  idPrefix: string;
  labelPrefix: string;
  /** Direction along which the polygon is divided (unit). */
  dir: Vec3;
  /** Wanted strip width, mm; the polygon is divided evenly. 0 = one piece. */
  target: number;
  /** Fixed number of pieces instead of a target width. */
  count?: number;
  cutRole: string;
}

/** Number of even parts of `length` closest to `target` wide (at least one). */
export function evenParts(length: number, target: number): number {
  if (!(target > 0) || !(length > 0)) return 1;
  return Math.max(1, Math.round(length / target));
}

/** Keep the part of a convex polygon with dot(p - origin, dir) on one side of t. */
export function clipPoly(poly: TaggedPoly, origin: Vec3, dir: Vec3, t: number, keepBelow: boolean, cutRole: string): TaggedPoly {
  const pts: Vec3[] = [];
  const roles: string[] = [];
  const n = poly.pts.length;
  const side = (p: Vec3): number => (dot(sub(p, origin), dir) - t) * (keepBelow ? 1 : -1);
  for (let i = 0; i < n; i++) {
    const p = poly.pts[i];
    const q = poly.pts[(i + 1) % n];
    const sp = side(p);
    const sq = side(q);
    const pin = sp <= EPS;
    const qin = sq <= EPS;
    if (pin) {
      pts.push(p);
      roles.push(poly.roles[i]);
    }
    if (pin !== qin && Math.abs(sp - sq) > EPS) {
      const cut = add(p, scale(sub(q, p), sp / (sp - sq)));
      pts.push(cut);
      // Leaving: the next edge runs along the cut. Entering: the rest of this edge.
      roles.push(pin ? cutRole : poly.roles[i]);
    }
  }
  return dedupe({ pts, roles });
}

/** Drop corners that fall on the one before (a cut through a corner makes them). */
function dedupe(poly: TaggedPoly): TaggedPoly {
  const pts: Vec3[] = [];
  const roles: string[] = [];
  const n = poly.pts.length;
  for (let i = 0; i < n; i++) {
    const next = poly.pts[(i + 1) % n];
    if (dist(poly.pts[i], next) < 0.01) continue; // zero-length edge: its role goes with it
    pts.push(poly.pts[i]);
    roles.push(poly.roles[i]);
  }
  return { pts, roles };
}

/** Divide a convex polygon into `count` even strips along `dir`. */
export function slicePoly(poly: TaggedPoly, dir: Vec3, count: number, cutRole: string): TaggedPoly[] {
  const origin = poly.pts[0];
  const ts = poly.pts.map((p) => dot(sub(p, origin), dir));
  const lo = Math.min(...ts);
  const hi = Math.max(...ts);
  const out: TaggedPoly[] = [];
  for (let k = 0; k < count; k++) {
    let strip = poly;
    if (k > 0) strip = clipPoly(strip, origin, dir, lo + ((hi - lo) * k) / count, false, cutRole);
    if (k < count - 1) strip = clipPoly(strip, origin, dir, lo + ((hi - lo) * (k + 1)) / count, true, cutRole);
    if (strip.pts.length >= 3) out.push(strip);
  }
  return out;
}

export class StructureBuilder {
  private readonly faces: Face[] = [];
  private readonly facePts = new Map<string, Vec3[]>();
  private readonly bars = new Map<string, { a: Vec3; b: Vec3; role: string }>();
  private readonly hubs = new Map<string, { at: Vec3; role: string }>();

  /** `inside` is any point inside the structure: faces are turned to look away from it. */
  constructor(private readonly inside: Vec3) {}

  face(spec: FaceSpec): void {
    let pts = spec.pts;
    let roles = spec.roles;
    let n = unit(polygonNormal(pts));
    if (dot(n, spec.outward ?? sub(centroid(pts), this.inside)) < 0) {
      const k = pts.length;
      pts = [...pts].reverse();
      roles = pts.map((_, i) => spec.roles[(2 * k - 2 - i) % k]);
      n = scale(n, -1);
    }
    const u = tidy(Math.abs(n[1]) > 1 - 1e-9 ? [1, 0, 0] : unit(cross([0, 1, 0], n)));
    const v = tidy(cross(n, u));
    const us = pts.map((p) => dot(p, u));
    const vs = pts.map((p) => dot(p, v));
    const u0 = Math.min(...us);
    const v0 = Math.min(...vs);
    // The corner of the face's bounding box, on the face's own plane.
    const origin = tidy(add(add(scale(u, u0), scale(v, v0)), scale(n, dot(pts[0], n))));
    const outline: Vec2[] = pts.map((_, i) => [us[i] - u0, vs[i] - v0]);
    this.faces.push({
      id: spec.id,
      label: spec.label,
      role: spec.role,
      group: spec.group,
      groupLabel: spec.groupLabel,
      plane: { origin, u, v },
      outline,
      fill: spec.fill,
    });
    this.facePts.set(spec.id, pts);
    pts.forEach((p, i) => {
      if (roles[i]) this.bar(p, pts[(i + 1) % pts.length], roles[i]);
    });
  }

  /** One polygon divided into even strips; its own edges become whole bars, the cuts become `cutRole` bars. */
  sliced(spec: SlicedSpec): number {
    const n = spec.pts.length;
    spec.pts.forEach((p, i) => {
      if (spec.roles[i]) this.bar(p, spec.pts[(i + 1) % n], spec.roles[i]);
    });
    const ts = spec.pts.map((p) => dot(p, spec.dir));
    const count = spec.count ?? evenParts(Math.max(...ts) - Math.min(...ts), spec.target);
    const strips = slicePoly({ pts: spec.pts, roles: spec.roles.map(() => '') }, spec.dir, count, spec.cutRole);
    strips.forEach((strip, k) =>
      this.face({
        ...strip,
        id: `${spec.idPrefix}-${k + 1}`,
        label: `${spec.labelPrefix} ${k + 1}`,
        role: spec.role,
        group: spec.group,
        groupLabel: spec.groupLabel,
        fill: spec.fill,
        outward: spec.outward,
      })
    );
    return strips.length;
  }

  /** A bar on a system line. The first role given to a line is kept. */
  bar(a: Vec3, b: Vec3, role: string): void {
    if (dist(a, b) < 0.01) return;
    const key = edgeKey(a, b);
    if (!this.bars.has(key)) this.bars.set(key, { a, b, role });
  }

  hub(at: Vec3, role: string): void {
    const key = pointKey(at);
    if (!this.hubs.has(key)) this.hubs.set(key, { at, role });
  }

  build(name: string, kind: string, params: Params): Structure {
    const facePts = [...this.facePts.entries()];
    const joints: Joint[] = [...this.bars.values()].map((bar, i) => ({
      id: `j${i + 1}`,
      role: bar.role,
      productId: null,
      a: bar.a,
      b: bar.b,
      faceIds: facePts.filter(([, pts]) => touches(pts, bar.a, bar.b)).map(([id]) => id),
    }));
    const hubs: Hub[] = [...this.hubs.values()].map((hub, i) => ({
      id: `h${i + 1}`,
      role: hub.role,
      productId: null,
      at: hub.at,
      jointIds: joints.filter((j) => dist(j.a, hub.at) < 0.05 || dist(j.b, hub.at) < 0.05).map((j) => j.id),
    }));
    return {
      schema: STRUCTURE_SCHEMA,
      unit: 'mm',
      name,
      template: { kind, params: { ...params } },
      defaults: { profileSystemId: null, colorId: null, glassId: null },
      appearance: { ...DEFAULT_APPEARANCE },
      faces: this.faces,
      joints,
      hubs,
      extras: [],
    };
  }
}

/** No -0 and no 1e-17 in a saved document. */
function tidy(a: Vec3): Vec3 {
  return a.map((x) => (Math.abs(x) < 1e-9 ? 0 : x)) as Vec3;
}

/** True when the face has an edge lying along the bar (either may be the longer one). */
function touches(pts: Vec3[], a: Vec3, b: Vec3): boolean {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    if ((onSegment(p, a, b) && onSegment(q, a, b)) || (onSegment(a, p, q) && onSegment(b, p, q))) return true;
  }
  return false;
}

/** The 3D corners of a face, from its plane and outline. */
export function faceCorners(face: Face): Vec3[] {
  const { origin, u, v } = face.plane;
  return face.outline.map(([x, y]) => add(origin, add(scale(u, x), scale(v, y))));
}

/** Outward unit normal of a face. */
export function faceNormal(face: Face): Vec3 {
  return cross(face.plane.u, face.plane.v);
}
