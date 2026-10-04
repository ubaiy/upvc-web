/**
 * design-model shape geometry (Phase 3, model level) — pure functions for
 * shaped frames: outline paths, areas, member cut lengths (incl. curved),
 * mitre angles, inward offsets, and clipping of the rectangular pane grid
 * to the shape.
 *
 * Coordinates: mm, origin at the frame's OUTER top-left, y DOWN — the same
 * frame of reference as layout()'s rects, so renderer and pricing read one
 * geometry. All outline polygons are closed implicitly (last → first).
 *
 * All five frame shapes are CONVEX, which the inset and clipping helpers
 * rely on (documented per function).
 */

import { LayoutOptions, RectMm, DEFAULT_FRAME_FACE_MM, layout } from './geometry';
import { DesignError, FrameShape, WindowDesign } from './types';

export interface PointMm {
  xMm: number;
  yMm: number;
}

/** Tessellation density for arcs (segments per full arc). */
export const DEFAULT_ARC_SEGMENTS = 64;

/* ------------------------------------------------------------------ */
/* Arch arithmetic (exact)                                             */
/* ------------------------------------------------------------------ */

/** Circular-arc radius from chord and rise: R = (rise² + (c/2)²) / 2·rise. */
export function archRadiusMm(riseMm: number, chordMm: number): number {
  if (!(riseMm > 0)) throw new DesignError(`arch rise ${riseMm} must be > 0`);
  return (riseMm * riseMm + (chordMm / 2) * (chordMm / 2)) / (2 * riseMm);
}

/** Arc sweep angle in radians: θ = 2·asin((c/2)/R). π for a semicircle. */
export function archSweepRad(riseMm: number, chordMm: number): number {
  const r = archRadiusMm(riseMm, chordMm);
  return 2 * Math.asin(Math.min(1, chordMm / 2 / r));
}

/** Curved head cut length: R·θ. */
export function archArcLengthMm(riseMm: number, chordMm: number): number {
  return archRadiusMm(riseMm, chordMm) * archSweepRad(riseMm, chordMm);
}

/** Circular segment area (between chord and arc): R²(θ − sinθ)/2. */
export function circularSegmentAreaMm2(
  riseMm: number,
  chordMm: number
): number {
  const r = archRadiusMm(riseMm, chordMm);
  const theta = archSweepRad(riseMm, chordMm);
  return (r * r * (theta - Math.sin(theta))) / 2;
}

/* ------------------------------------------------------------------ */
/* Outline                                                             */
/* ------------------------------------------------------------------ */

export interface OutlineOptions {
  arcSegments?: number;
}

/**
 * The shape's outline polygon within the w×h frame box, clockwise in
 * screen coordinates. Arcs are tessellated (`arcSegments`, default 64) —
 * use outlinePath() when the renderer wants true arcs.
 */
