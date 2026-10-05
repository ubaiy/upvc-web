/**
 * design-model: the geometry of a SHAPED SASH, in mm. The sash frame is the
 * pane's real outline moved inwards (first by the gap to the outer frame,
 * then by the sash profile's face), so it is straight where the pane meets a
 * mullion or transom and bent where it meets the curved frame. The hardware
 * is placed on that outline: hinges only on a straight side, pivots at the
 * two ends of the pivot axis, the handle on the profile opposite the hinges.
 *
 * Pure geometry: the canvas draws these points, the 3D view can use the same.
 */

import { RectMm } from './geometry';
import { PointMm, insetConvexPolygon } from './shape-geometry';
import {
  OpeningKind,
  PaneOutline,
  PaneSide,
  StraightRun,
  boxOfPolygon,
  nearestOnPolygon,
  runOnLine,
} from './shaped-opening';

export interface SashJoint {
  /** On the sash's outer edge. */
  outer: PointMm;
  /** On its inner (glass) edge. */
  inner: PointMm;
}

export interface ShapedSash {
  /** The pane's outline: the opening in the outer frame. */
  paneMm: PointMm[];
  /** Outer edge of the sash profile. */
  outerMm: PointMm[];
  /** Inner edge of the sash profile: where the glass starts. */
  innerMm: PointMm[];
  gapMm: number;
  faceMm: number;
  /** The straight run of each side of the sash's OUTER edge (null where it is bent). */
  straight: Record<PaneSide, StraightRun | null>;
  /** Where two members meet: straight to straight (a mitre) or straight to bent. */
  joints: SashJoint[];
}

const SIDES: PaneSide[] = ['left', 'right', 'top', 'bottom'];

/** The line a straight side of the pane lies on, moved inwards by `inMm`. */
function sideLine(box: RectMm, side: PaneSide, inMm: number): { axis: 'x' | 'y'; coord: number } {
  switch (side) {
    case 'left':
      return { axis: 'x', coord: box.xMm + inMm };
    case 'right':
      return { axis: 'x', coord: box.xMm + box.wMm - inMm };
    case 'top':
      return { axis: 'y', coord: box.yMm + inMm };
    default:
      return { axis: 'y', coord: box.yMm + box.hMm - inMm };
  }
}

/**
 * The sash of a pane: its outline offset inwards by the gap, and again by
 * the profile face. Throws (DesignError from the inset) when the pane is too
 * small to hold a sash of that face.
 */
export function shapedSash(o: PaneOutline, gapMm: number, faceMm: number): ShapedSash {
  const outerMm = insetConvexPolygon(o.polygonMm, gapMm);
  const innerMm = insetConvexPolygon(o.polygonMm, gapMm + faceMm);
  const straight = { left: null, right: null, top: null, bottom: null } as Record<PaneSide, StraightRun | null>;
  for (const side of SIDES) {
    if (!o.sides[side]) continue;
    const l = sideLine(o.box, side, gapMm);
    straight[side] = runOnLine(outerMm, l.axis, l.coord, 0.05);
  }

  // Which member an edge of the outer line belongs to.
  const memberOf = (a: PointMm, b: PointMm): string => {
    for (const side of SIDES) {
      if (!straight[side]) continue;
      const l = sideLine(o.box, side, gapMm);
      const ca = l.axis === 'x' ? a.xMm : a.yMm;
      const cb = l.axis === 'x' ? b.xMm : b.yMm;
      if (Math.abs(ca - l.coord) < 0.05 && Math.abs(cb - l.coord) < 0.05) return side;
    }
    return 'bent';
  };
  const joints: SashJoint[] = [];
  const n = outerMm.length;
  for (let i = 0; i < n; i++) {
    const prev = outerMm[(i + n - 1) % n];
    const v = outerMm[i];
    const next = outerMm[(i + 1) % n];
    const before = memberOf(prev, v);
    const after = memberOf(v, next);
    const turn = Math.abs(
      Math.atan2(
        (v.xMm - prev.xMm) * (next.yMm - v.yMm) - (v.yMm - prev.yMm) * (next.xMm - v.xMm),
        (v.xMm - prev.xMm) * (next.xMm - v.xMm) + (v.yMm - prev.yMm) * (next.yMm - v.yMm)
      )
    );
    if (before === after && turn < (20 * Math.PI) / 180) continue;
    if (joints.some((j) => Math.hypot(j.outer.xMm - v.xMm, j.outer.yMm - v.yMm) < 1)) continue;
    joints.push({ outer: v, inner: nearestOnPolygon(innerMm, v).point });
  }
  return { paneMm: o.polygonMm, outerMm, innerMm, gapMm, faceMm, straight, joints };
}

