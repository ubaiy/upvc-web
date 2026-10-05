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
  OpeningKind,
  PALLA_BAR_FACE_MM,
  PallaBars,
  PaneOutline,
  PointMm,
  ShapedSashHardware,
  WindowDesign,
  clipPanesToShape,
  clipPolygonToRect,
  daylightPolygon,
  effectiveOpeningKind,
  findNode,
  hasOwnGlass,
  insetConvexPolygon,
  isLeaf,
  layout,
  outlinePath,
  paneOutlines,
  shapedSash,
  shapedSashHardware,
  slideLayout,
  storedOpeningKind,
  walkLeaves,
} from '../design-model';
import { DEFAULT_FRAME_FACE_MM, RectMm } from '../design-model/geometry';
import { slideTracks } from '../design-model/slide-tracks';
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
  | 'gasket'
  | 'mesh'
  | 'glazing-bar'
  | 'sash-bar'
  | 'rail'
  | 'threshold'
  | 'handle'
  | 'hinge';

export type PartMaterial = 'profile' | 'glass' | 'gasket' | 'mesh' | 'hardware';

export interface MeshPart extends Geo {
  id: string;
  role: PartRole;
  material: PartMaterial;
  /** The moving group this part belongs to; null = fixed to the frame. */
  groupId: string | null;
  /** Glass only: the glass of a pane glazed differently from the window (absent = the window's glass). */
  glassId?: string;
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

/**
 * What a tap can hit: one per pane (one per shutter of a sliding pane). It is
 * never drawn as it is: `slab` is the volume a tap is tested against, `ring`
 * the band shown round the pane while it is selected. Both move with `groupId`.
 */
export interface PickPart {
  leafId: string;
  /** Sliding pane only: which of its shutters. */
  panelIndex?: number;
  groupId: string | null;
  slab: Geo;
  ring: Geo;
}

export interface WindowParts {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  parts: MeshPart[];
  groups: MovingGroup[];
  picks: PickPart[];
}

export interface PartsOptions {
  /** Outer frame face width; the same value the 2D layout is given. */
  frameFaceMm?: number;
  /** Tessellation of a full circle; an arc takes its share. */
  arcSegments?: number;
}

const CORNER_TURN_RAD = (20 * Math.PI) / 180;
/** The band round a selected pane: its face width and how far it stands proud of the pane. */
const RING_FACE_MM = 10;
const RING_PROUD_MM = 2;
/** From the back plate of a handle to the lever. */
const HANDLE_NECK_MM = 26;
const HINGE = { widthMm: 18, lengthMm: 96 } as const;
/** A pivot fitting or a tilt bearing: a round boss on the edge of the sash. */
const BOSS_MM = 24;
/** The rebate gap between a shaped sash and the opening it stands in (the 2D drawing's 4 mm). */
const SHAPED_SASH_GAP_MM = 4;
/** The lever of a door leaf, above the bottom of the leaf (as the 2D drawing). */
const DOOR_LEVER_MM = 1050;
/** A bar inside a sash stands this far back from both faces of the sash. */
const SASH_BAR_SETBACK_MM = 2;
/** The pull of a sliding shutter. */
const PULL = { widthMm: 12, lengthMm: 170, proudMm: 5 } as const;

interface Ctx {
  design: WindowDesign;
  h: number;
  f: number;
  parts: MeshPart[];
  groups: MovingGroup[];
  picks: PickPart[];
  /** Own glass of the pane being built; undefined = the window's glass. */
  ownGlass?: string;
}

const up = (ctx: Ctx, p: PointMm): P2 => ({ x: p.xMm, y: ctx.h - p.yMm });

function add(ctx: Ctx, id: string, role: PartRole, material: PartMaterial, groupId: string | null, geo: Geo): void {
  if (!geo.positions.length) return;
  const part: MeshPart = { id, role, material, groupId, ...geo };
  if (material === 'glass' && ctx.ownGlass) part.glassId = ctx.ownGlass;
  ctx.parts.push(part);
}

function joinGeo(geos: Geo[]): Geo {
  return { positions: geos.flatMap((g) => g.positions), normals: geos.flatMap((g) => g.normals) };
}

/** The tap volume and the selection band of one pane (or one shutter), from zFront back to zBack. */
function addPick(
  ctx: Ctx,
  leafId: string,
  groupId: string | null,
  poly: PointMm[],
  zFront: number,
  zBack: number,
  panelIndex?: number
): void {
  if (poly.length < 3) return;
  const pts = poly.map((p) => up(ctx, p));
  // A thin line on the face of the pane, not a block the depth of the sash: the pane must still read under it.
  const band = boxSection(RING_FACE_MM, 2 * RING_PROUD_MM);
  const ring = joinGeo(sweepSection(pts, band, { closed: true, zOutside: zFront + RING_PROUD_MM, breaks: cornerBreaks(pts) }));
  const pick: PickPart = { leafId, groupId, slab: extrudePolygon(pts, zFront, zBack), ring };
  if (panelIndex !== undefined) pick.panelIndex = panelIndex;
  ctx.picks.push(pick);
}

/** A rectangle with fully rounded ends (a circle when w = h), anticlockwise. */
function stadium(cx: number, cy: number, w: number, h: number, steps = 5): P2[] {
  const r = Math.min(w, h) / 2;
  const dx = w / 2 - r;
  const dy = h / 2 - r;
  const out: P2[] = [];
  [
    [dx, dy],
    [-dx, dy],
    [-dx, -dy],
    [dx, -dy],
  ].forEach(([ox, oy], q) => {
    for (let i = 0; i <= steps; i++) {
      const a = ((q + i / steps) * Math.PI) / 2;
      out.push({ x: cx + ox + r * Math.cos(a), y: cy + oy + r * Math.sin(a) });
    }
  });
  return out;
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

/** A glass and its gasket. `hiddenMm` = how far the glass edge sits inside the bar that holds it. */
function glassSlab(ctx: Ctx, id: string, groupId: string | null, poly: PointMm[], zCentre: number, hiddenMm = 0): void {
  if (poly.length < 3) return;
  const t = S.glassThicknessMm / 2;
  const pts = poly.map((p) => up(ctx, p));
  add(ctx, id, 'glass', 'glass', groupId, extrudePolygon(pts, zCentre + t, zCentre - t));
  const seal = boxSection(hiddenMm + S.gasket.showMm, 2 * (t + S.gasket.proudMm));
  sweepSection(pts, seal, { closed: true, zOutside: zCentre + t + S.gasket.proudMm, breaks: cornerBreaks(pts) }).forEach((geo, i) =>
    add(ctx, `${id}-gasket-${i}`, 'gasket', 'gasket', groupId, geo)
  );
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

/** The bars that divide ONE palla (a sash or a shutter): fractions of the palla's outer rect, as the model keeps them. */
interface Division {
  bars: PallaBars;
  palla: RectMm;
}

/**
 * A sash: one mitred bar per side of `poly`, and the glass it holds. A
 * divided palla gets its bars from glass edge to glass edge and one glass
 * per part; all of it belongs to `groupId`, so it moves with the sash.
 */
function sashWithGlass(
  ctx: Ctx,
  id: string,
  groupId: string | null,
  poly: PointMm[],
  section: ProfileSection,
  zOutside: number,
  division?: Division
): void {
  const pts = poly.map((p) => up(ctx, p));
  const members = sweepSection(pts, section, { closed: true, zOutside, breaks: cornerBreaks(pts) });
  members.forEach((geo, i) => add(ctx, `${id}-sash-${i}`, 'sash', 'profile', groupId, geo));
  const glass = inset(poly, section.faceMm - S.glassBiteMm);
  const zCentre = zOutside - section.depthMm / 2;
  if (!division || !division.bars.at.length) {
    glassSlab(ctx, `${id}-glass`, groupId, glass, zCentre, S.glassBiteMm);
    return;
  }
  const { bars, palla } = division;
  const upright = bars.axis === 'x';
  const from = upright ? palla.xMm : palla.yMm;
  const size = upright ? palla.wMm : palla.hMm;
  const half = PALLA_BAR_FACE_MM / 2;
  const strip = (a: number, b: number): RectMm =>
    upright
      ? { xMm: a, yMm: palla.yMm - 1, wMm: b - a, hMm: palla.hMm + 2 }
      : { xMm: palla.xMm - 1, yMm: a, wMm: palla.wMm + 2, hMm: b - a };
  const cuts = [...bars.at].sort((a, b) => a - b).map((at) => from + at * size);
  // The bar ends on the inner edge of the sash members.
  const daylight = inset(poly, section.faceMm);
  cuts.forEach((c, i) => {
    const bar = clipPolygonToRect(daylight, strip(c - half, c + half)).map((p) => up(ctx, p));
    if (bar.length < 3) return;
    const geo = extrudePolygon(bar, zOutside - SASH_BAR_SETBACK_MM, zOutside - section.depthMm + SASH_BAR_SETBACK_MM);
    add(ctx, `${id}-bar-${i}`, 'sash-bar', 'profile', groupId, geo);
  });
  // One glass per part, each going into the bar beside it as far as it goes into the sash.
  const edges = [from - 1, ...cuts, from + size + 1];
  for (let k = 0; k + 1 < edges.length; k++) {
    const a = k === 0 ? edges[0] : edges[k] + half - S.glassBiteMm;
    const b = k + 2 === edges.length ? edges[k + 1] : edges[k + 1] - half + S.glassBiteMm;
    if (b - a < 1) continue;
    glassSlab(ctx, `${id}-glass-${k}`, groupId, clipPolygonToRect(glass, strip(a, b)), zCentre, S.glassBiteMm);
  }
}

function doorLeafIds(design: WindowDesign): Set<string> {
  const out = new Set<string>();
  if (design.productType !== 'Door' || !design.door) return out;
  const node = findNode(design.root, design.door.doorNodeId);
  if (node) walkLeaves(node).forEach((l) => out.add(l.id));
  return out;
}

type Hang = 'left' | 'right' | 'top' | 'bottom';

/** How a sash moves, from the way the model says it opens. */
function motionOf(kind: OpeningKind): { side: Hang; tilt: boolean; pivot: 'horizontal' | 'vertical' | null } {
  if (kind === 'Pivot Horizontal') return { side: 'top', tilt: false, pivot: 'horizontal' };
  if (kind === 'Pivot Vertical') return { side: 'left', tilt: false, pivot: 'vertical' };
  if (kind.startsWith('Tilt')) return { side: kind.endsWith('Right') ? 'right' : 'left', tilt: true, pivot: null };
  return { side: kind.toLowerCase() as Hang, tilt: false, pivot: null };
}

function turned(poly: P2[], cx: number, cy: number, rad: number): P2[] {
  if (!rad) return poly;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return poly.map((p) => ({ x: cx + (p.x - cx) * c - (p.y - cy) * s, y: cy + (p.x - cx) * s + (p.y - cy) * c }));
}

/** The turn that lays an upright lever handle along a profile running at `angleRad` (2D, y down), lever hanging down. */
function leverTurn(angleRad: number): number {
  const sign = Math.sin(angleRad) > 1e-9 ? -1 : 1;
  return Math.atan2(-sign * Math.cos(angleRad), -sign * Math.sin(angleRad));
}

function buildCasementLeaf(
  ctx: Ctx,
  leaf: LeafNode,
  pane: PointMm[],
  rect: RectMm,
  isDoor: boolean,
  outline: PaneOutline | undefined
): void {
  const zMid = -S.casementFrameDepthMm / 2;
  const plainGlass = (): void => {
    glassSlab(ctx, `${leaf.id}-glass`, null, pane, zMid);
    addPick(ctx, leaf.id, null, pane, zMid + S.glassThicknessMm, zMid - S.glassThicknessMm);
  };
  // A pane the frame shape cuts: its sash follows the real outline (design-model shaped-sash),
  // hung the way that outline can carry. A framed fixed palla in a cut pane is plain glass, as in 2D.
  const cut = outline?.cut === true ? outline : null;
  const opens = leaf.casementType === 'Openable';
  const kind = !opens ? null : cut ? effectiveOpeningKind(leaf, cut) : storedOpeningKind(leaf);
  if (!opens && (!leaf.sashFramed || cut)) return plainGlass();
  if (cut && !kind) return plainGlass();

  const size = isDoor ? S.doorSash : S.sash;
  const section = rebatedSection(size.faceMm, size.depthMm, S.chamferMm);
  const zOutside = -(S.casementFrameDepthMm - size.depthMm) / 2;
  let poly = pane;
  let hardware: ShapedSashHardware | null = null;
  const threshold = ctx.design.door?.threshold;
  if (cut && kind) {
    try {
      const shaped = shapedSash(cut, SHAPED_SASH_GAP_MM, size.faceMm);
      // Three hinges on a door, and never more than two on a short side: the model's own rule.
      hardware = shapedSashHardware(shaped, kind, { hingeCount: isDoor ? 3 : 2, doorLeverMm: isDoor ? DOOR_LEVER_MM : undefined });
      poly = shaped.outerMm;
    } catch {
      // Too small to hold a sash of this face: the 2D drawing shows glass.
      return plainGlass();
    }
  } else if (isDoor && threshold && threshold !== 'Standard') {
    // The leaf runs down to the low threshold (or the floor) instead of a full sill.
    const floor = ctx.h - (threshold === 'Low' ? S.lowThresholdHeightMm : 0) - 4;
    const bottom = Math.max(...pane.map((p) => p.yMm));
    poly = pane.map((p) => (Math.abs(p.yMm - bottom) < 1e-6 ? { xMm: p.xMm, yMm: floor } : p));
  }
  const groupId = kind ? `open-${leaf.id}` : null;
  // The 2D drawing does not draw palla bars inside a cut pane; neither does this view.
  const division = leaf.bars && !cut ? { bars: leaf.bars, palla: rect } : undefined;
  sashWithGlass(ctx, leaf.id, groupId, poly, section, zOutside, division);
  addPick(ctx, leaf.id, groupId, poly, zOutside, zOutside - section.depthMm);
  if (!kind || !groupId) return;

  const box = boxOf(poly);
  const x0 = box.xMm;
  const x1 = box.xMm + box.wMm;
  const yTop = ctx.h - box.yMm;
  const yBottom = ctx.h - (box.yMm + box.hMm);
  const { side, tilt, pivot } = motionOf(kind);
  const zBack = zOutside - section.depthMm;
  const metal = (id: string, shape: P2[], za: number, zb: number, role: PartRole = 'handle'): void =>
    add(ctx, id, role, 'hardware', groupId, extrudePolygon(shape, Math.max(za, zb), Math.min(za, zb)));
  const boss = (id: string, x: number, y: number): void =>
    metal(id, stadium(x, y, BOSS_MM, BOSS_MM), zOutside + 3, zBack - 3, 'hinge');

  const out = isDoor ? ctx.design.door?.swing === 'Out' : !tilt && !pivot && side !== 'bottom' && WINDOW_CASEMENT_OPENS_OUT;
  const sideways = side === 'left' || side === 'right';
  if (pivot) {
    // A centre pivot turns about the line through the middle of the sash: the half above
    // (left of) the axis swings in, the other half out, as the 2D drawing marks it.
    ctx.groups.push({
      id: groupId,
      leafId: leaf.id,
      kind: 'hinge',
      pivot: [(x0 + x1) / 2, (yTop + yBottom) / 2, zOutside - section.depthMm / 2],
      axis: pivot === 'horizontal' ? [1, 0, 0] : [0, 1, 0],
      travel: (-OPEN_LIMITS_DEG.pivot * Math.PI) / 180,
    });
  } else {
    const zPivot = out ? zOutside : zBack;
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
  }

  // Lever handle on the room side of the bar opposite the hinges (a door has one on each face):
  // a rounded back plate, a round neck, and the lever hanging down as it does when the sash is shut.
  // On a shaped sash it stands where the model puts it, laid along the profile there.
  const hd = S.handle;
  let cx = side === 'left' ? x1 - size.faceMm / 2 : side === 'right' ? x0 + size.faceMm / 2 : (x0 + x1) / 2;
  let cy = sideways ? (yTop + yBottom) / 2 : side === 'top' ? yBottom + size.faceMm / 2 : yTop - size.faceMm / 2;
  let turn = 0;
  if (hardware?.handle) {
    cx = hardware.handle.at.xMm;
    cy = ctx.h - hardware.handle.at.yMm;
    turn = leverTurn(hardware.handle.angleRad);
  }
  const faces: [number, number][] = [[zBack, -1]];
  if (isDoor) faces.push([zOutside, 1]);
  const laid = (shape: P2[]): P2[] => turned(shape, cx, cy, turn);
  if (!hardware || hardware.handle) {
    faces.forEach(([z, s], i) => {
      const neck = z + s * (hd.plateDMm + HANDLE_NECK_MM);
      const spindleY = cy + hd.plateHMm / 5;
      metal(`${leaf.id}-handle-${i}`, laid(stadium(cx, cy, hd.plateWMm, hd.plateHMm)), z, z + s * hd.plateDMm);
      metal(`${leaf.id}-neck-${i}`, laid(stadium(cx, spindleY, hd.leverWMm, hd.leverWMm)), z + s * hd.plateDMm, neck);
      metal(
        `${leaf.id}-lever-${i}`,
        laid(stadium(cx, spindleY + hd.leverWMm / 2 - hd.leverLMm / 2, hd.leverWMm, hd.leverLMm)),
        neck - s * hd.leverDMm,
        neck
      );
    });
  }

  if (pivot) {
    // The two pivot fittings, where the axis meets the edge of the sash.
    const ends: P2[] = hardware
      ? hardware.pivots.map((p) => up(ctx, p))
      : pivot === 'horizontal'
        ? [
            { x: x0, y: (yTop + yBottom) / 2 },
            { x: x1, y: (yTop + yBottom) / 2 },
          ]
        : [
            { x: (x0 + x1) / 2, y: yTop },
            { x: (x0 + x1) / 2, y: yBottom },
          ];
    ends.forEach((p, i) => boss(`${leaf.id}-pivot-${i}`, p.x, p.y));
    return;
  }

  // Hinges on the hung edge, on the face the sash turns towards: two on a window, three on a door.
  const zHinge = out ? zOutside : zBack;
  // The knuckle stands as far as the frame's own face, so a shut window stays inside its frame.
  const zKnuckle = out ? 0 : -S.casementFrameDepthMm;
  const zA = Math.max(zHinge, zKnuckle);
  const zB = Math.min(zHinge, zKnuckle);
  const hw = HINGE.widthMm / 2;
  const hl = HINGE.lengthMm / 2;
  const hinge = (i: number, hx: number, hy: number): void => {
    const geo = sideways ? boxGeo(hx - hw, hy - hl, hx + hw, hy + hl, zA, zB) : boxGeo(hx - hl, hy - hw, hx + hl, hy + hw, zA, zB);
    add(ctx, `${leaf.id}-hinge-${i}`, 'hinge', 'hardware', groupId, geo);
  };
  if (hardware) {
    // Only on a straight side; a full round tilts on two bearings either side of its lowest point.
    hardware.hinges.forEach((h, i) => hinge(i, h.at.xMm, ctx.h - h.at.yMm));
    hardware.bearings.forEach((b, i) => boss(`${leaf.id}-bearing-${i}`, b.xMm, ctx.h - b.yMm));
    return;
  }
  (isDoor ? [0.12, 0.5, 0.88] : [0.16, 0.84]).forEach((k, i) => {
    const hx = sideways ? (side === 'right' ? x1 : x0) : x0 + (x1 - x0) * k;
    const hy = sideways ? yBottom + (yTop - yBottom) * k : side === 'top' ? yTop : yBottom;
    hinge(i, hx, hy);
  });
}

function buildSlidingLeaf(ctx: Ctx, leaf: LeafNode, rect: RectMm, depthMm: number): void {
  if (!leaf.slide) return;
  const sl = slideLayout(leaf.slide, rect.wMm);
  // Which track each shutter runs on is the model's rule (slide-tracks.ts): track 0 is the
  // outside one, and the fly mesh runs on the track nearest the room.
  const tracks = slideTracks(leaf.slide);
  const sash = boxSection(S.slidingSash.faceMm, S.slidingSash.depthMm, S.chamferMm);
  const yMid = ctx.h - (rect.yMm + rect.hMm / 2);
  sl.panels.forEach((p, i) => {
    const zc = -trackCentreMm(tracks.panelTrack[i]);
    const r: RectMm = { xMm: rect.xMm + p.xMm, yMm: rect.yMm, wMm: p.widthMm, hMm: rect.hMm };
    // A shutter slides the way it is set to, or the other way when that side has no room.
    const roomLeft = p.xMm;
    const roomRight = rect.wMm - (p.xMm + p.widthMm);
    const goLeft = p.direction === 'Left' ? roomLeft > 1 : roomRight <= 1;
    const reach = Math.min(goLeft ? roomLeft : roomRight, p.widthMm - sl.overlapMm);
    const groupId = !p.fixed && reach > 1 ? `slide-${leaf.id}-${i}` : null;
    const bars = leaf.slide?.panels[i]?.bars;
    sashWithGlass(ctx, `${leaf.id}-panel-${i}`, groupId, rectPoly(r), sash, zc + sash.depthMm / 2, bars && { bars, palla: r });
    addPick(ctx, leaf.id, groupId, rectPoly(r), zc + sash.depthMm / 2, zc - sash.depthMm / 2, i);
    if (groupId) {
      // A pull on the stile the shutter closes against, on both faces.
      const px = goLeft ? r.xMm + r.wMm - sash.faceMm / 2 : r.xMm + sash.faceMm / 2;
      [1, -1].forEach((s, k) => {
        const z = zc + (s * sash.depthMm) / 2;
        const zp = z + s * PULL.proudMm;
        const pull = boxGeo(px - PULL.widthMm / 2, yMid - PULL.lengthMm / 2, px + PULL.widthMm / 2, yMid + PULL.lengthMm / 2, Math.max(z, zp), Math.min(z, zp));
        add(ctx, `${leaf.id}-panel-${i}-pull-${k}`, 'handle', 'hardware', groupId, pull);
      });
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
  if (sl.mesh && tracks.meshTrack !== null) {
    const zc = -trackCentreMm(tracks.meshTrack);
    const section = boxSection(S.meshSash.faceMm, S.meshSash.depthMm, S.chamferMm);
    // As in the 2D drawing: the mesh is the size of the end glass shutter it is parked behind.
    const end = sl.panels[sl.mesh.position === 'Left' ? 0 : sl.panels.length - 1];
    const at = end ? { xMm: end.xMm, widthMm: end.widthMm } : sl.mesh;
    const poly = rectPoly({ xMm: rect.xMm + at.xMm, yMm: rect.yMm, wMm: at.widthMm, hMm: rect.hMm });
    const pts = poly.map((q) => up(ctx, q));
    // It slides to the side that has room for it, as far as its own width.
    const roomLeft = at.xMm;
    const roomRight = rect.wMm - (at.xMm + at.widthMm);
    const goLeft = roomLeft > roomRight;
    const reach = Math.min(goLeft ? roomLeft : roomRight, at.widthMm);
    const groupId = reach > 1 ? `slide-${leaf.id}-mesh` : null;
    sweepSection(pts, section, { closed: true, zOutside: zc + section.depthMm / 2 }).forEach((geo, i) =>
      add(ctx, `${leaf.id}-mesh-sash-${i}`, 'sash', 'profile', groupId, geo)
    );
    const net = inset(poly, section.faceMm - S.glassBiteMm).map((q) => up(ctx, q));
    const t = S.meshThicknessMm / 2;
    add(ctx, `${leaf.id}-mesh`, 'mesh', 'mesh', groupId, extrudePolygon(net, zc + t, zc - t));
    if (groupId) {
      ctx.groups.push({ id: groupId, leafId: leaf.id, kind: 'slide', pivot: [0, 0, 0], axis: [1, 0, 0], travel: goLeft ? -reach : reach });
    }
  }
  // One rail per track along the sill and the head.
  const rail = S.track;
  const yBottom = ctx.h - (rect.yMm + rect.hMm);
  const yTop = ctx.h - rect.yMm;
  for (let t = 0; t < tracks.railCount && trackCentreMm(t) < depthMm; t++) {
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
  return slideTracks(leaf.slide).railCount;
}

export function buildWindowParts(design: WindowDesign, opts?: PartsOptions): WindowParts {
  const f = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const arcSegments = opts?.arcSegments ?? 96;
  const ctx: Ctx = { design, h: design.frame.heightMm, f, parts: [], groups: [], picks: [] };
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
  const outlines = shape.kind === 'rect' ? null : paneOutlines(design, { frameFaceMm: f, arcSegments });
  const doors = doorLeafIds(design);
  for (const { leaf, rect } of lay.leaves) {
    const pane = clips.get(leaf.id) ?? [];
    if (pane.length < 3) continue; // the shape leaves nothing of this pane
    ctx.ownGlass = hasOwnGlass(design, leaf) ? String(leaf.glassId) : undefined;
    if (leaf.category === 'Slidding' && leaf.slide) buildSlidingLeaf(ctx, leaf, rect, depthMm);
    else buildCasementLeaf(ctx, leaf, pane, rect, doors.has(leaf.id), outlines?.get(leaf.id));
  }
  ctx.ownGlass = undefined;
  // A split that carries its own sash band (nested content inside one sash).
  lay.nodes.forEach((n) => {
    if (isLeaf(n.node) || !n.node.sashFramed) return;
    const section = rebatedSection(S.sash.faceMm, S.sash.depthMm, S.chamferMm);
    const pts = rectPoly(n.rect).map((p) => up(ctx, p));
    sweepSection(pts, section, { closed: true, zOutside: -(S.casementFrameDepthMm - section.depthMm) / 2 }).forEach((geo, i) =>
      add(ctx, `${n.node.id}-band-${i}`, 'sash', 'profile', null, geo)
    );
  });

  return { widthMm, heightMm, depthMm, parts: ctx.parts, groups: ctx.groups, picks: ctx.picks };
}

export function partsOfRole(parts: WindowParts, role: PartRole): MeshPart[] {
  return parts.parts.filter((p) => p.role === role);
}

export function triangleTotal(parts: WindowParts): number {
  return parts.parts.reduce((n, p) => n + p.positions.length / 9, 0);
}
