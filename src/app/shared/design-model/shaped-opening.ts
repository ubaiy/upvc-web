/**
 * design-model: how a pane in a shaped frame (round, arched, sloped) can
 * OPEN. The sash of such a pane is made to the pane's own outline: straight
 * members where it meets a mullion, a transom or a straight frame member,
 * and a profile bent to the curve where it meets the curved frame.
 *
 * What decides the way it can be hung is the outline, so the rule lives
 * here and the views only show what it answers:
 *  - side-hung needs a straight upright side for the hinges;
 *  - top-hung / bottom-hung need a straight rail, or a full round (which
 *    tilts on two bearings at its lowest point);
 *  - a centre pivot needs an outline that is the same on both sides of the
 *    pivot axis (a full round, a half round across its chord);
 *  - sliding needs straight, level tracks, so never a curved or sloped pane.
 *
 * The sash geometry (offset outline, joints, hardware points) is in
 * shaped-sash.ts.
 */

import { DEFAULT_FRAME_FACE_MM, RectMm, layout } from './geometry';
import { ClipOptions, PointMm, clipPanesToShape } from './shape-geometry';
import { FrameShape, LeafNode, WindowDesign } from './types';

export type PaneSide = 'left' | 'right' | 'top' | 'bottom';

/** The straight run of one side of a pane, along that side (y for left / right, x for top / bottom). */
export interface StraightRun {
  fromMm: number;
  toMm: number;
  lengthMm: number;
}

/** A pane's real outline, with what is straight and what follows the frame. */
export interface PaneOutline {
  leafId: string;
  polygonMm: PointMm[];
  /** Bounding box of the outline. */
  box: RectMm;
  /** The straight side on each edge of the box, null where the outline is curved or sloped there. */
  sides: Record<PaneSide, StraightRun | null>;
  /** True when the frame shape cut the pane's rectangle. */
  cut: boolean;
  /** Part of the outline follows a curved frame member. */
  curved: boolean;
  /** Part of the outline follows a sloped frame member. */
  sloped: boolean;
  /** The outline is the same above and below the horizontal line through its middle. */
  symmetricAboutHorizontal: boolean;
  /** The outline is the same left and right of the vertical line through its middle. */
  symmetricAboutVertical: boolean;
}

/** A hinged side shorter than this cannot carry two hinges. */
export const HINGE_SIDE_MIN_MM = 300;
/** A top or bottom rail shorter than this cannot carry its hinges. */
export const HUNG_RAIL_MIN_MM = 200;

const ON_LINE_MM = 0.01;

/** Which box sides of a frame shape are straight frame members. */
function straightFrameSides(shape: FrameShape): Record<PaneSide, boolean> {
  switch (shape.kind) {
    case 'rect':
      return { left: true, right: true, top: true, bottom: true };
    case 'arch-top':
    case 'trapezoid':
      return { left: true, right: true, top: false, bottom: true };
    case 'triangle':
      return { left: shape.apex === 'left', right: shape.apex === 'right', top: false, bottom: true };
    default:
      return { left: false, right: false, top: false, bottom: false };
  }
}

export function boxOfPolygon(points: PointMm[]): RectMm {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.xMm);
    x1 = Math.max(x1, p.xMm);
    y0 = Math.min(y0, p.yMm);
    y1 = Math.max(y1, p.yMm);
  }
  return { xMm: x0, yMm: y0, wMm: x1 - x0, hMm: y1 - y0 };
}

/**
 * The run of polygon edges lying on the line x = coord (axis 'x') or
 * y = coord (axis 'y'), as an interval along the other axis; null when no
 * edge lies on it.
 */
export function runOnLine(
  points: PointMm[],
  axis: 'x' | 'y',
  coord: number,
  tolMm: number = ON_LINE_MM
): StraightRun | null {
  let from = Infinity;
  let to = -Infinity;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const ca = axis === 'x' ? a.xMm : a.yMm;
    const cb = axis === 'x' ? b.xMm : b.yMm;
    if (Math.abs(ca - coord) > tolMm || Math.abs(cb - coord) > tolMm) continue;
    const ta = axis === 'x' ? a.yMm : a.xMm;
    const tb = axis === 'x' ? b.yMm : b.xMm;
    from = Math.min(from, ta, tb);
    to = Math.max(to, ta, tb);
  }
  if (!(to - from > 1e-6)) return null;
  return { fromMm: from, toMm: to, lengthMm: to - from };
}

