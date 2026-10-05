/**
 * design-model palla bars — dividing ONE palla (an opening sash, a framed
 * fixed palla or a sliding shutter) with bars it carries itself.
 *
 * A frame mullion / transom (operations.ts splitPane) turns one pane into
 * two panes, each with its own opening and its own price. A palla bar does
 * not: the sash stays one sash with one handle, the shutter stays one
 * shutter on its track, and the bar sits inside its sash frame and moves
 * with it. See {@link PallaBars} for how it is stored.
 *
 * Same op contract as operations.ts: every mutation returns a new document.
 */

import { Layout, LayoutOptions, RectMm, layout } from './geometry';
import { slideLayout } from './slide';
import {
  Axis,
  DesignError,
  LeafNode,
  PallaBars,
  PaneNode,
  WindowDesign,
  findNode,
  isLeaf,
} from './types';

/** Face width a palla bar is drawn with, mm. */
export const PALLA_BAR_FACE_MM = 40;
/** A bar centreline keeps this far from the palla's edge (sash member + glass), mm. */
export const PALLA_BAR_EDGE_MM = 120;
/** Two bars of one palla keep this far apart, centre to centre, mm. */
export const PALLA_BAR_GAP_MM = 100;

/** One palla: a leaf, or one shutter of a sliding leaf. */
export interface PallaRef {
  paneId: string;
  /** Set for a shutter of a sliding leaf. */
  panelIndex?: number;
}

export interface PallaBarLayout extends PallaRef {
  /** Index into the palla's `bars.at`. */
  index: number;
  axis: Axis;
  /** The bar, across the palla's full outer rect. */
  rect: RectMm;
  /** The palla's outer rect. */
  palla: RectMm;
}

/**
 * True when a split of this pane is carried by a palla: any sliding leaf
 * (its shutters), an opening sash, a framed fixed palla. Plain fixed glass
 * is divided by a real frame mullion / transom instead.
 */
export function carriesBars(leaf: LeafNode): boolean {
  if (leaf.category === 'Slidding') return !!leaf.slide;
  return leaf.casementType === 'Openable' || !!leaf.sashFramed;
}

/** The bars of a palla (undefined = undivided). */
export function pallaBarsOf(leaf: LeafNode, panelIndex?: number): PallaBars | undefined {
  if (leaf.category === 'Slidding') {
    return leaf.slide?.panels[panelIndex ?? 0]?.bars;
  }
  return leaf.bars;
}

/** Outer rect of a palla inside its leaf's rect. */
export function pallaRectMm(leaf: LeafNode, rect: RectMm, panelIndex?: number): RectMm {
  if (leaf.category !== 'Slidding' || !leaf.slide) return rect;
  const panel = slideLayout(leaf.slide, rect.wMm).panels[panelIndex ?? 0];
  if (!panel) return rect;
  return { xMm: rect.xMm + panel.xMm, yMm: rect.yMm, wMm: panel.widthMm, hMm: rect.hMm };
}

/** Every palla bar of the design, in mm (what the canvas hit-tests). */
export function pallaBarLayouts(lay: Layout): PallaBarLayout[] {
  const out: PallaBarLayout[] = [];
  const add = (ref: PallaRef, bars: PallaBars | undefined, palla: RectMm): void => {
    if (!bars) return;
    bars.at.forEach((at, index) => {
      const half = PALLA_BAR_FACE_MM / 2;
      out.push({
        ...ref,
        index,
        axis: bars.axis,
        palla,
        rect:
          bars.axis === 'x'
            ? { xMm: palla.xMm + at * palla.wMm - half, yMm: palla.yMm, wMm: 2 * half, hMm: palla.hMm }
            : { xMm: palla.xMm, yMm: palla.yMm + at * palla.hMm - half, wMm: palla.wMm, hMm: 2 * half },
      });
    });
  };
  for (const { leaf, rect } of lay.leaves) {
    if (leaf.category === 'Slidding' && leaf.slide) {
      leaf.slide.panels.forEach((p, i) =>
        add({ paneId: leaf.id, panelIndex: i }, p.bars, pallaRectMm(leaf, rect, i))
      );
    } else {
      add({ paneId: leaf.id }, leaf.bars, rect);
    }
  }
  return out;
}