export function shapeOutline(
  shape: FrameShape,
  wMm: number,
  hMm: number,
  opts?: OutlineOptions
): PointMm[] {
  const segs = opts?.arcSegments ?? DEFAULT_ARC_SEGMENTS;
  switch (shape.kind) {
    case 'rect':
      return [
        { xMm: 0, yMm: 0 },
        { xMm: wMm, yMm: 0 },
        { xMm: wMm, yMm: hMm },
        { xMm: 0, yMm: hMm },
      ];
    case 'arch-top': {
      const rise = shape.riseMm;
      const r = archRadiusMm(rise, wMm);
      const cx = wMm / 2;
      const cy = r; // centre is R below the apex (apex touches y = 0)
      let a0 = Math.atan2(rise - cy, 0 - cx); // left springing
      const a1 = Math.atan2(rise - cy, wMm - cx); // right springing
      // Keep the sweep ABOVE the chord (angles in (−π, 0]): at the
      // semicircular limit atan2 yields +π for the left springing.
      if (a0 > 0) a0 -= 2 * Math.PI;
      const pts: PointMm[] = [];
      // Left springing → apex → right springing (clockwise on screen).
      for (let i = 0; i <= segs; i++) {
        const a = a0 + ((a1 - a0) * i) / segs;
        pts.push({ xMm: cx + r * Math.cos(a), yMm: cy + r * Math.sin(a) });
      }
      if (hMm > rise + 1e-9) {
        pts.push({ xMm: wMm, yMm: hMm });
        pts.push({ xMm: 0, yMm: hMm });
      } else {
        // rise === h: the arc springs straight off the sill ends.
        pts.push({ xMm: wMm, yMm: hMm });
        pts.push({ xMm: 0, yMm: hMm });
      }
      return pts;
    }
    case 'circle': {
      const r = Math.min(wMm, hMm) / 2;
      const pts: PointMm[] = [];
      for (let i = 0; i < segs; i++) {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / segs;
        pts.push({
          xMm: wMm / 2 + r * Math.cos(a),
          yMm: hMm / 2 + r * Math.sin(a),
        });
      }
      return pts;
    }
    case 'triangle':
      switch (shape.apex) {
        case 'left':
          return [
            { xMm: 0, yMm: 0 },
            { xMm: wMm, yMm: hMm },
            { xMm: 0, yMm: hMm },
          ];
        case 'right':
          return [
            { xMm: wMm, yMm: 0 },
            { xMm: wMm, yMm: hMm },
            { xMm: 0, yMm: hMm },
          ];
        default:
          return [
            { xMm: wMm / 2, yMm: 0 },
            { xMm: wMm, yMm: hMm },
            { xMm: 0, yMm: hMm },
          ];
      }
    case 'trapezoid':
      return [
        { xMm: 0, yMm: hMm - shape.leftHeightMm },
        { xMm: wMm, yMm: hMm - shape.rightHeightMm },
        { xMm: wMm, yMm: hMm },
        { xMm: 0, yMm: hMm },
      ];
  }
}

export type OutlineSegment =
  | { kind: 'line'; from: PointMm; to: PointMm }
  | {
      kind: 'arc';
      from: PointMm;
      to: PointMm;
      centerMm: PointMm;
      radiusMm: number;
      /** Sweep in radians, positive clockwise on screen. */
      sweepRad: number;
    };