/** Distance from a point to the boundary of a polygon, and the nearest boundary point. */
export function nearestOnPolygon(points: PointMm[], p: PointMm): { point: PointMm; distMm: number } {
  let best: PointMm = points[0];
  let bestD = Infinity;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.xMm - a.xMm;
    const dy = b.yMm - a.yMm;
    const len2 = dx * dx + dy * dy;
    const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.xMm - a.xMm) * dx + (p.yMm - a.yMm) * dy) / len2));
    const q = { xMm: a.xMm + dx * t, yMm: a.yMm + dy * t };
    const d = Math.hypot(p.xMm - q.xMm, p.yMm - q.yMm);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return { point: best, distMm: bestD };
}

function mirrorsOnto(points: PointMm[], box: RectMm, axis: 'horizontal' | 'vertical'): boolean {
  const tol = Math.max(3, 0.004 * Math.max(box.wMm, box.hMm));
  const cx = box.xMm + box.wMm / 2;
  const cy = box.yMm + box.hMm / 2;
  return points.every((p) => {
    const m = axis === 'horizontal' ? { xMm: p.xMm, yMm: 2 * cy - p.yMm } : { xMm: 2 * cx - p.xMm, yMm: p.yMm };
    return nearestOnPolygon(points, m).distMm <= tol;
  });
}

/**
 * Describe one pane's outline. `rect` is the pane's layout rectangle,
 * `daylight` the frame's daylight box: a side of the pane is straight where
 * it lies on a mullion or transom (inside the daylight box) or on a straight
 * frame member.
 */
export function describeOutline(
  leafId: string,
  polygonMm: PointMm[],
  rect: RectMm,
  daylight: RectMm,
  shape: FrameShape,
  cut: boolean
): PaneOutline {
  const frameStraight = straightFrameSides(shape);
  const box = boxOfPolygon(polygonMm);
  const lines: Record<PaneSide, { axis: 'x' | 'y'; coord: number; onFrame: boolean }> = {
    left: { axis: 'x', coord: rect.xMm, onFrame: Math.abs(rect.xMm - daylight.xMm) < ON_LINE_MM },
    right: {
      axis: 'x',
      coord: rect.xMm + rect.wMm,
      onFrame: Math.abs(rect.xMm + rect.wMm - (daylight.xMm + daylight.wMm)) < ON_LINE_MM,
    },
    top: { axis: 'y', coord: rect.yMm, onFrame: Math.abs(rect.yMm - daylight.yMm) < ON_LINE_MM },
    bottom: {
      axis: 'y',
      coord: rect.yMm + rect.hMm,
      onFrame: Math.abs(rect.yMm + rect.hMm - (daylight.yMm + daylight.hMm)) < ON_LINE_MM,
    },
  };
  const sides = { left: null, right: null, top: null, bottom: null } as Record<PaneSide, StraightRun | null>;
  for (const side of ['left', 'right', 'top', 'bottom'] as PaneSide[]) {
    const l = lines[side];
    if (l.onFrame && !frameStraight[side]) continue;
    sides[side] = runOnLine(polygonMm, l.axis, l.coord);
  }
  const arcs = shape.kind === 'circle' || shape.kind === 'arch-top';
  return {
    leafId,
    polygonMm,
    box,
    sides,
    cut,
    curved: cut && arcs,
    sloped: cut && !arcs,
    symmetricAboutHorizontal: mirrorsOnto(polygonMm, box, 'horizontal'),
    symmetricAboutVertical: mirrorsOnto(polygonMm, box, 'vertical'),
  };
}