/* ------------------------------------------------------------------ */
/* Small convex-polygon helpers                                        */
/* ------------------------------------------------------------------ */

/** Where the line x = coord (axis 'x') or y = coord (axis 'y') crosses a convex polygon: [low, high] along the other axis. */
export function lineSpan(points: PointMm[], axis: 'x' | 'y', coord: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const ca = axis === 'x' ? a.xMm : a.yMm;
    const cb = axis === 'x' ? b.xMm : b.yMm;
    const ta = axis === 'x' ? a.yMm : a.xMm;
    const tb = axis === 'x' ? b.yMm : b.xMm;
    if (Math.abs(ca - cb) < 1e-9) {
      if (Math.abs(ca - coord) < 1e-6) {
        lo = Math.min(lo, ta, tb);
        hi = Math.max(hi, ta, tb);
      }
      continue;
    }
    const t = (coord - ca) / (cb - ca);
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    const v = ta + (tb - ta) * t;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return hi >= lo ? [lo, hi] : null;
}

/** The part of segment a-b inside a convex polygon, or null. */
export function clipSegmentToConvex(points: PointMm[], a: PointMm, b: PointMm): [PointMm, PointMm] | null {
  let signed = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    signed += p.xMm * q.yMm - q.xMm * p.yMm;
  }
  const orient = Math.sign(signed) || 1;
  let t0 = 0;
  let t1 = 1;
  const dx = b.xMm - a.xMm;
  const dy = b.yMm - a.yMm;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const ex = q.xMm - p.xMm;
    const ey = q.yMm - p.yMm;
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    const nx = (orient * -ey) / len;
    const ny = (orient * ex) / len;
    const da = (a.xMm - p.xMm) * nx + (a.yMm - p.yMm) * ny;
    const dd = dx * nx + dy * ny;
    if (Math.abs(dd) < 1e-12) {
      if (da < -1e-6) return null;
      continue;
    }
    const t = -da / dd;
    if (dd > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  const at = (t: number): PointMm => ({ xMm: a.xMm + dx * t, yMm: a.yMm + dy * t });
  return [at(t0), at(t1)];
}

/** Where a ray from `from` at `angleRad` (0 = +x, y grows downwards) leaves a convex polygon. */
export function rayExit(points: PointMm[], from: PointMm, angleRad: number): PointMm | null {
  const far = Math.max(1, ...points.map((p) => Math.hypot(p.xMm - from.xMm, p.yMm - from.yMm))) * 2;
  const seg = clipSegmentToConvex(points, from, {
    xMm: from.xMm + Math.cos(angleRad) * far,
    yMm: from.yMm + Math.sin(angleRad) * far,
  });
  return seg ? seg[1] : null;
}

/* ------------------------------------------------------------------ */
/* Hardware and opening marks                                          */
/* ------------------------------------------------------------------ */

export interface SashHinge {
  at: PointMm;
  /** The side it is on: always a straight one. */
  side: PaneSide;
}

export interface SashHandle {
  /** Centre of the grip: on the middle line of the sash profile. */
  at: PointMm;
  /** Direction of the profile there (the grip lies along it), radians. */
  angleRad: number;
  /** The side of the sash it is on. */
  side: PaneSide;
}