/** Exact outline path (true arcs) for the renderer. Clockwise on screen. */
export function outlinePath(
  shape: FrameShape,
  wMm: number,
  hMm: number
): OutlineSegment[] {
  switch (shape.kind) {
    case 'arch-top': {
      const rise = shape.riseMm;
      const r = archRadiusMm(rise, wMm);
      const left: PointMm = { xMm: 0, yMm: rise };
      const right: PointMm = { xMm: wMm, yMm: rise };
      const bl: PointMm = { xMm: 0, yMm: hMm };
      const br: PointMm = { xMm: wMm, yMm: hMm };
      const segments: OutlineSegment[] = [
        {
          kind: 'arc',
          from: left,
          to: right,
          centerMm: { xMm: wMm / 2, yMm: r },
          radiusMm: r,
          sweepRad: archSweepRad(rise, wMm),
        },
      ];
      if (hMm > rise + 1e-9) {
        segments.push({ kind: 'line', from: right, to: br });
        segments.push({ kind: 'line', from: br, to: bl });
        segments.push({ kind: 'line', from: bl, to: left });
      } else {
        segments.push({ kind: 'line', from: right, to: left });
      }
      return segments;
    }
    case 'circle': {
      const r = Math.min(wMm, hMm) / 2;
      const top: PointMm = { xMm: wMm / 2, yMm: hMm / 2 - r };
      return [
        {
          kind: 'arc',
          from: top,
          to: top,
          centerMm: { xMm: wMm / 2, yMm: hMm / 2 },
          radiusMm: r,
          sweepRad: 2 * Math.PI,
        },
      ];
    }
    default: {
      const pts = shapeOutline(shape, wMm, hMm);
      return pts.map((p, i) => ({
        kind: 'line' as const,
        from: p,
        to: pts[(i + 1) % pts.length],
      }));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Areas                                                               */
/* ------------------------------------------------------------------ */

/** Signed-free polygon area (shoelace, absolute). */
export function polygonAreaMm2(points: PointMm[]): number {
  let acc = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    acc += a.xMm * b.yMm - b.xMm * a.yMm;
  }
  return Math.abs(acc) / 2;
}

/** Exact outline area of a shape in its w×h box (closed-form, no tessellation). */
export function shapeAreaMm2(
  shape: FrameShape,
  wMm: number,
  hMm: number
): number {
  switch (shape.kind) {
    case 'rect':
      return wMm * hMm;
    case 'arch-top':
      return wMm * (hMm - shape.riseMm) + circularSegmentAreaMm2(shape.riseMm, wMm);
    case 'circle': {
      const r = Math.min(wMm, hMm) / 2;
      return Math.PI * r * r;
    }
    case 'triangle':
      return (wMm * hMm) / 2;
    case 'trapezoid':
      return (wMm * (shape.leftHeightMm + shape.rightHeightMm)) / 2;
  }
}

/* ------------------------------------------------------------------ */
/* Convex offset & clipping                                            */
/* ------------------------------------------------------------------ */

/**
 * Inset a CONVEX polygon by `insetMm`: the intersection of every edge's
 * inward half-plane moved in by the inset (the polygon is clipped by each
 * offset edge line in turn). Exact for convex input, including corners
 * where short tessellation edges are swallowed by the inset (an arch's
 * springing); on a tessellated arc it converges to the concentric inner
 * arc. Throws when nothing is left (inset too large).
 */
export function insetConvexPolygon(
  points: PointMm[],
  insetMm: number
): PointMm[] {
  if (insetMm === 0) return points.map((p) => ({ ...p }));
  const n = points.length;
  if (n < 3) throw new DesignError('polygon needs >= 3 points');

  // Polygon orientation (shoelace sign) decides the inward normal side.
  let signed = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    signed += a.xMm * b.yMm - b.xMm * a.yMm;
  }
  const orient = Math.sign(signed) || 1;

  let out: PointMm[] = points.map((p) => ({ ...p }));
  for (let i = 0; i < n && out.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.xMm - a.xMm;
    const dy = b.yMm - a.yMm;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue; // skip zero-length edges
    // Inward normal: rotate the direction by ±90° depending on orientation.
    const nx = (orient * -dy) / len;
    const ny = (orient * dx) / len;
    // Signed distance of p inside the offset edge line (>= 0 = kept).
    const dist = (p: PointMm): number =>
      (p.xMm - a.xMm) * nx + (p.yMm - a.yMm) * ny - insetMm;
    const next: PointMm[] = [];
    for (let k = 0; k < out.length; k++) {
      const p = out[k];
      const q = out[(k + 1) % out.length];
      const dp = dist(p);
      const dq = dist(q);
      if (dp >= 0) next.push(p);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        next.push({
          xMm: p.xMm + (q.xMm - p.xMm) * t,
          yMm: p.yMm + (q.yMm - p.yMm) * t,
        });
      }
    }
    out = next;
  }
  // Drop coincident neighbours left by clips through a vertex.
  out = out.filter((p, k) => {
    const q = out[(k + 1) % out.length];
    return Math.hypot(p.xMm - q.xMm, p.yMm - q.yMm) > 1e-9;
  });
  if (out.length < 3 || polygonAreaMm2(out) < 1e-6) {
    throw new DesignError(`inset ${insetMm} mm collapses the polygon`);
  }
  return out;
}

/**
 * Clip a polygon to an axis-aligned rect (Sutherland–Hodgman). Returns []
 * when the intersection is empty. Convexity of the input keeps the result
 * convex; works on any simple polygon for rect clips.
 */
