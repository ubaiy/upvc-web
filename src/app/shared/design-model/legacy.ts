/**
 * design-model legacy importers — the loader priority chain for opening
 * existing quotation lines (designer-architecture §5):
 *
 *  1. `old_post_data.design` present → parse()/migrate() → lossless.
 *  2. Else `old_post_data.full_window` (lines saved after A2 `94c671c`,
 *     shape `{width, height, parts, mullion}`) → high-fidelity
 *     reconstruction: window dims + one leaf per part, dividers from
 *     `mullion[]`, divider positions recovered from per-part widths,
 *     sliding leaves collapsed from consecutive Slidding parts.
 *  3. Else (oldest lines, first-section-only `old_post_data`) → single
 *     section import of what exists; the caller shows the "imported from
 *     legacy design — please verify before re-saving" banner for any
 *     non-'exact' confidence.
 */

import {
  DEFAULT_FRAME_FACE_MM,
  positionsFromWidths,
} from './geometry';
import { parse } from './serialize';
import {
  DESIGN_SCHEMA,
  Id,
  LeafNode,
  PaneNode,
  SlidePanel,
  SplitNode,
  TrackType,
  WindowDesign,
} from './types';

export type LegacySource = 'design' | 'full_window' | 'flat';
export type ImportConfidence = 'exact' | 'approximate';

export interface LegacyImport {
  design: WindowDesign;
  source: LegacySource;
  /** 'exact' → open silently; anything else → show the legacy banner. */
  confidence: ImportConfidence;
  notes: string[];
}

export interface LegacyOptions {
  frameFaceMm?: number;
  dividerFaceMm?: number;
}

/** One `parts[]` entry as the api stores it (loosely typed wire data). */
interface LegacyPart {
  product_id?: Id | null;
  product_type?: string | null;
  category_type?: string | null;
  casement_type?: string | null;
  sash_id?: Id | null;
  palla_type?: number | null;
  height?: number | string | null;
  width?: number | string | null;
  handle_id?: Id | null;
  opening_direction?: string | null;
  hinges_type?: string | null;
  glazz_id?: Id | null;
  color_id?: Id | null;
  is_track?: string | null;
  fly_mesh?: boolean | number | null;
  glazing_bars_vertical?: number | null;
  glazing_bars_horizontal?: number | null;
}

interface LegacyMullion {
  direction?: string;
  length?: number;
  product_id?: Id | null;
}

interface FullWindow {
  width?: number | string;
  height?: number | string;
  parts?: LegacyPart[];
  mullion?: LegacyMullion[];
}

/** Entry point: run the loader priority chain over an old_post_data blob. */
export function fromLegacy(
  oldPostData: Record<string, unknown> | null | undefined,
  opts?: LegacyOptions
): LegacyImport {
  if (oldPostData && oldPostData['design']) {
    const design = parse(oldPostData['design'] as string | object);
    return { design, source: 'design', confidence: 'exact', notes: [] };
  }
  const fw = oldPostData?.['full_window'] as FullWindow | undefined;
  if (fw && Array.isArray(fw.parts) && fw.parts.length) {
    return fromFullWindow(fw, opts);
  }
  return fromFlatLegacy((oldPostData ?? {}) as LegacyPart, opts);
}

/* ------------------------------------------------------------------ */
/* Shared leaf construction                                            */
/* ------------------------------------------------------------------ */

let seq = 0;
function freshId(): string {
  return `p${++seq}`;
}
function resetIds(): void {
  seq = 0;
}

