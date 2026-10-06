/**
 * structure-model footprint — the plan of a structure drawn from nothing: a
 * simple polygon on the floor. Pure 2D geometry, millimetres. A plan point is
 * [x, z] of the world (X to the right along the front, Z towards the viewer),
 * so on a plan drawn with the front at the bottom z runs down the sheet.
 *
 * A stored plan runs so that every side goes from its left end to its right
 * end as seen from outside; its signed area here is negative.
 */

import { evenParts } from './builder';

export type Pt = [number, number];

/** The grid a corner snaps to, the shortest side and the largest plan, mm. */
export const PLAN_GRID = 100;
export const PLAN_MIN_SIDE = 300;
export const PLAN_MAX = 30000;
/** The most corners a plan may have. */
export const PLAN_MAX_CORNERS = 40;

const E = 1e-6;
const subP = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const dotP = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
export const distP = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Twice the signed area of a → b → c. */
const orient = (a: Pt, b: Pt, c: Pt): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

export function formatPlan(pts: Pt[]): string {
  return pts.map((p) => `${Math.round(p[0])},${Math.round(p[1])}`).join(';');
}

/** The corners of a stored plan; an empty list when the text is not one. */
export function parsePlan(text: unknown): Pt[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  const pts: Pt[] = [];
  for (const part of text.split(';')) {
    const [x, z] = part.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
    pts.push([x, z]);
  }
  return pts;
}

export function planArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** The plan in the stored direction (see the head of this file). */
export function orientPlan(pts: Pt[]): Pt[] {
  return planArea(pts) > 0 ? [pts[0], ...pts.slice(1).reverse()] : pts;
}

export const sideLength = (pts: Pt[], i: number): number => distP(pts[i], pts[(i + 1) % pts.length]);

/** Unit direction of side i and its unit normal pointing out of an oriented plan. */
export function sideFrame(pts: Pt[], i: number): { dir: Pt; out: Pt } {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const l = distP(a, b) || 1;
  const dir: Pt = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  return { dir, out: [-dir[1], dir[0]] };
}

const within = (a: Pt, b: Pt, p: Pt): boolean =>
  p[0] >= Math.min(a[0], b[0]) - 0.01 && p[0] <= Math.max(a[0], b[0]) + 0.01 && p[1] >= Math.min(a[1], b[1]) - 0.01 && p[1] <= Math.max(a[1], b[1]) + 0.01;

/** True when the segments a–b and c–d cross or touch anywhere. */
export function segmentsTouch(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  const tol = 0.5;
  if (((o1 > tol && o2 < -tol) || (o1 < -tol && o2 > tol)) && ((o3 > tol && o4 < -tol) || (o3 < -tol && o4 > tol))) return true;
  if (Math.abs(o1) <= tol && within(a, b, c)) return true;
  if (Math.abs(o2) <= tol && within(a, b, d)) return true;
  if (Math.abs(o3) <= tol && within(c, d, a)) return true;
  return Math.abs(o4) <= tol && within(c, d, b);
}

/** True when b → c runs back over a → b. */
const foldsBack = (a: Pt, b: Pt, c: Pt): boolean => Math.abs(orient(a, b, c)) <= 0.5 && dotP(subP(a, b), subP(c, b)) > 0;

/**
 * While drawing: the side the next side (last corner → `to`) would cross, or
 * -1 when it may be drawn. `closing` is the side back to the first corner.
 */
export function crossedSide(pts: Pt[], to: Pt, closing = false): number {
  const k = pts.length - 1;
  if (k < 1) return -1;
  const from = pts[k];
  if (foldsBack(pts[k - 1], from, to)) return k - 1;
  for (let i = closing ? 1 : 0; i < k - 1; i++) if (segmentsTouch(from, to, pts[i], pts[i + 1])) return i;
  if (closing) return k >= 2 && foldsBack(from, pts[0], pts[1]) ? 0 : -1;
  // The new corner may not sit on the first side either, except on the first corner itself (that closes the plan).
  return -1;
}

export interface PlanProblem {
  /** The side to show; -1 when the problem is of the whole plan. */
  side: number;
  message: string;
}