export function clipPolygonToRect(
  points: PointMm[],
  rect: RectMm
): PointMm[] {
  type Test = (p: PointMm) => boolean;
  type Lerp = (a: PointMm, b: PointMm) => PointMm;
  const x0 = rect.xMm;
  const y0 = rect.yMm;
  const x1 = rect.xMm + rect.wMm;
  const y1 = rect.yMm + rect.hMm;
  const planes: Array<[Test, Lerp]> = [
    [
      (p) => p.xMm >= x0,
      (a, b) => lerpAtX(a, b, x0),
    ],
    [
      (p) => p.xMm <= x1,
      (a, b) => lerpAtX(a, b, x1),
    ],
    [
      (p) => p.yMm >= y0,
      (a, b) => lerpAtY(a, b, y0),
    ],
    [
      (p) => p.yMm <= y1,
      (a, b) => lerpAtY(a, b, y1),
    ],
  ];
  let poly = points;
  for (const [inside, intersect] of planes) {
    if (!poly.length) return [];
    const next: PointMm[] = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const prev = poly[(i - 1 + poly.length) % poly.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) next.push(intersect(prev, cur));
        next.push(cur);
      } else if (prevIn) {
        next.push(intersect(prev, cur));
      }
    }
    poly = next;
  }
  return poly;
}

function lerpAtX(a: PointMm, b: PointMm, x: number): PointMm {
  const t = (x - a.xMm) / (b.xMm - a.xMm);
  return { xMm: x, yMm: a.yMm + (b.yMm - a.yMm) * t };
}

function lerpAtY(a: PointMm, b: PointMm, y: number): PointMm {
  const t = (y - a.yMm) / (b.yMm - a.yMm);
  return { xMm: a.xMm + (b.xMm - a.xMm) * t, yMm: y };
}

/**
 * The shape's DAYLIGHT polygon: the outline inset by the frame face.
 * Tessellated; density via `arcSegments`.
 */
export function daylightPolygon(
  shape: FrameShape,
  wMm: number,
  hMm: number,
  frameFaceMm: number = DEFAULT_FRAME_FACE_MM,
  opts?: OutlineOptions
): PointMm[] {
  return insetConvexPolygon(shapeOutline(shape, wMm, hMm, opts), frameFaceMm);
}

export interface PaneClip {
  leafId: string;
  /** The pane's real polygon = its rect ∩ the shape's daylight polygon. */
  polygonMm: PointMm[];
  areaMm2: number;
  /** True when the shape actually cut the rectangular pane. */
  clipped: boolean;
}

export interface ClipOptions extends LayoutOptions, OutlineOptions {}

/**
 * Clip the rectangular pane grid to the frame shape: each leaf's layout
 * rect intersected with the daylight polygon. This is what the renderer
 * fills and what glass pricing measures for shaped frames. For 'rect'
 * frames every pane comes back unclipped with area = w×h.
 */