export interface OpeningMark {
  from: PointMm;
  /** The point of the triangle: on the hinge side (or the far end of a pivot half). */
  to: PointMm;
  motion: 'turn' | 'tilt' | 'pivot';
  hingeSide: PaneSide;
  /** A pivot's half that swings inwards (drawn dashed, like every inward opening). */
  inward?: boolean;
}

export interface ShapedSashHardware {
  kind: OpeningKind;
  hinges: SashHinge[];
  /** Tilt bearings of a full round: on the sash edge either side of its lowest point. */
  bearings: PointMm[];
  /** Stay arms of a full-round tilt: across the profile either side of the top. */
  stays: Array<[PointMm, PointMm]>;
  /** Pivot points: where the axis meets the sash edge. */
  pivots: PointMm[];
  /** The pivot axis across the glass. */
  axis: [PointMm, PointMm] | null;
  handle: SashHandle | null;
  marks: OpeningMark[];
}

export interface HardwareOptions {
  /** Hinges on the hinged side (2, or 3 for a door / 3D hinges). */
  hingeCount?: number;
  /** A door leaf: the lever is this high above the bottom of the leaf. */
  doorLeverMm?: number;
}

const OPPOSITE: Record<PaneSide, PaneSide> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
const mid = (r: StraightRun): number => (r.fromMm + r.toMm) / 2;
const clampN = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The handle on the profile of `side`, where the line `along` (a y for left / right, an x for top / bottom) meets it. */
function handleOn(s: ShapedSash, side: PaneSide, along: number): SashHandle | null {
  const upright = side === 'left' || side === 'right';
  const span = lineSpan(s.outerMm, upright ? 'y' : 'x', along);
  if (!span) return null;
  const edge = side === 'left' || side === 'top' ? span[0] : span[1];
  const onOuter: PointMm = upright ? { xMm: edge, yMm: along } : { xMm: along, yMm: edge };
  const onInner = nearestOnPolygon(s.innerMm, onOuter).point;
  const across = Math.atan2(onInner.yMm - onOuter.yMm, onInner.xMm - onOuter.xMm);
  return {
    at: { xMm: (onOuter.xMm + onInner.xMm) / 2, yMm: (onOuter.yMm + onInner.yMm) / 2 },
    angleRad: across + Math.PI / 2,
    side,
  };
}

/** Where (along the side) the outline reaches farthest towards `side`. */
function farthestAlong(points: PointMm[], side: PaneSide): number {
  const upright = side === 'left' || side === 'right';
  const sign = side === 'left' || side === 'top' ? -1 : 1;
  const reach = (p: PointMm): number => sign * (upright ? p.xMm : p.yMm);
  const most = Math.max(...points.map(reach));
  const at = points.filter((p) => most - reach(p) < 0.5).map((p) => (upright ? p.yMm : p.xMm));
  return (Math.min(...at) + Math.max(...at)) / 2;
}

/** The two lines of an opening triangle: from the far extremities of the glass to the point on `hingeSide`. */
function triangle(s: ShapedSash, hingeSide: PaneSide, motion: 'turn' | 'tilt'): OpeningMark[] {
  const g = boxOfPolygon(s.innerMm);
  const upright = hingeSide === 'left' || hingeSide === 'right';
  const l = sideLine(g, hingeSide, 0);
  const run = runOnLine(s.innerMm, l.axis, l.coord, 0.05);
  const centre = upright ? g.yMm + g.hMm / 2 : g.xMm + g.wMm / 2;
  // On a straight side: its middle. On a bent one (a full round's lowest point): the middle of the glass.
  const along = run ? mid(run) : centre;
  const to: PointMm = upright ? { xMm: l.coord, yMm: along } : { xMm: along, yMm: l.coord };
  const far = sideLine(g, OPPOSITE[hingeSide], 0).coord;
  const corners: PointMm[] = upright
    ? [
        { xMm: far, yMm: g.yMm },
        { xMm: far, yMm: g.yMm + g.hMm },
      ]
    : [
        { xMm: g.xMm, yMm: far },
        { xMm: g.xMm + g.wMm, yMm: far },
      ];
  // Each line starts at the extremity of the glass outline towards that far
  // corner: the corner itself on a straight sash, the point of the curve
  // nearest to it on a bent one.
  return corners.map((c) => ({ from: nearestOnPolygon(s.innerMm, c).point, to, motion, hingeSide }));
}