/** The outline of every pane that has glass, by leaf id. */
export function paneOutlines(design: WindowDesign, opts?: ClipOptions): Map<string, PaneOutline> {
  const lay = layout(design, { frameFaceMm: opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM });
  const rects = new Map(lay.leaves.map((l) => [l.leaf.id, l.rect]));
  const out = new Map<string, PaneOutline>();
  for (const clip of clipPanesToShape(design, opts)) {
    const rect = rects.get(clip.leafId);
    if (!rect || clip.polygonMm.length < 3 || clip.areaMm2 < 1) continue;
    out.set(
      clip.leafId,
      describeOutline(clip.leafId, clip.polygonMm, rect, lay.daylight, design.frame.shape, clip.clipped)
    );
  }
  return out;
}

/** A pane with no straight side at all and the same all round: a full round (or oval). */
export function isFullRound(o: PaneOutline): boolean {
  return (
    o.curved &&
    !o.sides.left &&
    !o.sides.right &&
    !o.sides.top &&
    !o.sides.bottom &&
    o.symmetricAboutHorizontal &&
    o.symmetricAboutVertical
  );
}

/* ------------------------------------------------------------------ */
/* The ways a pane can open                                            */
/* ------------------------------------------------------------------ */

export type OpeningKind =
  | 'Left'
  | 'Right'
  | 'Top'
  | 'Bottom'
  | 'Tilt & Turn Left'
  | 'Tilt & Turn Right'
  | 'Pivot Horizontal'
  | 'Pivot Vertical';

export interface OpeningChoice {
  kind: OpeningKind;
  label: string;
  allowed: boolean;
  /** For a kind that is not offered: what this way of opening needs. */
  hint: string;
}

const RECT_KINDS: OpeningKind[] = ['Left', 'Right', 'Top', 'Bottom', 'Tilt & Turn Left', 'Tilt & Turn Right'];

const long = (run: StraightRun | null, min: number): boolean => !!run && run.lengthMm >= min;

/**
 * Every way of opening, with whether this outline can carry it. A pane the
 * shape does not cut is an ordinary rectangle: the six ordinary ways, as
 * they were.
 */
export function openingChoices(o: PaneOutline): OpeningChoice[] {
  if (!o.cut) return RECT_KINDS.map((kind) => ({ kind, label: kind, allowed: true, hint: '' }));
  const left = long(o.sides.left, HINGE_SIDE_MIN_MM);
  const right = long(o.sides.right, HINGE_SIDE_MIN_MM);
  const top = long(o.sides.top, HUNG_RAIL_MIN_MM);
  const bottom = long(o.sides.bottom, HUNG_RAIL_MIN_MM);
  const round = isFullRound(o);
  const upright = (side: string): string =>
    `Hinges need a straight upright side at least ${HINGE_SIDE_MIN_MM} mm long on the ${side}.`;
  const choice = (kind: OpeningKind, label: string, allowed: boolean, hint: string): OpeningChoice => ({
    kind,
    label,
    allowed,
    hint: allowed ? '' : hint,
  });
  return [
    choice('Left', 'Side-hung, hinges left', left, upright('left')),
    choice('Right', 'Side-hung, hinges right', right, upright('right')),
    choice('Top', 'Top-hung', top, `Top-hung needs a straight top rail at least ${HUNG_RAIL_MIN_MM} mm long.`),
    choice(
      'Bottom',
      round ? 'Tilt (bottom-hung on two bearings)' : 'Bottom-hung (tilt)',
      bottom || round,
      `Bottom-hung needs a straight bottom rail at least ${HUNG_RAIL_MIN_MM} mm long, or a full round.`
    ),
    choice(
      'Tilt & Turn Left',
      'Tilt & turn, hinges left',
      left && bottom,
      'Tilt and turn needs a straight upright side on the left and a straight bottom rail.'
    ),
    choice(
      'Tilt & Turn Right',
      'Tilt & turn, hinges right',
      right && bottom,
      'Tilt and turn needs a straight upright side on the right and a straight bottom rail.'
    ),
    choice(
      'Pivot Horizontal',
      'Centre pivot, horizontal axis',
      o.symmetricAboutHorizontal,
      'A horizontal centre pivot needs an outline that is the same above and below the pivot line.'
    ),
    choice(
      'Pivot Vertical',
      'Centre pivot, vertical axis',
      o.symmetricAboutVertical,
      'A vertical centre pivot needs an outline that is the same left and right of the pivot line.'
    ),
  ];
}