/** Where the parts of a divided palla are, as fractions: [0, ...at, 1]. */
export function pallaPartCount(bars: PallaBars | undefined): number {
  return bars ? bars.at.length + 1 : 1;
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

function mustPalla(design: WindowDesign, ref: PallaRef): LeafNode {
  const node = findNode(design.root, ref.paneId);
  if (!node) throw new DesignError(`no node with id '${ref.paneId}'`);
  if (!isLeaf(node)) throw new DesignError(`node '${ref.paneId}' is not a pane`);
  if (!carriesBars(node)) {
    throw new DesignError(`pane '${ref.paneId}' is fixed glass: it takes a frame divider`);
  }
  if (node.category === 'Slidding') {
    const n = node.slide?.panels.length ?? 0;
    const i = ref.panelIndex ?? 0;
    if (i < 0 || i >= n) throw new DesignError(`sliding leaf '${ref.paneId}' has no shutter ${i}`);
  }
  return node;
}

function spanMm(design: WindowDesign, leaf: LeafNode, ref: PallaRef, axis: Axis, opts?: LayoutOptions): number {
  const nl = layout(design, opts).nodes.get(leaf.id);
  if (!nl) throw new DesignError(`no node with id '${leaf.id}'`);
  const palla = pallaRectMm(leaf, nl.rect, ref.panelIndex);
  return axis === 'x' ? palla.wMm : palla.hMm;
}

function writeBars(design: WindowDesign, ref: PallaRef, bars: PallaBars | undefined): WindowDesign {
  const visit = (node: PaneNode): PaneNode => {
    if (isLeaf(node)) {
      if (node.id !== ref.paneId) return node;
      if (node.category === 'Slidding' && node.slide) {
        const index = ref.panelIndex ?? 0;
        const panels = node.slide.panels.map((p, i) => {
          if (i !== index) return p;
          const next = { ...p };
          if (bars) next.bars = bars;
          else delete next.bars;
          return next;
        });
        return { ...node, slide: { ...node.slide, panels } };
      }
      const next = { ...node };
      if (bars) next.bars = bars;
      else delete next.bars;
      return next;
    }
    let changed = false;
    const children = node.children.map((c) => {
      const n = visit(c);
      if (n !== c) changed = true;
      return n;
    });
    return changed ? { ...node, children } : node;
  };
  const root = visit(design.root);
  return root === design.root ? design : { ...design, root };
}

/** Clamp bar `index` between the palla's edge and its neighbour bars. */
function clampAt(at: number[], index: number, value: number, span: number): number {
  const lo = index === 0 ? PALLA_BAR_EDGE_MM / span : at[index - 1] + PALLA_BAR_GAP_MM / span;
  const hi =
    index === at.length - 1 ? 1 - PALLA_BAR_EDGE_MM / span : at[index + 1] - PALLA_BAR_GAP_MM / span;
  if (hi < lo) throw new DesignError('the palla is too small for another bar');
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Divide ONE palla with a bar at fraction `at` (0..1) of its width (axis
 * 'x') or height (axis 'y'). A palla carries bars in one direction: asking
 * for the other one on a palla that is already divided throws.
 */
export function splitPalla(
  design: WindowDesign,
  ref: PallaRef,
  axis: Axis,
  at: number,
  opts?: LayoutOptions
): WindowDesign {
  const leaf = mustPalla(design, ref);
  const cur = pallaBarsOf(leaf, ref.panelIndex);
  if (cur && cur.axis !== axis) {
    throw new DesignError(
      `the palla already has ${cur.axis === 'x' ? 'vertical' : 'horizontal'} bars: remove them first`
    );
  }
  const span = spanMm(design, leaf, ref, axis, opts);
  const list = cur ? cur.at.slice() : [];
  let index = list.findIndex((v) => v > at);
  if (index < 0) index = list.length;
  list.splice(index, 0, at);
  // The new bar is fitted between its neighbours; they do not move.
  list[index] = clampAt(list, index, at, span);
  return writeBars(design, ref, { axis, at: list });
}

/** Move bar `index` of a palla to fraction `at`, kept clear of the edges and of its neighbours. */
export function movePallaBar(
  design: WindowDesign,
  ref: PallaRef,
  index: number,
  at: number,
  opts?: LayoutOptions
): WindowDesign {
  const leaf = mustPalla(design, ref);
  const cur = pallaBarsOf(leaf, ref.panelIndex);
  if (!cur || index < 0 || index >= cur.at.length) {
    throw new DesignError(`palla '${ref.paneId}' has no bar ${index}`);
  }
  const span = spanMm(design, leaf, ref, cur.axis, opts);
  const list = cur.at.slice();
  list[index] = clampAt(list, index, at, span);
  if (list[index] === cur.at[index]) return design;
  return writeBars(design, ref, { axis: cur.axis, at: list });
}

/** Remove bar `index`: its two parts become one again (the last bar leaves the palla undivided). */
export function removePallaBar(design: WindowDesign, ref: PallaRef, index: number): WindowDesign {
  const leaf = mustPalla(design, ref);
  const cur = pallaBarsOf(leaf, ref.panelIndex);
  if (!cur || index < 0 || index >= cur.at.length) {
    throw new DesignError(`palla '${ref.paneId}' has no bar ${index}`);
  }
  const list = cur.at.filter((_, i) => i !== index);
  return writeBars(design, ref, list.length ? { axis: cur.axis, at: list } : undefined);
}

/** Problems with the stored bars of a design (empty = valid). */
export function checkPallaBars(root: PaneNode): string[] {
  const problems: string[] = [];
  const check = (where: string, bars: PallaBars | undefined): void => {
    if (!bars) return;
    if (bars.axis !== 'x' && bars.axis !== 'y') problems.push(`${where}: bars axis`);
    if (!Array.isArray(bars.at) || !bars.at.length) {
      problems.push(`${where}: bars need at least one position`);
      return;
    }
    bars.at.forEach((v, i) => {
      if (!(v > 0 && v < 1)) problems.push(`${where}: bar ${i} at ${v} is outside the palla`);
      if (i > 0 && !(v > bars.at[i - 1])) problems.push(`${where}: bars not strictly increasing`);
    });
  };
  const visit = (node: PaneNode): void => {
    if (!isLeaf(node)) {
      node.children.forEach(visit);
      return;
    }
    check(`pane '${node.id}'`, node.bars);
    if (node.bars && node.category === 'Slidding') {
      problems.push(`sliding leaf '${node.id}' carries bars on the leaf, not on a shutter`);
    }
    node.slide?.panels.forEach((p, i) => check(`pane '${node.id}' shutter ${i}`, p.bars));
  };
  visit(root);
  return problems;
}

/* ------------------------------------------------------------------ */
/* Sizes for the price                                                 */
/* ------------------------------------------------------------------ */

/**
 * Face of the sash member a bar ends on, mm, when the price needs the bar's
 * length: the faces the canvas draws a sash with when the catalogue gives
 * none (render-common DEFAULT_SASH_FACES).
 */
export const PALLA_SASH_FACE_MM = { casement: 48, sliding: 45 };

/**
 * The size of every part of a divided palla, in reading order (left to
 * right, or top to bottom): from the palla's edge, or from the face of a
 * bar, to the next one. These are the figures the canvas labels the parts
 * with (render-bars drawPallaPartLabels).
 */
export function pallaPartSizesMm(bars: PallaBars, palla: RectMm): { wMm: number; hMm: number }[] {
  const alongX = bars.axis === 'x';
  const span = alongX ? palla.wMm : palla.hMm;
  const half = PALLA_BAR_FACE_MM / 2;
  const edges = [0, ...bars.at.map((at) => at * span), span];
  const last = edges.length - 2;
  const out: { wMm: number; hMm: number }[] = [];
  for (let i = 0; i <= last; i++) {
    const size = edges[i + 1] - (i === last ? 0 : half) - (edges[i] + (i === 0 ? 0 : half));
    out.push(
      alongX
        ? { wMm: Math.round(size), hMm: Math.round(palla.hMm) }
        : { wMm: Math.round(palla.wMm), hMm: Math.round(size) }
    );
  }
  return out;
}

/**
 * Length of one bar of a palla, mm: across the palla from glass edge to
 * glass edge, which is the palla less the sash member at both ends.
 */
export function pallaBarLengthMm(bars: PallaBars, palla: RectMm, sashFaceMm: number): number {
  const across = bars.axis === 'x' ? palla.hMm : palla.wMm;
  return Math.max(1, Math.round(across - 2 * sashFaceMm));
}
