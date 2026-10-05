/**
 * structure-model derive — everything read off a Structure: panel shapes and
 * sizes, areas, bar lengths, the summary that is the first form of the parts
 * list. Pure. All sizes are geometric centre-line sizes on the system lines;
 * workshop cut sizes (allowances, end cuts) come with the catalogue rows.
 */

import { barSection, hubLabel } from './bar-sections';
import { faceCorners, faceNormal } from './builder';
import { Face, Joint, Structure, Vec2, Vec3 } from './types';
import { area2, dist, dot } from './vec';

export type PanelShape = 'triangle' | 'rectangle' | 'trapezoid' | 'quad' | 'polygon';

export const SHAPE_LABEL: Record<PanelShape, string> = {
  triangle: 'Triangle',
  rectangle: 'Rectangle',
  trapezoid: 'Trapezoid',
  quad: 'Four-sided',
  polygon: 'Polygon',
};

export const faceAreaSqMm = (face: Face): number => Math.abs(area2(face.outline));

export function faceEdgesMm(face: Face): number[] {
  const o = face.outline;
  return o.map((p, i) => Math.hypot(o[(i + 1) % o.length][0] - p[0], o[(i + 1) % o.length][1] - p[1]));
}

const edgeDir = (o: Vec2[], i: number): Vec2 => {
  const p = o[i];
  const q = o[(i + 1) % o.length];
  const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
};
const parallel = (a: Vec2, b: Vec2): boolean => Math.abs(a[0] * b[1] - a[1] * b[0]) < 1e-4;
const square = (a: Vec2, b: Vec2): boolean => Math.abs(a[0] * b[0] + a[1] * b[1]) < 1e-4;

export function faceShape(face: Face): PanelShape {
  const o = face.outline;
  if (o.length === 3) return 'triangle';
  if (o.length !== 4) return 'polygon';
  const d = [0, 1, 2, 3].map((i) => edgeDir(o, i));
  const p02 = parallel(d[0], d[2]);
  const p13 = parallel(d[1], d[3]);
  if (p02 && p13 && square(d[0], d[1])) return 'rectangle';
  return p02 || p13 ? 'trapezoid' : 'quad';
}

/** The sizes a fabricator reads for one panel, mm, in a fixed order per shape. */
export interface PanelSize {
  shape: PanelShape;
  /** rectangle: [width, height]; triangle: [base, side, side]; trapezoid: [long parallel, short parallel, side, side]; else the edges in order. */
  edges: number[];
  /** Distance between the parallel sides (trapezoid), base to apex (triangle), height (rectangle); 0 otherwise. */
  heightMm: number;
  text: string;
}

export function panelSize(face: Face): PanelSize {
  const shape = faceShape(face);
  const e = faceEdgesMm(face).map((v) => Math.round(v));
  const area = faceAreaSqMm(face);
  if (shape === 'rectangle') {
    // Width along the face's u axis: the first edge that runs along u.
    const along = Math.abs(edgeDir(face.outline, 0)[0]) > 0.5 ? 0 : 1;
    const w = e[along];
    const h = e[along + 1];
    return { shape, edges: [w, h], heightMm: h, text: `${w} × ${h}` };
  }
  if (shape === 'triangle') {
    const base = Math.max(...e);
    const i = e.indexOf(base);
    const sides = [e[(i + 1) % 3], e[(i + 2) % 3]];
    const height = Math.round((2 * area) / (faceEdgesMm(face)[i] || 1));
    return { shape, edges: [base, ...sides], heightMm: height, text: `base ${base}, sides ${sides[0]} / ${sides[1]}, height ${height}` };
  }
  if (shape === 'trapezoid') {
    const d = [0, 1, 2, 3].map((k) => edgeDir(face.outline, k));
    const i = parallel(d[0], d[2]) ? 0 : 1;
    const long = Math.max(e[i], e[i + 2]);
    const short = Math.min(e[i], e[i + 2]);
    const sides = [e[(i + 1) % 4], e[(i + 3) % 4]];
    const exact = faceEdgesMm(face);
    const height = Math.round((2 * area) / (exact[i] + exact[i + 2] || 1));
    return { shape, edges: [long, short, ...sides], heightMm: height, text: `${long} / ${short} parallel, sides ${sides[0]} / ${sides[1]}, height ${height}` };
  }
  return { shape, edges: e, heightMm: 0, text: e.join(' / ') };
}

export const jointLengthMm = (joint: Joint): number => dist(joint.a, joint.b);

/** Angle of a roof face to the horizontal, degrees (0 = flat, 90 = a wall). */
export function roofPitchDeg(face: Face): number {
  return (Math.acos(Math.min(1, Math.abs(faceNormal(face)[1]))) * 180) / Math.PI;
}

