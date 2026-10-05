/**
 * design-3d window parts — WindowDesign in, a description of meshes out.
 * Pure: no three.js, no Angular, no DOM. The 3D view only uploads what this
 * returns, and the specs check it without a GPU.
 *
 * It reads the SAME layout() and shape geometry the 2D canvas and the
 * pricing payload use, so the three cannot disagree. Nothing is stored: the
 * document stays the only state of a window.
 *
 * Face-local millimetres: x along the sill (left to right seen from
 * outside), y up, z = the outward normal. The frame's outside face is z = 0
 * and its depth runs to z = −depthMm.
 */

import {
  LeafNode,
  PointMm,
  WindowDesign,
  clipPanesToShape,
  clipPolygonToRect,
  daylightPolygon,
  findNode,
  insetConvexPolygon,
  isLeaf,
  layout,
  outlinePath,
  slideLayout,
  walkLeaves,
} from '../design-model';
import { DEFAULT_FRAME_FACE_MM, RectMm } from '../design-model/geometry';
import { Geo, P2, boxGeo, extrudePolygon, sweepSection } from './member-mesh';
import {
  OPEN_LIMITS_DEG,
  ProfileSection,
  SECTION_DATA as S,
  WINDOW_CASEMENT_OPENS_OUT,
  boxSection,
  frameSection,
  rebatedSection,
  slidingFrameDepthMm,
  trackCentreMm,
} from './profile-section';

export type PartRole =
  | 'frame'
  | 'divider'
  | 'sash'
  | 'glass'
  | 'mesh'
  | 'glazing-bar'
  | 'rail'
  | 'threshold'
  | 'handle';

export type PartMaterial = 'profile' | 'glass' | 'mesh' | 'hardware';

export interface MeshPart extends Geo {
  id: string;
  role: PartRole;
  material: PartMaterial;
  /** The moving group this part belongs to; null = fixed to the frame. */
  groupId: string | null;
}

/** A sash that opens (turns about `axis` through `pivot`) or a shutter that slides along `axis`. */
export interface MovingGroup {
  id: string;
  leafId: string;
  kind: 'hinge' | 'slide';
  pivot: [number, number, number];
  axis: [number, number, number];
  /** Fully open: signed radians (hinge) or signed mm (slide). */
  travel: number;
}

export interface WindowParts {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  parts: MeshPart[];
  groups: MovingGroup[];
}

export interface PartsOptions {
  /** Outer frame face width; the same value the 2D layout is given. */
  frameFaceMm?: number;
  /** Tessellation of a full circle; an arc takes its share. */
  arcSegments?: number;
}

const CORNER_TURN_RAD = (20 * Math.PI) / 180;

interface Ctx {
  design: WindowDesign;
  h: number;
  f: number;
  parts: MeshPart[];
  groups: MovingGroup[];
}

const up = (ctx: Ctx, p: PointMm): P2 => ({ x: p.xMm, y: ctx.h - p.yMm });

function add(ctx: Ctx, id: string, role: PartRole, material: PartMaterial, groupId: string | null, geo: Geo): void {
  if (geo.positions.length) ctx.parts.push({ id, role, material, groupId, ...geo });
}

function rectPoly(r: RectMm): PointMm[] {
  return [
    { xMm: r.xMm, yMm: r.yMm },
    { xMm: r.xMm + r.wMm, yMm: r.yMm },
    { xMm: r.xMm + r.wMm, yMm: r.yMm + r.hMm },
    { xMm: r.xMm, yMm: r.yMm + r.hMm },
  ];
}

function boxOf(poly: PointMm[]): RectMm {
  const xs = poly.map((p) => p.xMm);
  const ys = poly.map((p) => p.yMm);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { xMm: x, yMm: y, wMm: Math.max(...xs) - x, hMm: Math.max(...ys) - y };
}

function inset(poly: PointMm[], mm: number): PointMm[] {
  try {
    return insetConvexPolygon(poly, mm);
  } catch {
    return [];
  }
}

/** Corners of a loop: where the direction turns by more than 20°. */
function cornerBreaks(pts: P2[]): boolean[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const turn = Math.atan2(b.y - p.y, b.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x);
    return Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > CORNER_TURN_RAD;
  });
}

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */

/** The outline as a path with one break per outline corner; arcs are tessellated. */
function framePath(ctx: Ctx, arcSegments: number): { pts: P2[]; breaks: boolean[] } {
  const { widthMm, heightMm, shape } = ctx.design.frame;
  const segs = outlinePath(shape, widthMm, heightMm);
  const ring = segs.length === 1;
  const pts: P2[] = [];
  const breaks: boolean[] = [];
  for (const seg of segs) {
    pts.push(up(ctx, seg.from));
    breaks.push(!ring);
    if (seg.kind !== 'arc') continue;
    // An even count puts a vertex on the crown, so an arch touches the top of its frame box.
    const n = 2 * Math.max(4, Math.ceil((arcSegments * seg.sweepRad) / (4 * Math.PI)));
    const a0 = Math.atan2(seg.from.yMm - seg.centerMm.yMm, seg.from.xMm - seg.centerMm.xMm);
    for (let i = 1; i < n; i++) {
      const a = a0 + (seg.sweepRad * i) / n;
      pts.push(
        up(ctx, {
          xMm: seg.centerMm.xMm + seg.radiusMm * Math.cos(a),
          yMm: seg.centerMm.yMm + seg.radiusMm * Math.sin(a),
        })
      );
      breaks.push(false);
    }
  }
  return { pts, breaks };
}

function buildFrame(ctx: Ctx, section: ProfileSection, arcSegments: number): void {
  const { widthMm: w, heightMm: h, shape } = ctx.design.frame;
  const threshold = ctx.design.productType === 'Door' ? ctx.design.door?.threshold : undefined;
  let bars: Geo[];
  if (shape.kind === 'rect' && threshold && threshold !== 'Standard') {
    // A door without a full sill: two jambs and a head, square at the floor.
    bars = sweepSection(
      [
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
        { x: 0, y: 0 },
      ],
      section,
      { closed: false, zOutside: 0 }
    );
    if (threshold === 'Low') {
      const low = boxGeo(ctx.f, 0, w - ctx.f, S.lowThresholdHeightMm, 0, -section.depthMm);
      add(ctx, 'threshold', 'threshold', 'hardware', null, low);
    }
  } else {
    const path = framePath(ctx, arcSegments);
    bars = sweepSection(path.pts, section, { closed: true, zOutside: 0, breaks: path.breaks });
  }
  bars.forEach((geo, i) => add(ctx, `frame-${i}`, 'frame', 'profile', null, geo));
}

/* ------------------------------------------------------------------ */
/* Panes                                                               */
/* ------------------------------------------------------------------ */

function glassSlab(ctx: Ctx, id: string, groupId: string | null, poly: PointMm[], zCentre: number): void {
  if (poly.length < 3) return;
  const t = S.glassThicknessMm / 2;
  add(ctx, id, 'glass', 'glass', groupId, extrudePolygon(poly.map((p) => up(ctx, p)), zCentre + t, zCentre - t));
  const { barsH, barsV } = ctx.design.glazing;
  if (!barsH && !barsV) return;
  const box = boxOf(poly);
  const half = S.glazingBar.faceMm / 2;
  const zF = zCentre + t + S.glazingBar.proudMm;
  const zB = zCentre - t - S.glazingBar.proudMm;
  const bar = (r: RectMm, key: string): void => {
    const clip = clipPolygonToRect(poly, r).map((p) => up(ctx, p));
    add(ctx, `${id}-bar-${key}`, 'glazing-bar', 'profile', groupId, extrudePolygon(clip, zF, zB));
  };
  for (let i = 1; i <= barsV; i++) {
    const x = box.xMm + (box.wMm * i) / (barsV + 1);
    bar({ xMm: x - half, yMm: box.yMm, wMm: 2 * half, hMm: box.hMm }, `v${i}`);
  }
  for (let i = 1; i <= barsH; i++) {
    const y = box.yMm + (box.hMm * i) / (barsH + 1);
    bar({ xMm: box.xMm, yMm: y - half, wMm: box.wMm, hMm: 2 * half }, `h${i}`);
  }
}