function hingesOn(s: ShapedSash, side: PaneSide, count: number): SashHinge[] {
  const run = s.straight[side];
  if (!run) return [];
  const l = sideLine(boxOfPolygon(s.paneMm), side, s.gapMm);
  const out: SashHinge[] = [];
  for (let i = 0; i < count; i++) {
    // Near the ends of the straight side, where hinges are fitted.
    const f = count === 1 ? 0.5 : 0.14 + (0.72 * i) / (count - 1);
    const t = run.fromMm + run.lengthMm * f;
    out.push({ at: l.axis === 'x' ? { xMm: l.coord, yMm: t } : { xMm: t, yMm: l.coord }, side });
  }
  return out;
}

/**
 * Where the hardware of a shaped sash goes, and its opening marks, for the
 * way it opens (a kind the outline can carry: see effectiveOpeningKind).
 */
export function shapedSashHardware(
  s: ShapedSash,
  kind: OpeningKind,
  opts: HardwareOptions = {}
): ShapedSashHardware {
  const hw: ShapedSashHardware = {
    kind,
    hinges: [],
    bearings: [],
    stays: [],
    pivots: [],
    axis: null,
    handle: null,
    marks: [],
  };
  const box = boxOfPolygon(s.outerMm);
  const cx = box.xMm + box.wMm / 2;
  const cy = box.yMm + box.hMm / 2;
  const count = opts.hingeCount ?? 2;

  if (kind === 'Pivot Horizontal' || kind === 'Pivot Vertical') {
    const horizontal = kind === 'Pivot Horizontal';
    const outer = lineSpan(s.outerMm, horizontal ? 'y' : 'x', horizontal ? cy : cx);
    const inner = lineSpan(s.innerMm, horizontal ? 'y' : 'x', horizontal ? cy : cx);
    const cross = lineSpan(s.innerMm, horizontal ? 'x' : 'y', horizontal ? cx : cy);
    if (!outer || !inner || !cross) return hw;
    const onAxis = (v: number): PointMm => (horizontal ? { xMm: v, yMm: cy } : { xMm: cx, yMm: v });
    const offAxis = (v: number): PointMm => (horizontal ? { xMm: cx, yMm: v } : { xMm: v, yMm: cy });
    hw.pivots = [onAxis(outer[0]), onAxis(outer[1])];
    hw.axis = [onAxis(inner[0]), onAxis(inner[1])];
    // The half above (left of) the axis swings in, the other half out.
    for (const end of inner) {
      hw.marks.push({ from: onAxis(end), to: offAxis(cross[0]), motion: 'pivot', hingeSide: horizontal ? 'top' : 'left', inward: true });
      hw.marks.push({ from: onAxis(end), to: offAxis(cross[1]), motion: 'pivot', hingeSide: horizontal ? 'bottom' : 'right' });
    }
    hw.handle = horizontal ? handleOn(s, 'bottom', cx) : handleOn(s, 'right', cy);
    return hw;
  }

  const tiltTurn = kind === 'Tilt & Turn Left' || kind === 'Tilt & Turn Right';
  const hingeSide: PaneSide = tiltTurn
    ? kind === 'Tilt & Turn Right'
      ? 'right'
      : 'left'
    : (kind.toLowerCase() as PaneSide);
  const handleSide = OPPOSITE[hingeSide];
  const hingeRun = s.straight[hingeSide];
  const handleRun = s.straight[handleSide];

  if (hingeRun) {
    hw.hinges = hingesOn(s, hingeSide, hingeRun.lengthMm < 400 ? Math.min(2, count) : count);
  } else if (hingeSide === 'bottom') {
    // A full round tilts on two bearings either side of its lowest point,
    // held at the top by two stay arms.
    const centre = { xMm: cx, yMm: cy };
    const spread = (25 * Math.PI) / 180;
    for (const sign of [-1, 1]) {
      const bearing = rayExit(s.outerMm, centre, Math.PI / 2 + sign * spread);
      if (bearing) hw.bearings.push(bearing);
      const a = -Math.PI / 2 + sign * spread;
      const onFrame = rayExit(s.paneMm, centre, a);
      const onGlass = rayExit(s.innerMm, centre, a);
      if (onFrame && onGlass) hw.stays.push([onFrame, onGlass]);
    }
  }

  // On a straight handle side: its middle (a door lever at lever height).
  // On a bent one: the point of the curve farthest from the hinges, where
  // the profile runs nearly parallel to the hinged side, so the grip is
  // upright like any other (kept off the ends of the curve).
  const upright = handleSide === 'left' || handleSide === 'right';
  let along: number;
  if (handleRun) {
    along = mid(handleRun);
    if (upright && opts.doorLeverMm !== undefined) {
      along = clampN(
        box.yMm + box.hMm - opts.doorLeverMm,
        handleRun.fromMm + handleRun.lengthMm * 0.25,
        handleRun.toMm - handleRun.lengthMm * 0.1
      );
    }
  } else {
    const farthest = farthestAlong(s.outerMm, handleSide);
    along = upright
      ? clampN(farthest, box.yMm + box.hMm * 0.3, box.yMm + box.hMm * 0.7)
      : clampN(farthest, box.xMm + box.wMm * 0.3, box.xMm + box.wMm * 0.7);
  }
  hw.handle = handleOn(s, handleSide, along);
  hw.marks = triangle(s, hingeSide, hingeSide === 'bottom' && !hingeRun ? 'tilt' : 'turn');
  if (tiltTurn) hw.marks.push(...triangle(s, 'bottom', 'tilt'));
  return hw;
}