/**
 * What a pane becomes when the user makes it open: a full round pivots on
 * its centre; a pane with a straight upright side is side-hung on it (the
 * longer one); then a straight rail, then a pivot. Null when the outline can
 * carry none (a sliver with no side long enough for hinges).
 */
export function defaultOpeningKind(o: PaneOutline): OpeningKind | null {
  if (!o.cut) return 'Left';
  const allowed = new Set(
    openingChoices(o)
      .filter((c) => c.allowed)
      .map((c) => c.kind)
  );
  if (isFullRound(o) && allowed.has('Pivot Horizontal')) return 'Pivot Horizontal';
  if (allowed.has('Left') && allowed.has('Right')) {
    return o.sides.right!.lengthMm > o.sides.left!.lengthMm + 1e-6 ? 'Right' : 'Left';
  }
  for (const kind of ['Left', 'Right', 'Bottom', 'Top', 'Pivot Horizontal', 'Pivot Vertical'] as OpeningKind[]) {
    if (allowed.has(kind)) return kind;
  }
  return null;
}

/** Said when no way of opening fits the outline (see defaultOpeningKind). */
export const NO_OPENING_FOR_OUTLINE =
  `A sash in this pane has nowhere to be hung: no straight side of ${HINGE_SIDE_MIN_MM} mm for hinges, ` +
  'and its outline is not the same on both sides of a pivot line. Make the pane larger or move a mullion.';

/** Why sliding is not offered in a curved or sloped pane (a property of sliding). */
export const SLIDING_NEEDS_STRAIGHT_TRACK =
  'Sliding runs on a straight, level track top and bottom, so it is offered in a rectangular pane only: ' +
  'this pane follows the frame shape.';

export function slidingAllowed(o: PaneOutline): boolean {
  return !o.cut;
}

/** The kind a leaf's opening is saved as (a pivot is kept beside the direction the api knows). */
export function storedOpeningKind(leaf: LeafNode): OpeningKind {
  if (leaf.opening?.pivot === 'horizontal') return 'Pivot Horizontal';
  if (leaf.opening?.pivot === 'vertical') return 'Pivot Vertical';
  const dir = (leaf.opening?.direction || 'Left').toLowerCase();
  if (dir.startsWith('tilt')) return dir.includes('right') ? 'Tilt & Turn Right' : 'Tilt & Turn Left';
  return dir === 'right' ? 'Right' : dir === 'top' ? 'Top' : dir === 'bottom' ? 'Bottom' : 'Left';
}

/**
 * How an opening pane is drawn: as saved when its outline can carry that,
 * else the default for the outline (an older document, or a frame whose
 * shape was changed afterwards, is not rewritten). Null = cannot be hung.
 */
export function effectiveOpeningKind(leaf: LeafNode, o: PaneOutline): OpeningKind | null {
  const stored = storedOpeningKind(leaf);
  if (!o.cut) return stored;
  const match = openingChoices(o).find((c) => c.kind === stored);
  return match?.allowed ? stored : defaultOpeningKind(o);
}

/**
 * The saved form of a kind: `direction` stays one of the values the api
 * already receives (a pivot keeps the direction it had, 'Left' by default,
 * and is marked by `pivot`), so the price payload is what it was.
 */
export function openingSpecFor(
  kind: OpeningKind,
  leaf: LeafNode
): { direction: string; pivot?: 'horizontal' | 'vertical' } {
  if (kind === 'Pivot Horizontal' || kind === 'Pivot Vertical') {
    return {
      direction: leaf.opening?.direction ?? 'Left',
      pivot: kind === 'Pivot Horizontal' ? 'horizontal' : 'vertical',
    };
  }
  return { direction: kind };
}

/** True when the pane's outline goes down to the floor line of the frame (a door leaf can stand in it). */
export function reachesFloor(o: PaneOutline, daylight: RectMm): boolean {
  return Math.abs(o.box.yMm + o.box.hMm - (daylight.yMm + daylight.hMm)) < 5;
}