function num(v: number | string | null | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function trackOf(v: string | null | undefined): TrackType {
  return v === '2.5 Track' || v === '3 Track' || v === '4 Track'
    ? v
    : '2 Track';
}

function slideDirection(v: string | null | undefined): 'Left' | 'Right' {
  return v === 'Right' ? 'Right' : 'Left';
}

function casementLeaf(part: LegacyPart, sashFramed?: boolean): LeafNode {
  const openable = part.casement_type === 'Openable';
  const leaf: LeafNode = {
    id: freshId(),
    kind: 'leaf',
    category: 'Casement',
    casementType: openable ? 'Openable' : 'Fixed',
    productId: part.product_id ?? null,
    sashId: part.sash_id ?? null,
  };
  if (openable) {
    leaf.opening = {
      direction: part.opening_direction ?? 'Left',
      handleId: part.handle_id ?? null,
      hingesType: part.hinges_type ?? null,
    };
  }
  if (sashFramed) leaf.sashFramed = true;
  return leaf;
}

function slidingLeaf(
  first: LegacyPart,
  panels: SlidePanel[]
): LeafNode {
  return {
    id: freshId(),
    kind: 'leaf',
    category: 'Slidding',
    productId: first.product_id ?? null,
    sashId: first.sash_id ?? null,
    slide: {
      tracks: trackOf(first.is_track),
      mesh: !!first.fly_mesh,
      panels,
    },
  };
}

function baseDesign(first: LegacyPart, w: number, h: number, root: PaneNode): WindowDesign {
  return {
    schema: DESIGN_SCHEMA,
    unit: 'mm',
    frame: {
      shape: { kind: 'rect' },
      widthMm: w,
      heightMm: h,
      productId: first.product_id ?? null,
      colorId: first.color_id ?? null,
      profileColor: null,
    },
    productType: first.product_type === 'Door' ? 'Door' : 'Window',
    glazing: {
      glassId: first.glazz_id ?? null,
      barsH: Number(first.glazing_bars_horizontal) || 0,
      barsV: Number(first.glazing_bars_vertical) || 0,
    },
    root,
  };
}

/* ------------------------------------------------------------------ */
/* full_window reconstruction                                          */
/* ------------------------------------------------------------------ */

/** A part, or a run of consecutive Slidding parts collapsed to one leaf. */
interface Piece {
  part: LegacyPart;
  widthMm: number;
  heightMm: number;
  panels?: SlidePanel[];
}

/** Collapse consecutive Slidding parts (same track + height) into pieces. */
function collapsePieces(parts: LegacyPart[]): Piece[] {
  const pieces: Piece[] = [];
  let i = 0;
  while (i < parts.length) {
    const part = parts[i];
    const w = num(part.width, 0);
    const h = num(part.height, 0);
    if (part.category_type !== 'Slidding') {
      pieces.push({ part, widthMm: w, heightMm: h });
      i++;
      continue;
    }
    const panels: SlidePanel[] = [];
    let total = 0;
    const track = part.is_track ?? null;
    while (
      i < parts.length &&
      parts[i].category_type === 'Slidding' &&
      (parts[i].is_track ?? null) === track &&
      Math.abs(num(parts[i].height, h) - h) <= 1
    ) {
      const pw = num(parts[i].width, 0);
      panels.push({ widthMm: pw, direction: slideDirection(parts[i].opening_direction) });
      total += pw;
      i++;
    }
    pieces.push({ part, widthMm: total, heightMm: h, panels });
  }
  return pieces;
}

function pieceNode(piece: Piece, sashFramed?: boolean): PaneNode {
  if (piece.panels) return slidingLeaf(piece.part, piece.panels);
  return casementLeaf(piece.part, sashFramed);
}

export function fromFullWindow(
  fw: FullWindow,
  opts?: LegacyOptions
): LegacyImport {
  resetIds();
  const f = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const face = opts?.dividerFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const parts = (fw.parts ?? []).map((p) => ({ ...p }));
  const notes: string[] = [];
  const w = num(fw.width, 0);
  const h = num(fw.height, 0);
  const first = parts[0] ?? {};
  const dayW = w - 2 * f;
  const dayH = h - 2 * f;

  const mullions = fw.mullion ?? [];
  const verticals = mullions.filter((m) => m.direction === 'vertical');
  const horizontals = mullions.filter((m) => m.direction === 'horizontal');
  const vProfile = verticals[0]?.product_id ?? null;
  const hProfile = horizontals[0]?.product_id ?? null;

  const pieces = collapsePieces(parts);
  let confidence: ImportConfidence = 'exact';

  const ySplitOf = (col: Piece[], colW: number): PaneNode => {
    if (col.length === 1) return pieceNode(col[0]);
    const heights = col.map((p) => p.heightMm);
    const node: SplitNode = {
      id: freshId(),
      kind: 'split',
      axis: 'y',
      dividerKind: 'mullion',
      dividerProfileId: hProfile,
      dividerFaceMm: face,
      positionsMm: positionsFromWidths(heights, face),
      lockedMm: heights.slice(1).map(() => false),
      children: col.map((p) => pieceNode(p)),
    };
    void colW;
    return node;
  };

  let root: PaneNode;

  if (mullions.length === 0) {
    if (pieces.length === 1) {
      // One piece: a plain leaf — except an Openable casement, which the
      // legacy screen always wrapped in a (possibly single-sash) palla
      // split, so reproduce that for payload fidelity.
      if (!pieces[0].panels && pieces[0].part.casement_type === 'Openable') {
        const child = casementLeaf(pieces[0].part, true);
        root = {
          id: freshId(),
          kind: 'split',
          axis: 'x',
          dividerKind: 'sash',
          dividerProfileId: null,
          dividerFaceMm: 0,
          positionsMm: [],
          lockedMm: [],
          children: [child],
        };
      } else {
        root = pieceNode(pieces[0]);
      }
    } else {
      // n casement sashes side by side — a sash (palla) split.
      const widths = pieces.map((p) => p.widthMm);
      root = {
        id: freshId(),
        kind: 'split',
        axis: 'x',
        dividerKind: 'sash',
        dividerProfileId: null,
        dividerFaceMm: 0,
        positionsMm: positionsFromWidths(widths, 0),
        lockedMm: widths.slice(1).map(() => false),
        children: pieces.map((p) => pieceNode(p, true)),
      };
      const sum = widths.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - dayW) > 2) {
        confidence = 'approximate';
        notes.push(`sash widths sum ${sum} ≠ daylight ${dayW}`);
      }
    }
  } else if (horizontals.length === 0) {
    // Vertical mullions only: one column per piece.
    if (pieces.length !== verticals.length + 1) {
      confidence = 'approximate';
      notes.push(
        `${verticals.length} vertical mullions but ${pieces.length} sections`
      );
    }
    const widths = pieces.map((p) => p.widthMm);
    root = {
      id: freshId(),
      kind: 'split',
      axis: 'x',
      dividerKind: 'mullion',
      dividerProfileId: vProfile,
      dividerFaceMm: face,
      positionsMm: positionsFromWidths(widths, face),
      lockedMm: widths.slice(1).map(() => false),
      children: pieces.map((p) => pieceNode(p)),
    };
  } else if (verticals.length === 0) {
    // Horizontal transoms only: one row per piece.
    if (pieces.length !== horizontals.length + 1) {
      confidence = 'approximate';
      notes.push(
        `${horizontals.length} transoms but ${pieces.length} sections`
      );
    }
    const heights = pieces.map((p) => p.heightMm);
    root = {
      id: freshId(),
      kind: 'split',
      axis: 'y',
      dividerKind: 'mullion',
      dividerProfileId: hProfile,
      dividerFaceMm: face,
      positionsMm: positionsFromWidths(heights, face),
      lockedMm: heights.slice(1).map(() => false),
      children: pieces.map((p) => pieceNode(p)),
    };
  } else {
    // Mixed mullions + transoms. The flat payload has no orientation per
    // section (design decision D3), so group pieces into columns: pieces
    // sharing a width whose heights (plus transom faces) stack to the
    // column height belong to one transom-split column.
    const columns: Piece[][] = [];
    let i = 0;
    while (i < pieces.length) {
      const col: Piece[] = [pieces[i]];
      let acc = pieces[i].heightMm;
      i++;
      while (
        i < pieces.length &&
        Math.abs(pieces[i].widthMm - col[0].widthMm) <= 1 &&
        acc + face + pieces[i].heightMm <= dayH + 2
      ) {
        acc += face + pieces[i].heightMm;
        col.push(pieces[i]);
        i++;
      }
      columns.push(col);
    }
    if (columns.length !== verticals.length + 1) {
      confidence = 'approximate';
      notes.push(
        `recovered ${columns.length} columns for ${verticals.length} vertical mullions`
      );
    }
    if (columns.length === 1) {
      root = ySplitOf(columns[0], columns[0][0].widthMm);
    } else {
      const widths = columns.map((c) => c[0].widthMm);
      root = {
        id: freshId(),
        kind: 'split',
        axis: 'x',
        dividerKind: 'mullion',
        dividerProfileId: vProfile,
        dividerFaceMm: face,
        positionsMm: positionsFromWidths(widths, face),
        lockedMm: widths.slice(1).map(() => false),
        children: columns.map((c) => ySplitOf(c, c[0].widthMm)),
      };
    }
  }

  return {
    design: baseDesign(first, w, h, root),
    source: 'full_window',
    confidence,
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* Flat legacy line (oldest data: first section only)                  */
/* ------------------------------------------------------------------ */

export function fromFlatLegacy(
  spec: LegacyPart,
  opts?: LegacyOptions
): LegacyImport {
  resetIds();
  const f = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const w = num(spec.width, 1500);
  const h = num(spec.height, 1200);
  const notes = [
    'imported from legacy design — please verify before re-saving',
  ];

  let root: PaneNode;
  if (spec.category_type === 'Slidding') {
    const n = Math.max(1, Math.min(10, Number(spec.palla_type) || 2));
    const panelW = (w - 2 * f) / n;
    const panels: SlidePanel[] = [];
    for (let i = 0; i < n; i++) {
      panels.push({ widthMm: panelW, direction: i % 2 === 0 ? 'Left' : 'Right' });
    }
    root = slidingLeaf(spec, panels);
  } else if (spec.casement_type === 'Openable') {
    const n = Math.max(1, Math.min(10, Number(spec.palla_type) || 1));
    const span = w - 2 * f;
    const children: LeafNode[] = [];
    for (let i = 0; i < n; i++) {
      const leaf = casementLeaf(spec, true);
      leaf.opening = {
        direction:
          n === 1
            ? spec.opening_direction ?? 'Left'
            : i % 2 === 0
            ? 'Left'
            : 'Right',
        handleId: spec.handle_id ?? null,
        hingesType: spec.hinges_type ?? null,
      };
      children.push(leaf);
    }
    const positionsMm: number[] = [];
    for (let i = 1; i < n; i++) positionsMm.push((i * span) / n);
    root = {
      id: freshId(),
      kind: 'split',
      axis: 'x',
      dividerKind: 'sash',
      dividerProfileId: null,
      dividerFaceMm: 0,
      positionsMm,
      lockedMm: positionsMm.map(() => false),
      children,
    };
  } else {
    root = casementLeaf(spec);
  }

  return {
    design: baseDesign(spec, w, h, root),
    source: 'flat',
    confidence: 'approximate',
    notes,
  };
}