/* ------------------------------------------------------------------ */
/* Lengths of the sash profile (for the price)                         */
/* ------------------------------------------------------------------ */

export interface ShapedSashLengths {
  /** The whole sash, along its outer edge, mm. */
  outlineMm: number;
  /** The part of it that is bent to a curve, mm (0 for a sloped sash: its members are straight). */
  curvedMm: number;
  /** Bent pieces: one per run of the outer edge that follows a curve. */
  bends: number;
}

/**
 * How much of a shaped sash is bent, measured on the outline the canvas
 * draws: the straight members are the sides {@link shapedSash} found, the
 * rest follows the frame.
 */
export function shapedSashLengths(o: PaneOutline, sash: ShapedSash): ShapedSashLengths {
  const pts = sash.outerMm;
  const n = pts.length;
  const onStraight = (a: PointMm, b: PointMm): boolean =>
    SIDES.some((side) => {
      if (!sash.straight[side]) return false;
      const l = sideLine(o.box, side, sash.gapMm);
      const ca = l.axis === 'x' ? a.xMm : a.yMm;
      const cb = l.axis === 'x' ? b.xMm : b.yMm;
      return Math.abs(ca - l.coord) < 0.05 && Math.abs(cb - l.coord) < 0.05;
    });
  let outlineMm = 0;
  let bentMm = 0;
  const bent: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.xMm - a.xMm, b.yMm - a.yMm);
    const isBent = !onStraight(a, b);
    bent.push(isBent);
    outlineMm += len;
    if (isBent) bentMm += len;
  }
  if (!o.curved) return { outlineMm, curvedMm: 0, bends: 0 };
  // A run starts where a bent edge follows a straight one; all bent = one piece (a round).
  let bends = 0;
  for (let i = 0; i < n; i++) if (bent[i] && !bent[(i + n - 1) % n]) bends++;
  if (!bends && bent.some(Boolean)) bends = 1;
  return { outlineMm, curvedMm: bentMm, bends };
}