/** What is wrong with a closed plan, in plain words; null when it can be built. */
export function planProblem(pts: Pt[]): PlanProblem | null {
  const n = pts.length;
  if (n < 3) return { side: -1, message: 'A plan needs at least 3 corners.' };
  if (n > PLAN_MAX_CORNERS) return { side: -1, message: `A plan can have ${PLAN_MAX_CORNERS} corners at most.` };
  for (let i = 0; i < n; i++) {
    if (sideLength(pts, i) < PLAN_MIN_SIDE - 0.5) return { side: i, message: `Side ${i + 1} is shorter than ${PLAN_MIN_SIDE} mm.` };
  }
  for (let i = 0; i < n; i++) {
    if (foldsBack(pts[i], pts[(i + 1) % n], pts[(i + 2) % n])) return { side: i, message: `Side ${i + 1} runs back over itself.` };
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsTouch(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return { side: j, message: `Side ${j + 1} crosses side ${i + 1}.` };
    }
  }
  if (Math.abs(planArea(pts)) < PLAN_MIN_SIDE * PLAN_MIN_SIDE) return { side: -1, message: 'The plan has no area.' };
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  if (Math.max(...xs) - Math.min(...xs) > PLAN_MAX || Math.max(...zs) - Math.min(...zs) > PLAN_MAX) {
    return { side: -1, message: `A plan can be ${PLAN_MAX / 1000} m long at most.` };
  }
  return null;
}

/** Corners that lie on the straight line between their neighbours taken out. */
export function withoutStraightCorners(pts: Pt[]): Pt[] {
  const n = pts.length;
  const out = pts.filter((p, i) => Math.abs(orient(pts[(i + n - 1) % n], p, pts[(i + 1) % n])) > 1);
  return out.length >= 3 ? out : pts;
}

/** No corner turns inward. */
export function isConvexPlan(pts: Pt[]): boolean {
  const n = pts.length;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const o = orient(pts[i], pts[(i + 1) % n], pts[(i + 2) % n]);
    if (Math.abs(o) <= 1) continue;
    if (sign && Math.sign(o) !== sign) return false;
    sign = Math.sign(o);
  }
  return true;
}

/** The centre and radius of a plan whose corners lie on one circle with equal sides (5 or more); null otherwise. */
export function regularPlan(pts: Pt[]): { centre: Pt; radius: number } | null {
  const n = pts.length;
  if (n < 5) return null;
  const centre: Pt = [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
  const radius = pts.reduce((s, p) => s + distP(p, centre), 0) / n;
  const side = 2 * radius * Math.sin(Math.PI / n);
  const tol = 3;
  for (let i = 0; i < n; i++) {
    if (Math.abs(distP(pts[i], centre) - radius) > tol || Math.abs(sideLength(pts, i) - side) > tol) return null;
  }
  return { centre, radius };
}

/** The sides a lean-to can be high on: the whole plan lies on the inner side of their line. */
export function highSides(pts: Pt[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const { out: o } = sideFrame(pts, i);
    if (pts.every((p) => dotP(subP(p, pts[i]), o) <= 1)) out.push(i);
  }
  return out;
}

/** The index of the longest side. */
export function longestSide(pts: Pt[]): number {
  let best = 0;
  for (let i = 1; i < pts.length; i++) if (sideLength(pts, i) > sideLength(pts, best) + 0.5) best = i;
  return best;
}

export type RoofKind = 'none' | 'flat' | 'leanto' | 'gable' | 'hipped' | 'pyramid' | 'dome';

/** The roofs that can be built on this plan. */
export function roofsFor(pts: Pt[]): RoofKind[] {
  const roofs: RoofKind[] = highSides(pts).length ? ['none', 'flat', 'leanto', 'gable'] : ['none', 'flat', 'gable'];
  if (isConvexPlan(pts)) roofs.push('hipped', 'pyramid');
  if (regularPlan(pts)) roofs.push('dome');
  return roofs;
}

// --- ready plans ---

export function rectanglePlan(width: number, depth: number): Pt[] {
  return [[0, 0], [0, depth], [width, depth], [width, 0]];
}

/** A regular plan of n sides on a circle; one side faces the front. */
export function regularPolygonPlan(sides: number, diameter: number): Pt[] {
  const n = Math.max(3, Math.min(PLAN_MAX_CORNERS, Math.round(sides)));
  const r = diameter / 2;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.PI / 2 + Math.PI / n + (2 * Math.PI * i) / n;
    pts.push([Math.round(r + r * Math.cos(t)), Math.round(r + r * Math.sin(t))]);
  }
  return orientPlan(pts);
}