/** A sash: one mitred bar per side of `poly`, and the glass it holds. */
function sashWithGlass(
  ctx: Ctx,
  id: string,
  groupId: string | null,
  poly: PointMm[],
  section: ProfileSection,
  zOutside: number
): void {
  const pts = poly.map((p) => up(ctx, p));
  const bars = sweepSection(pts, section, { closed: true, zOutside, breaks: cornerBreaks(pts) });
  bars.forEach((geo, i) => add(ctx, `${id}-sash-${i}`, 'sash', 'profile', groupId, geo));
  const glass = inset(poly, section.faceMm - S.glassBiteMm);
  glassSlab(ctx, `${id}-glass`, groupId, glass, zOutside - section.depthMm / 2);
}

function doorLeafIds(design: WindowDesign): Set<string> {
  const out = new Set<string>();
  if (design.productType !== 'Door' || !design.door) return out;
  const node = findNode(design.root, design.door.doorNodeId);
  if (node) walkLeaves(node).forEach((l) => out.add(l.id));
  return out;
}

type Hang = 'left' | 'right' | 'top' | 'bottom';

function hangOf(leaf: LeafNode): { side: Hang; tilt: boolean } {
  const dir = (leaf.opening?.direction || 'Left').toLowerCase();
  if (dir.startsWith('tilt')) return { side: dir.includes('right') ? 'right' : 'left', tilt: true };
  return { side: dir === 'right' || dir === 'top' || dir === 'bottom' ? dir : 'left', tilt: false };
}

function buildCasementLeaf(ctx: Ctx, leaf: LeafNode, pane: PointMm[], isDoor: boolean): void {
  const opens = leaf.casementType === 'Openable';
  const zMid = -S.casementFrameDepthMm / 2;
  if (!opens && !leaf.sashFramed) {
    glassSlab(ctx, `${leaf.id}-glass`, null, pane, zMid);
    return;
  }
  let poly = pane;
  const threshold = ctx.design.door?.threshold;
  if (isDoor && threshold && threshold !== 'Standard') {
    // The leaf runs down to the low threshold (or the floor) instead of a full sill.
    const floor = ctx.h - (threshold === 'Low' ? S.lowThresholdHeightMm : 0) - 4;
    const bottom = Math.max(...pane.map((p) => p.yMm));
    poly = pane.map((p) => (Math.abs(p.yMm - bottom) < 1e-6 ? { xMm: p.xMm, yMm: floor } : p));
  }
  const size = isDoor ? S.doorSash : S.sash;
  const section = rebatedSection(size.faceMm, size.depthMm);
  const zOutside = -(S.casementFrameDepthMm - size.depthMm) / 2;
  const groupId = opens ? `open-${leaf.id}` : null;
  sashWithGlass(ctx, leaf.id, groupId, poly, section, zOutside);
  if (!opens || !groupId) return;

  const box = boxOf(poly);
  const x0 = box.xMm;
  const x1 = box.xMm + box.wMm;
  const yTop = ctx.h - box.yMm;
  const yBottom = ctx.h - (box.yMm + box.hMm);
  const { side, tilt } = hangOf(leaf);
  const out = isDoor
    ? ctx.design.door?.swing === 'Out'
    : !tilt && side !== 'bottom' && WINDOW_CASEMENT_OPENS_OUT;
  const zPivot = out ? zOutside : zOutside - section.depthMm;
  const sideways = side === 'left' || side === 'right';
  const limit = sideways ? OPEN_LIMITS_DEG.side : side === 'top' ? OPEN_LIMITS_DEG.top : OPEN_LIMITS_DEG.bottom;
  // Sign of the turn that takes the free edge outwards (+z), per hanging side.
  const outSign = side === 'left' || side === 'top' ? -1 : 1;
  ctx.groups.push({
    id: groupId,
    leafId: leaf.id,
    kind: 'hinge',
    pivot: [side === 'right' ? x1 : x0, side === 'top' ? yTop : yBottom, zPivot],
    axis: sideways ? [0, 1, 0] : [1, 0, 0],
    travel: ((out ? outSign : -outSign) * limit * Math.PI) / 180,
  });

  // Handle on the room side of the bar opposite the hinges (a door has one on each face).
  const hd = S.handle;
  const cx = side === 'left' ? x1 - size.faceMm / 2 : side === 'right' ? x0 + size.faceMm / 2 : (x0 + x1) / 2;
  const cy = sideways ? (yTop + yBottom) / 2 : side === 'top' ? yBottom + size.faceMm / 2 : yTop - size.faceMm / 2;
  const reach = side === 'left' ? -hd.leverLMm : hd.leverLMm;
  const faces: [number, number][] = [[zOutside - section.depthMm, -1]];
  if (isDoor) faces.push([zOutside, 1]);
  faces.forEach(([z, s], i) => {
    const plate = boxGeo(cx - hd.plateWMm / 2, cy - hd.plateHMm / 2, cx + hd.plateWMm / 2, cy + hd.plateHMm / 2, z, z + s * hd.plateDMm);
    const lever = boxGeo(
      Math.min(cx, cx + reach),
      cy - hd.leverWMm / 2,
      Math.max(cx, cx + reach),
      cy + hd.leverWMm / 2,
      z + s * hd.plateDMm,
      z + s * (hd.plateDMm + hd.leverDMm)
    );
    add(ctx, `${leaf.id}-handle-${i}`, 'handle', 'hardware', groupId, plate);
    add(ctx, `${leaf.id}-lever-${i}`, 'handle', 'hardware', groupId, lever);
  });
}

