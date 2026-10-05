/** structure-model vec — the few vector operations the generators need. Pure. */

import { Vec2, Vec3 } from './types';

export const EPS = 1e-6;
export const DEG = Math.PI / 180;

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));
export const mid = (a: Vec3, b: Vec3): Vec3 => lerp(a, b, 0.5);

export function unit(a: Vec3): Vec3 {
  const l = len(a);
  return l < EPS ? [0, 0, 0] : scale(a, 1 / l);
}

/** Newell normal of a polygon (not unit); robust for any flat polygon. */
export function polygonNormal(pts: Vec3[]): Vec3 {
  let n: Vec3 = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    n = add(n, [(p[1] - q[1]) * (p[2] + q[2]), (p[2] - q[2]) * (p[0] + q[0]), (p[0] - q[0]) * (p[1] + q[1])]);
  }
  return n;
}

export function centroid(pts: Vec3[]): Vec3 {
  let c: Vec3 = [0, 0, 0];
  for (const p of pts) c = add(c, p);
  return scale(c, 1 / Math.max(1, pts.length));
}

/** Area of a 2D polygon; positive when anticlockwise. */
export function area2(outline: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i];
    const q = outline[(i + 1) % outline.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** A stable text key of a point, to the tenth of a millimetre. */
export const pointKey = (p: Vec3): string => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)},${Math.round(p[2] * 10)}`;

/** Key of an undirected edge. */
export function edgeKey(a: Vec3, b: Vec3): string {
  const ka = pointKey(a);
  const kb = pointKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/** True when p lies on the segment a–b (within tol mm). */
export function onSegment(p: Vec3, a: Vec3, b: Vec3, tol = 0.05): boolean {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return dist(p, a) <= tol;
  const t = dot(sub(p, a), ab) / l2;
  if (t < -1e-4 || t > 1 + 1e-4) return false;
  return dist(p, add(a, scale(ab, t))) <= tol;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const round1 = (v: number): number => Math.round(v * 10) / 10;