/** Angle between two faces across their joint, degrees: 180 = flat, 90 = a square corner. */
export function dihedralDeg(a: Face, b: Face): number {
  const c = Math.max(-1, Math.min(1, dot(faceNormal(a), faceNormal(b))));
  return 180 - (Math.acos(c) * 180) / Math.PI;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export function bounds(structure: Structure): Bounds {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const take = (p: Vec3): void => {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  };
  structure.faces.forEach((f) => faceCorners(f).forEach(take));
  structure.joints.forEach((j) => {
    take(j.a);
    take(j.b);
  });
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

export type FillKey = 'fixed' | 'casement' | 'top-hung' | 'door' | 'panel' | 'open';

export const FILL_LABEL: Record<FillKey, string> = {
  fixed: 'Fixed glass',
  casement: 'Casement (side-hung)',
  'top-hung': 'Top-hung vent',
  door: 'Door',
  panel: 'Solid panel',
  open: 'Open (no infill)',
};

export function fillKey(face: Face): FillKey {
  const f = face.fill;
  if (f.kind === 'design') return f.opening;
  return f.kind === 'glass' ? 'fixed' : f.kind;
}

export const isGlazed = (face: Face): boolean => face.fill.kind === 'glass' || face.fill.kind === 'design';

export interface PanelRow {
  shape: PanelShape;
  fill: FillKey;
  count: number;
  size: PanelSize;
  areaSqM: number;
  faceIds: string[];
}

export interface BarRow {
  role: string;
  label: string;
  count: number;
  totalMm: number;
  /** Distinct lengths, longest first. */
  lengths: { mm: number; qty: number }[];
}

export interface Summary {
  overall: { widthMm: number; depthMm: number; heightMm: number };
  panelCount: number;
  panels: PanelRow[];
  glassAreaSqM: number;
  solidAreaSqM: number;
  bars: BarRow[];
  barCount: number;
  barTotalMm: number;
  hubs: { role: string; label: string; count: number }[];
  hubCount: number;
  cornerPosts: number;
}

const sqm = (sqmm: number): number => Math.round(sqmm / 10000) / 100;

export function summarize(structure: Structure): Summary {
  const rows = new Map<string, PanelRow>();
  let glass = 0;
  let solid = 0;
  for (const face of structure.faces) {
    const size = panelSize(face);
    const fill = fillKey(face);
    const area = faceAreaSqMm(face);
    if (isGlazed(face)) glass += area;
    if (face.fill.kind === 'panel') solid += area;
    // Mirror-image panels have the same sizes in another order: one row.
    const key = `${size.shape}|${fill}|${[...size.edges].sort((a, b) => a - b).join(',')}`;
    const row = rows.get(key);
    if (row) {
      row.count++;
      row.faceIds.push(face.id);
    } else {
      rows.set(key, { shape: size.shape, fill, count: 1, size, areaSqM: sqm(area), faceIds: [face.id] });
    }
  }

  const bars = new Map<string, BarRow & { byLength: Map<number, number> }>();
  for (const joint of structure.joints) {
    const mm = Math.round(jointLengthMm(joint));
    let row = bars.get(joint.role);
    if (!row) {
      row = { role: joint.role, label: barSection(joint.role).label, count: 0, totalMm: 0, lengths: [], byLength: new Map() };
      bars.set(joint.role, row);
    }
    row.count++;
    row.totalMm += mm;
    row.byLength.set(mm, (row.byLength.get(mm) ?? 0) + 1);
  }
  const barRows: BarRow[] = [...bars.values()].map(({ byLength, ...row }) => ({
    ...row,
    lengths: [...byLength.entries()].sort((a, b) => b[0] - a[0]).map(([mm, qty]) => ({ mm, qty })),
  }));

  const hubs = new Map<string, number>();
  structure.hubs.forEach((h) => hubs.set(h.role, (hubs.get(h.role) ?? 0) + 1));
  const box = bounds(structure);
  return {
    overall: {
      widthMm: Math.round(box.max[0] - box.min[0]),
      depthMm: Math.round(box.max[2] - box.min[2]),
      heightMm: Math.round(box.max[1]),
    },
    panelCount: structure.faces.length,
    panels: [...rows.values()].sort((a, b) => b.count - a.count || b.areaSqM - a.areaSqM),
    glassAreaSqM: sqm(glass),
    solidAreaSqM: sqm(solid),
    bars: barRows,
    barCount: structure.joints.length,
    barTotalMm: barRows.reduce((s, r) => s + r.totalMm, 0),
    hubs: [...hubs.entries()].map(([role, count]) => ({ role, label: hubLabel(role), count })),
    hubCount: structure.hubs.length,
    cornerPosts: structure.joints.filter((j) => j.role === 'corner_post').length,
  };
}