function buildSlidingLeaf(ctx: Ctx, leaf: LeafNode, rect: RectMm, depthMm: number): void {
  if (!leaf.slide) return;
  const sl = slideLayout(leaf.slide, rect.wMm);
  const used = sl.panels.reduce((m, p) => Math.max(m, p.track + 1), 0);
  const sash = boxSection(S.slidingSash.faceMm, S.slidingSash.depthMm);
  sl.panels.forEach((p, i) => {
    const zc = -trackCentreMm(p.track);
    const r: RectMm = { xMm: rect.xMm + p.xMm, yMm: rect.yMm, wMm: p.widthMm, hMm: rect.hMm };
    // A shutter slides the way it is set to, or the other way when that side has no room.
    const roomLeft = p.xMm;
    const roomRight = rect.wMm - (p.xMm + p.widthMm);
    const goLeft = p.direction === 'Left' ? roomLeft > 1 : roomRight <= 1;
    const reach = Math.min(goLeft ? roomLeft : roomRight, p.widthMm - sl.overlapMm);
    const groupId = !p.fixed && reach > 1 ? `slide-${leaf.id}-${i}` : null;
    sashWithGlass(ctx, `${leaf.id}-panel-${i}`, groupId, rectPoly(r), sash, zc + sash.depthMm / 2);
    if (groupId) {
      ctx.groups.push({
        id: groupId,
        leafId: leaf.id,
        kind: 'slide',
        pivot: [0, 0, 0],
        axis: [1, 0, 0],
        travel: goLeft ? -reach : reach,
      });
    }
  });
  if (sl.mesh) {
    const zc = -trackCentreMm(used);
    const section = boxSection(S.meshSash.faceMm, S.meshSash.depthMm);
    const poly = rectPoly({ xMm: rect.xMm + sl.mesh.xMm, yMm: rect.yMm, wMm: sl.mesh.widthMm, hMm: rect.hMm });
    const pts = poly.map((q) => up(ctx, q));
    sweepSection(pts, section, { closed: true, zOutside: zc + section.depthMm / 2 }).forEach((geo, i) =>
      add(ctx, `${leaf.id}-mesh-sash-${i}`, 'sash', 'profile', null, geo)
    );
    const net = inset(poly, section.faceMm - S.glassBiteMm).map((q) => up(ctx, q));
    const t = S.meshThicknessMm / 2;
    add(ctx, `${leaf.id}-mesh`, 'mesh', 'mesh', null, extrudePolygon(net, zc + t, zc - t));
  }
  // One rail per track along the sill and the head.
  const tracks = used + (sl.mesh ? 1 : 0);
  const rail = S.track;
  const yBottom = ctx.h - (rect.yMm + rect.hMm);
  const yTop = ctx.h - rect.yMm;
  for (let t = 0; t < tracks && trackCentreMm(t) < depthMm; t++) {
    const z = -trackCentreMm(t);
    const zF = z + rail.railWidthMm / 2;
    const zB = z - rail.railWidthMm / 2;
    add(ctx, `${leaf.id}-rail-b${t}`, 'rail', 'profile', null, boxGeo(rect.xMm, yBottom, rect.xMm + rect.wMm, yBottom + rail.railHeightMm, zF, zB));
    add(ctx, `${leaf.id}-rail-t${t}`, 'rail', 'profile', null, boxGeo(rect.xMm, yTop - rail.railHeightMm, rect.xMm + rect.wMm, yTop, zF, zB));
  }
}