export const READY_PLANS: readonly { key: string; label: string; plan: Pt[] }[] = [
  { key: 'rectangle', label: 'Rectangle', plan: rectanglePlan(3600, 2400) },
  { key: 'l', label: 'L shape', plan: orientPlan([[0, 0], [2400, 0], [2400, 1800], [4800, 1800], [4800, 3600], [0, 3600]]) },
  { key: 't', label: 'T shape', plan: orientPlan([[1500, 0], [3300, 0], [3300, 1800], [4800, 1800], [4800, 3600], [0, 3600], [0, 1800], [1500, 1800]]) },
  { key: 'u', label: 'U shape', plan: orientPlan([[0, 0], [1500, 0], [1500, 1800], [3300, 1800], [3300, 0], [4800, 0], [4800, 3600], [0, 3600]]) },
  { key: 'bay', label: 'Room with angled bay', plan: orientPlan([[0, 0], [3600, 0], [3600, 2400], [2700, 3300], [900, 3300], [0, 2400]]) },
];

// --- snapping while drawing ---

export interface Snap {
  point: Pt;
  /** What held the point: the first corner (closes the plan), a right or 45° angle, or only the grid. */
  kind: 'close' | 'angle' | 'grid';
}

const toGrid = (v: number, grid: number): number => Math.round(v / grid) * grid;

/**
 * Where a corner goes for a pointer at `raw`: on the first corner when near it,
 * else on the nearest of the 8 directions from the last corner when the
 * pointer is within `reach` of one (length on the grid), else on the grid.
 */
export function snapCorner(pts: Pt[], raw: Pt, reach: number, grid = PLAN_GRID): Snap {
  if (pts.length >= 3 && distP(raw, pts[0]) <= reach) return { point: [pts[0][0], pts[0][1]], kind: 'close' };
  const last = pts[pts.length - 1];
  if (last) {
    const d = subP(raw, last);
    const l = Math.hypot(d[0], d[1]);
    if (l > 1) {
      const step = Math.PI / 4;
      const a = Math.round(Math.atan2(d[1], d[0]) / step) * step;
      const along = toGrid(l * Math.cos(Math.atan2(d[1], d[0]) - a), grid);
      const diagonal = Math.abs(Math.round(a / step)) % 2 === 1;
      // On a diagonal the corner keeps to the grid: both steps equal.
      const leg = diagonal ? toGrid(along / Math.SQRT2, grid) : along;
      const p: Pt = diagonal ? [last[0] + Math.sign(Math.cos(a)) * leg, last[1] + Math.sign(Math.sin(a)) * leg] : [last[0] + Math.round(Math.cos(a)) * leg, last[1] + Math.round(Math.sin(a)) * leg];
      if (distP(p, raw) <= reach && leg > 0) return { point: p, kind: 'angle' };
    }
  }
  return { point: [toGrid(raw[0], grid), toGrid(raw[1], grid)], kind: 'grid' };
}

/** The point at `length` from `from` towards `towards` (a typed length for the side being drawn). */
export function pointAtLength(from: Pt, towards: Pt, length: number): Pt {
  const d = subP(towards, from);
  const l = Math.hypot(d[0], d[1]);
  if (l < E) return [from[0] + length, from[1]];
  return [Math.round(from[0] + (d[0] / l) * length), Math.round(from[1] + (d[1] / l) * length)];
}

// --- changing a closed plan ---

/** Side i made `length` long by moving its far end, and everything after it, along the side. */
export function setSideLength(pts: Pt[], i: number, length: number): Pt[] {
  const n = pts.length;
  const { dir } = sideFrame(pts, i);
  const by = length - sideLength(pts, i);
  const out = pts.map((p): Pt => [p[0], p[1]]);
  // The far end and the corners up to the one before the start move together, so the other sides keep their directions where they can.
  const b = (i + 1) % n;
  const c = (i + 2) % n;
  const next = sideFrame(pts, b).dir;
  out[b] = [Math.round(pts[b][0] + dir[0] * by), Math.round(pts[b][1] + dir[1] * by)];
  // A following side square to this one keeps its own length: its far corner moves too.
  if (n > 3 && Math.abs(dotP(dir, next)) < 0.01) out[c] = [Math.round(pts[c][0] + dir[0] * by), Math.round(pts[c][1] + dir[1] * by)];
  return out;
}

/** Side i moved square to itself by `by` mm (positive = outward); its two corners slide. */
export function moveSide(pts: Pt[], i: number, by: number): Pt[] {
  const n = pts.length;
  const { out: o } = sideFrame(pts, i);
  const res = pts.map((p): Pt => [p[0], p[1]]);
  for (const k of [i, (i + 1) % n]) res[k] = [Math.round(pts[k][0] + o[0] * by), Math.round(pts[k][1] + o[1] * by)];
  return res;
}

