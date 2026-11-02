/**
 * structure-model window shape — which panels can be a window, and the frame
 * a window of that panel has. A panel is a window when its outline is a
 * rectangle, a triangle on a flat base, or a trapezoid with upright sides:
 * the frame shapes the window designer has. Any other panel stays plain
 * glass. Pure.
 */

import { FRAME_MAX_MM, FRAME_MIN_MM, FrameShape } from '../design-model';
import { Face, Vec2 } from './types';

export interface WindowFrameSpec {
  widthMm: number;
  heightMm: number;
  shape: FrameShape;
}

const TOL = 1.5;
const near = (a: number, b: number): boolean => Math.abs(a - b) <= TOL;

/** The frame of the window a panel can be, or null when no window has its shape or size. */
export function windowFrameOf(face: Face): WindowFrameSpec | null {
  const o = face.outline;
  const w = Math.round(Math.max(...o.map((p) => p[0])) - Math.min(...o.map((p) => p[0])));
  const h = Math.round(Math.max(...o.map((p) => p[1])) - Math.min(...o.map((p) => p[1])));
  if (!(w >= FRAME_MIN_MM && w <= FRAME_MAX_MM && h >= FRAME_MIN_MM && h <= FRAME_MAX_MM)) return null;
  const x0 = Math.min(...o.map((p) => p[0]));
  const y0 = Math.min(...o.map((p) => p[1]));
  const pts = o.map((p): Vec2 => [p[0] - x0, p[1] - y0]);
  if (pts.length === 4) return quad(pts, w, h);
  if (pts.length === 3) return triangle(pts, w, h);
  return null;
}

/** A rectangle, or a trapezoid whose two upright sides stand on a flat base. */
function quad(pts: Vec2[], w: number, h: number): WindowFrameSpec | null {
  const left = pts.filter((p) => near(p[0], 0));
  const right = pts.filter((p) => near(p[0], w));
  if (left.length !== 2 || right.length !== 2) return null;
  const heights = [left, right].map((side) => side.map((p) => p[1]).sort((a, b) => a - b));
  // Both sides stand on the base.
  if (!near(heights[0][0], 0) || !near(heights[1][0], 0)) return null;
  const l = Math.round(heights[0][1]);
  const r = Math.round(heights[1][1]);
  if (Math.abs(l - r) <= TOL && near(l, h)) return { widthMm: w, heightMm: h, shape: { kind: 'rect' } };
  if (Math.min(l, r) < FRAME_MIN_MM || Math.max(l, r) !== h) return null;
  return { widthMm: w, heightMm: h, shape: { kind: 'trapezoid', leftHeightMm: l, rightHeightMm: r } };
}

/** A triangle on a flat base: right-angled at the left or the right, or with its point in the middle. */
function triangle(pts: Vec2[], w: number, h: number): WindowFrameSpec | null {
  const base = pts.filter((p) => near(p[1], 0));
  const apex = pts.find((p) => !near(p[1], 0));
  if (base.length !== 2 || !apex || !near(apex[1], h)) return null;
  const xs = base.map((p) => p[0]).sort((a, b) => a - b);
  if (!near(xs[0], 0) || !near(xs[1], w)) return null;
  if (near(apex[0], 0)) return { widthMm: w, heightMm: h, shape: { kind: 'triangle', apex: 'left' } };
  if (near(apex[0], w)) return { widthMm: w, heightMm: h, shape: { kind: 'triangle', apex: 'right' } };
  if (near(apex[0], w / 2)) return { widthMm: w, heightMm: h, shape: { kind: 'triangle', apex: 'isosceles' } };
  return null;
}

/** Why a panel is plain glass and not a window; '' when it can be a window. */
export function noWindowReason(face: Face): string {
  return windowFrameOf(face) ? '' : 'This panel has a shape or a size no window has, so it is plain glass.';
}