/* ------------------------------------------------------------------ */
/* Whole window                                                        */
/* ------------------------------------------------------------------ */

/** Tracks a sliding leaf needs in the frame (its fly-mesh track included). */
function tracksOf(leaf: LeafNode): number {
  if (leaf.category !== 'Slidding' || !leaf.slide) return 0;
  const sl = slideLayout(leaf.slide, 1);
  return sl.panels.reduce((m, p) => Math.max(m, p.track + 1), 0) + (leaf.slide.mesh ? 1 : 0);
}

export function buildWindowParts(design: WindowDesign, opts?: PartsOptions): WindowParts {
  const f = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const arcSegments = opts?.arcSegments ?? 96;
  const ctx: Ctx = { design, h: design.frame.heightMm, f, parts: [], groups: [] };
  const lay = layout(design, { frameFaceMm: f });
  const tracks = Math.max(0, ...lay.leaves.map((l) => tracksOf(l.leaf)));
  const depthMm = tracks ? slidingFrameDepthMm(tracks) : S.casementFrameDepthMm;

  buildFrame(ctx, frameSection(f, depthMm, tracks > 0), arcSegments);

  const { shape, widthMm, heightMm } = design.frame;
  const daylight = shape.kind === 'rect' ? null : daylightPolygon(shape, widthMm, heightMm, f, { arcSegments });
  lay.dividers.forEach((d, i) => {
    const poly = daylight ? clipPolygonToRect(daylight, d.rect) : rectPoly(d.rect);
    const pts = poly.map((p) => up(ctx, p));
    add(ctx, `divider-${i}`, 'divider', 'profile', null, extrudePolygon(pts, -S.dividerSetbackMm, -depthMm + S.dividerSetbackMm));
  });

  const clips = new Map(clipPanesToShape(design, { frameFaceMm: f, arcSegments }).map((c) => [c.leafId, c.polygonMm]));
  const doors = doorLeafIds(design);
  for (const { leaf, rect } of lay.leaves) {
    const pane = clips.get(leaf.id) ?? [];
    if (pane.length < 3) continue; // the shape leaves nothing of this pane
    if (leaf.category === 'Slidding' && leaf.slide) buildSlidingLeaf(ctx, leaf, rect, depthMm);
    else buildCasementLeaf(ctx, leaf, pane, doors.has(leaf.id));
  }
  // A split that carries its own sash band (nested content inside one sash).
  lay.nodes.forEach((n) => {
    if (isLeaf(n.node) || !n.node.sashFramed) return;
    const section = rebatedSection(S.sash.faceMm, S.sash.depthMm);
    const pts = rectPoly(n.rect).map((p) => up(ctx, p));
    sweepSection(pts, section, { closed: true, zOutside: -(S.casementFrameDepthMm - section.depthMm) / 2 }).forEach((geo, i) =>
      add(ctx, `${n.node.id}-band-${i}`, 'sash', 'profile', null, geo)
    );
  });

  return { widthMm, heightMm, depthMm, parts: ctx.parts, groups: ctx.groups };
}

export function partsOfRole(parts: WindowParts, role: PartRole): MeshPart[] {
  return parts.parts.filter((p) => p.role === role);
}

export function triangleTotal(parts: WindowParts): number {
  return parts.parts.reduce((n, p) => n + p.positions.length / 9, 0);
}