export function moveCorner(pts: Pt[], i: number, to: Pt): Pt[] {
  return pts.map((p, k): Pt => (k === i ? [Math.round(to[0]), Math.round(to[1])] : [p[0], p[1]]));
}

/** A new corner in the middle of side i. */
export function splitSide(pts: Pt[], i: number): Pt[] {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const m: Pt = [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
  return [...pts.slice(0, i + 1), m, ...pts.slice(i + 1)];
}

export function removeCorner(pts: Pt[], i: number): Pt[] {
  return pts.length > 3 ? pts.filter((_, k) => k !== i) : pts;
}

// --- cutting a plan into flat roof pieces ---

/** A piece of the plan between two cut lines: a trapezoid (or a triangle), corners in order. */
export interface PlanPiece {
  pts: Pt[];
  /** The extent of the piece on its first and on its second cut line, across the cut direction. */
  at0: [number, number];
  at1: [number, number];
}

/** One strip of the plan between the cut lines s = c0 and s = c1. */
export interface PlanSlab {
  c0: number;
  c1: number;
  pieces: PlanPiece[];
}

/**
 * The plan cut by lines square to `axis`: one line through every corner, and
 * even lines between them close to `module` apart. Between two lines the plan
 * has no corner, so every piece is a trapezoid or a triangle: flat panels a
 * roof can be made of, whatever the plan.
 */
export function slabsOf(pts: Pt[], axis: Pt, module: number): PlanSlab[] {
  const perp: Pt = [-axis[1], axis[0]];
  const st = pts.map((p): Pt => [dotP(p, axis), dotP(p, perp)]);
  const back = (s: number, t: number): Pt => [s * axis[0] + t * perp[0], s * axis[1] + t * perp[1]];
  const stops = [...st.map((p) => p[0])].sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1] > 1);
  const cuts: number[] = [stops[0]];
  for (let i = 1; i < stops.length; i++) {
    const n = evenParts(stops[i] - stops[i - 1], module);
    for (let k = 1; k <= n; k++) cuts.push(stops[i - 1] + ((stops[i] - stops[i - 1]) * k) / n);
  }
  const slabs: PlanSlab[] = [];
  for (let c = 0; c + 1 < cuts.length; c++) {
    const c0 = cuts[c];
    const c1 = cuts[c + 1];
    const m = (c0 + c1) / 2;
    const crossing: { t0: number; t1: number; tm: number }[] = [];
    for (let i = 0; i < st.length; i++) {
      const a = st[i];
      const b = st[(i + 1) % st.length];
      if ((a[0] - m) * (b[0] - m) >= 0) continue;
      const at = (s: number): number => a[1] + ((b[1] - a[1]) * (s - a[0])) / (b[0] - a[0]);
      crossing.push({ t0: at(c0), t1: at(c1), tm: at(m) });
    }
    crossing.sort((a, b) => a.tm - b.tm);
    const pieces: PlanPiece[] = [];
    for (let k = 0; k + 1 < crossing.length; k += 2) {
      const lo = crossing[k];
      const hi = crossing[k + 1];
      const raw: Pt[] = [back(c0, lo.t0), back(c1, lo.t1), back(c1, hi.t1), back(c0, hi.t0)];
      const corners = raw.filter((p, i) => distP(p, raw[(i + 1) % 4]) > 0.01);
      if (corners.length >= 3) pieces.push({ pts: corners, at0: [lo.t0, hi.t0], at1: [lo.t1, hi.t1] });
    }
    slabs.push({ c0, c1, pieces });
  }
  return slabs;
}

/** The parts two lists of intervals have in common. */
export function commonIntervals(a: [number, number][], b: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      if (hi - lo > 0.5) out.push([lo, hi]);
    }
  }
  return out;
}

/** The part of a convex polygon with dot(p, normal) <= limit. */
export function clipConvex(pts: Pt[], normal: Pt, limit: number): Pt[] {
  const out: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const sp = dotP(p, normal) - limit;
    const sq = dotP(q, normal) - limit;
    if (sp <= E) out.push(p);
    if ((sp < -E && sq > E) || (sp > E && sq < -E)) {
      const k = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
    }
  }
  return out.filter((p, i) => distP(p, out[(i + 1) % out.length]) > 0.01);
}

/** The middle of the area of a plan. */
export function planCentroid(pts: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const w = p[0] * q[1] - q[0] * p[1];
    a += w;
    cx += (p[0] + q[0]) * w;
    cz += (p[1] + q[1]) * w;
  }
  return Math.abs(a) < E ? pts[0] : [cx / (3 * a), cz / (3 * a)];
}
