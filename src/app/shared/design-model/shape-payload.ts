/**
 * design-model shaped-frame pricing descriptor (Phase 3 item 3.3, web
 * half): the top-level `shape` key of the manage-product payload, in the
 * exact contract of the api's shaped shadow path
 * (docs/review/phase-6-design-api-log.md §4). The api PRICES; all
 * geometry — member cut lengths incl. arc lengths, per-pane glass area,
 * bounding rectangle and polygon — is computed here.
 *
 * Rect frames have no descriptor (null): their payload stays
 * byte-identical to Phase 1.
 */

import {
  DEFAULT_FRAME_FACE_MM,
  LayoutOptions,
  layout,
  leafGrid,
} from './geometry';
import { isSemicircular } from './shape';
import {
  OutlineOptions,
  PointMm,
  archRadiusMm,
  clipPanesToShape,
  clipPolygonToRect,
  daylightPolygon,
  frameMembers,
} from './shape-geometry';
import { LeafNode, WindowDesign } from './types';

/** Shape kinds as the api names them (arch-top splits in two). */
export type ShapePayloadKind =
  | 'arch_segmental'
  | 'arch_semicircular'
  | 'circle'
  | 'triangle'
  | 'trapezoid';

/**
 * Kinds the api's manage-product validation accepts today. 'circle' is
 * modelled and drawn but NOT in the api enum yet, so toPayload leaves the
 * descriptor out for circles (see the Phase 6 model log's api notes).
 */
export const API_SHAPE_KINDS: ShapePayloadKind[] = [
  'arch_segmental',
  'arch_semicircular',
  'triangle',
  'trapezoid',
];

export interface ShapeMemberPayload {
  /** api profile role: 'frame' | 'mullion' | 'transom'. */
  role: string;
  /** Cut length, mm, 0.1 mm precision (arc length for curved members). */
  length_mm: number;
  qty: number;
  curved: boolean;
}

export interface ShapePanePayload {
  col: number;
  row: number;
  config: 'fixed' | 'casement' | 'slider';
  /** True when the shape cut this pane (glass ordered at its bounding box). */
  shaped: boolean;
  glass: {
    area_sqm: number;
    bounding_w_mm: number;
    bounding_h_mm: number;
    /** Pane polygon, [x, y] mm from the frame's outer top-left. */
    polygon: [number, number][];
  };
}

export interface ShapePayload {
  kind: ShapePayloadKind;
  params: { [key: string]: number };
  members: ShapeMemberPayload[];
  panes: ShapePanePayload[];
}

export interface ShapePayloadOptions extends LayoutOptions, OutlineOptions {}

/** Arc tessellation of the pane polygons sent to the api (payload size). */
export const PAYLOAD_ARC_SEGMENTS = 32;

const round1 = (v: number): number => Math.round(v * 10) / 10;

function bbox(points: PointMm[]): { wMm: number; hMm: number } {
  const xs = points.map((p) => p.xMm);
  const ys = points.map((p) => p.yMm);
  return {
    wMm: Math.max(...xs) - Math.min(...xs),
    hMm: Math.max(...ys) - Math.min(...ys),
  };
}

function paneConfig(leaf: LeafNode): ShapePanePayload['config'] {
  if (leaf.category === 'Slidding') return 'slider';
  return leaf.casementType === 'Openable' ? 'casement' : 'fixed';
}

/**
 * Build the api `shape` descriptor for a shaped design; null for 'rect'.
 *  - members: the frame's outline members (role 'frame'; equal straight
 *    cuts merge into one line with a qty) followed by every divider bar
 *    clipped to the shape (role 'mullion' = vertical, 'transom' =
 *    horizontal), in layout emit order;
 *  - panes: one per leaf that still has glass inside the shape, with the
 *    D3 grid cell, in the same reading order as sections[]. A pane the
 *    shape removes entirely (e.g. the corner beyond a triangle's slope)
 *    is left out.
 */
export function toShapePayload(
  design: WindowDesign,
  opts?: ShapePayloadOptions
): ShapePayload | null {
  const shape = design.frame.shape;
  if (shape.kind === 'rect') return null;
  const { widthMm: w, heightMm: h } = design.frame;
  const face = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const outline: OutlineOptions = {
    arcSegments: opts?.arcSegments ?? PAYLOAD_ARC_SEGMENTS,
  };

  let kind: ShapePayloadKind;
  let params: { [key: string]: number };
  switch (shape.kind) {
    case 'arch-top':
      kind = isSemicircular(shape, w) ? 'arch_semicircular' : 'arch_segmental';
      params = {
        riseMm: shape.riseMm,
        radiusMm: round1(archRadiusMm(shape.riseMm, w)),
      };
      break;
    case 'circle':
      kind = 'circle';
      params = { radiusMm: w / 2 };
      break;
    case 'triangle':
      kind = 'triangle';
      params = {
        apexOffsetMm: shape.apex === 'left' ? 0 : shape.apex === 'right' ? w : w / 2,
      };
      break;
    case 'trapezoid':
      kind = 'trapezoid';
      params = { leftHMm: shape.leftHeightMm, rightHMm: shape.rightHeightMm };
      break;
  }

  const members: ShapeMemberPayload[] = [];
  for (const m of frameMembers(shape, w, h)) {
    const length_mm = round1(m.lengthMm);
    const curved = !!m.curved;
    const same = members.find(
      (x) => x.role === 'frame' && x.curved === curved && x.length_mm === length_mm
    );
    if (same) same.qty += 1;
    else members.push({ role: 'frame', length_mm, qty: 1, curved });
  }

  const lay = layout(design, opts);
  const daylight = daylightPolygon(shape, w, h, face, outline);
  for (const d of lay.dividers) {
    const cut = clipPolygonToRect(daylight, d.rect);
    if (cut.length < 3) continue; // bar lies wholly outside the shape
    const box = bbox(cut);
    const length_mm = round1(d.direction === 'vertical' ? box.hMm : box.wMm);
    if (!(length_mm > 0)) continue;
    members.push({
      role: d.direction === 'vertical' ? 'mullion' : 'transom',
      length_mm,
      qty: 1,
      curved: false,
    });
  }

  const grid = leafGrid(design.root);
  const leafById = new Map(lay.leaves.map(({ leaf }) => [leaf.id, leaf]));
  const panes: ShapePanePayload[] = [];
  for (const clip of clipPanesToShape(design, { ...opts, ...outline })) {
    if (clip.polygonMm.length < 3 || !(clip.areaMm2 > 0)) continue;
    const cell = grid.get(clip.leafId);
    const leaf = leafById.get(clip.leafId) as LeafNode;
    const box = bbox(clip.polygonMm);
    panes.push({
      col: cell?.col ?? 0,
      row: cell?.row ?? 0,
      config: paneConfig(leaf),
      shaped: clip.clipped,
      glass: {
        area_sqm: Math.round(clip.areaMm2 / 100) / 10000,
        bounding_w_mm: round1(box.wMm),
        bounding_h_mm: round1(box.hMm),
        polygon: clip.polygonMm.map(
          (p) => [round1(p.xMm), round1(p.yMm)] as [number, number]
        ),
      },
    });
  }

  return { kind, params, members, panes };
}