export function clipPanesToShape(
  design: WindowDesign,
  opts?: ClipOptions
): PaneClip[] {
  const lay = layout(design, opts);
  const shape = design.frame.shape;
  if (shape.kind === 'rect') {
    return lay.leaves.map(({ leaf, rect }) => ({
      leafId: leaf.id,
      polygonMm: [
        { xMm: rect.xMm, yMm: rect.yMm },
        { xMm: rect.xMm + rect.wMm, yMm: rect.yMm },
        { xMm: rect.xMm + rect.wMm, yMm: rect.yMm + rect.hMm },
        { xMm: rect.xMm, yMm: rect.yMm + rect.hMm },
      ],
      areaMm2: rect.wMm * rect.hMm,
      clipped: false,
    }));
  }
  const daylight = daylightPolygon(
    shape,
    design.frame.widthMm,
    design.frame.heightMm,
    opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM,
    opts
  );
  return lay.leaves.map(({ leaf, rect }) => {
    const polygonMm = clipPolygonToRect(daylight, rect);
    const areaMm2 = polygonMm.length ? polygonAreaMm2(polygonMm) : 0;
    const rectArea = rect.wMm * rect.hMm;
    return {
      leafId: leaf.id,
      polygonMm,
      areaMm2,
      clipped: Math.abs(areaMm2 - rectArea) > 1e-3,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Frame members (cut lengths + mitres)                                */
/* ------------------------------------------------------------------ */

export interface FrameMember {
  role:
    | 'head'
    | 'sill'
    | 'jamb-left'
    | 'jamb-right'
    | 'slope'
    | 'arc'
    | 'ring';
  /** Outer cut length, mm (arc length for curved members). */
  lengthMm: number;
  /**
   * Mitre cut at each end, in degrees FROM SQUARE (half the outline's
   * interior angle; 45 = the standard rect mitre; 90 = a square butt cut;
   * null for a closed ring). Start/end follow the member's reading
   * direction: horizontal members left→right, vertical bottom→top,
   * slopes/arcs left→right.
   */
  mitreStartDeg: number | null;
  mitreEndDeg: number | null;
  curved?: { radiusMm: number; sweepDeg: number };
}

/** Interior angle (deg) at vertex b of a→b→c. */
function interiorDeg(a: PointMm, b: PointMm, c: PointMm): number {
  const v1x = a.xMm - b.xMm;
  const v1y = a.yMm - b.yMm;
  const v2x = c.xMm - b.xMm;
  const v2y = c.yMm - b.yMm;
  const dot = v1x * v2x + v1y * v2y;
  const l1 = Math.hypot(v1x, v1y);
  const l2 = Math.hypot(v2x, v2y);
  return (Math.acos(Math.min(1, Math.max(-1, dot / (l1 * l2)))) * 180) / Math.PI;
}

/**
 * The frame's profile members for a shape at w×h: one entry per outline
 * side with its exact cut length, curvature (radius + sweep for arcs) and
 * the mitre angle at each end. Hand-checkable: a rect gives 4 members all
 * mitred 45/45; a semicircular arch's jambs butt the arc square (90).
 */
export function frameMembers(
  shape: FrameShape,
  wMm: number,
  hMm: number
): FrameMember[] {
  switch (shape.kind) {
    case 'rect':
      return [
        { role: 'head', lengthMm: wMm, mitreStartDeg: 45, mitreEndDeg: 45 },
        { role: 'sill', lengthMm: wMm, mitreStartDeg: 45, mitreEndDeg: 45 },
        { role: 'jamb-left', lengthMm: hMm, mitreStartDeg: 45, mitreEndDeg: 45 },
        { role: 'jamb-right', lengthMm: hMm, mitreStartDeg: 45, mitreEndDeg: 45 },
      ];
    case 'circle': {
      const r = Math.min(wMm, hMm) / 2;
      return [
        {
          role: 'ring',
          lengthMm: 2 * Math.PI * r,
          mitreStartDeg: null,
          mitreEndDeg: null,
          curved: { radiusMm: r, sweepDeg: 360 },
        },
      ];
    }
    case 'arch-top': {
      const rise = shape.riseMm;
      const r = archRadiusMm(rise, wMm);
      const sweep = archSweepRad(rise, wMm);
      const sweepDeg = (sweep * 180) / Math.PI;
      // Interior angle where the arc meets a vertical jamb:
      // 90° + θ/2 (tangent–chord angle θ/2 above the horizontal chord).
      // Semicircle: 180° (tangential — square butt cut, mitre 90).
      const springDeg = 90 + sweepDeg / 2;
      const jambH = hMm - rise;
      const members: FrameMember[] = [
        {
          role: 'arc',
          lengthMm: r * sweep,
          mitreStartDeg: jambH > 1e-9 ? springDeg / 2 : sweepDeg / 4,
          mitreEndDeg: jambH > 1e-9 ? springDeg / 2 : sweepDeg / 4,
          curved: { radiusMm: r, sweepDeg },
        },
        { role: 'sill', lengthMm: wMm, mitreStartDeg: 45, mitreEndDeg: 45 },
      ];
      if (jambH > 1e-9) {
        members.push(
          {
            role: 'jamb-left',
            lengthMm: jambH,
            mitreStartDeg: 45,
            mitreEndDeg: springDeg / 2,
          },
          {
            role: 'jamb-right',
            lengthMm: jambH,
            mitreStartDeg: 45,
            mitreEndDeg: springDeg / 2,
          }
        );
      } else {
        // Arc springs straight from the sill: tangent–chord angle θ/2.
        members[1].mitreStartDeg = sweepDeg / 4;
        members[1].mitreEndDeg = sweepDeg / 4;
      }
      return members;
    }
    case 'triangle': {
      const pts = shapeOutline(shape, wMm, hMm); // [apex, bottom-right, bottom-left]
      const [apex, br, bl] = pts;
      const angleApex = interiorDeg(bl, apex, br);
      const angleBr = interiorDeg(apex, br, bl);
      const angleBl = interiorDeg(br, bl, apex);
      const members: FrameMember[] = [
        {
          role: 'sill',
          lengthMm: wMm,
          mitreStartDeg: angleBl / 2,
          mitreEndDeg: angleBr / 2,
        },
      ];
      if (shape.apex === 'left') {
        members.push(
          {
            role: 'jamb-left',
            lengthMm: hMm,
            mitreStartDeg: angleBl / 2,
            mitreEndDeg: angleApex / 2,
          },
          {
            role: 'slope',
            lengthMm: Math.hypot(br.xMm - apex.xMm, br.yMm - apex.yMm),
            mitreStartDeg: angleApex / 2,
            mitreEndDeg: angleBr / 2,
          }
        );
      } else if (shape.apex === 'right') {
        members.push(
          {
            role: 'slope',
            lengthMm: Math.hypot(apex.xMm - bl.xMm, apex.yMm - bl.yMm),
            mitreStartDeg: angleBl / 2,
            mitreEndDeg: angleApex / 2,
          },
          {
            role: 'jamb-right',
            lengthMm: hMm,
            mitreStartDeg: angleBr / 2,
            mitreEndDeg: angleApex / 2,
          }
        );
      } else {
        const slopeLen = Math.hypot(wMm / 2, hMm);
        members.push(
          {
            role: 'slope',
            lengthMm: slopeLen,
            mitreStartDeg: angleBl / 2,
            mitreEndDeg: angleApex / 2,
          },
          {
            role: 'slope',
            lengthMm: slopeLen,
            mitreStartDeg: angleApex / 2,
            mitreEndDeg: angleBr / 2,
          }
        );
      }
      return members;
    }
    case 'trapezoid': {
      const pts = shapeOutline(shape, wMm, hMm); // [tl, tr, br, bl]
      const [tl, tr, br, bl] = pts;
      const aTl = interiorDeg(bl, tl, tr);
      const aTr = interiorDeg(tl, tr, br);
      return [
        {
          role: 'slope',
          lengthMm: Math.hypot(tr.xMm - tl.xMm, tr.yMm - tl.yMm),
          mitreStartDeg: aTl / 2,
          mitreEndDeg: aTr / 2,
        },
        { role: 'sill', lengthMm: wMm, mitreStartDeg: 45, mitreEndDeg: 45 },
        {
          role: 'jamb-left',
          lengthMm: shape.leftHeightMm,
          mitreStartDeg: 45,
          mitreEndDeg: aTl / 2,
        },
        {
          role: 'jamb-right',
          lengthMm: shape.rightHeightMm,
          mitreStartDeg: 45,
          mitreEndDeg: aTr / 2,
        },
      ];
    }
  }
}
