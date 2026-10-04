/**
 * design-model geometry — the ONE place daylight sizes are computed.
 *
 * The renderer, the dimension labels and the priced sizes all derive from
 * this layout, so they can never disagree (the class of bug B2).
 *
 * All mm values are kept EXACT (no rounding) — rounding happens only when
 * the pricing payload is emitted (payload.ts), mirroring the legacy
 * component which rounds with Math.round at payload time only.
 *
 * Geometry contract (byte-compatible with sub-quotation-design.component):
 *  - root daylight = frame outer − 2 × frameFaceMm on each axis;
 *  - a split's available span = its content span − (n−1) × dividerFaceMm;
 *  - divider centreline positions ↔ child widths:
 *      w_1 = p_1 − f/2;  w_k = p_k − p_{k−1} − f;  w_n = S − p_{n−1} − f/2
 *    (so Σw = S − (n−1)·f always holds by construction);
 *  - a vertical divider's run length = the split region's content HEIGHT,
 *    a horizontal divider's run length = the region's content WIDTH;
 *  - a sashFramed region's content insets by frameFaceMm on all sides.
 */

import {
  DesignError,
  LeafNode,
  PaneNode,
  SplitNode,
  WindowDesign,
  isLeaf,
} from './types';

/** Default profile face widths (constConfig defaults in the web app). */
export const DEFAULT_FRAME_FACE_MM = 60;
/** Minimum pane daylight size enforced by interactive operations. */
export const MIN_PANE_MM = 50;
/** Frame outer size clamps (same 200–5800 the form validators enforce). */
export const FRAME_MIN_MM = 200;
export const FRAME_MAX_MM = 5800;

export interface LayoutOptions {
  /** Outer frame profile face width in mm (default 60). */
  frameFaceMm?: number;
}

/** A region in mm, relative to the frame's outer top-left corner. */
export interface RectMm {
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
}

export interface LeafLayout {
  leaf: LeafNode;
  /** The leaf's outer region (what parts[]/sections[] report). */
  rect: RectMm;
}

export interface DividerLayout {
  split: SplitNode;
  /** Index into split.positionsMm. */
  index: number;
  direction: 'vertical' | 'horizontal';
  /** Daylight run of the bar (exact mm; payload rounds). */
  lengthMm: number;
  rect: RectMm;
}

export interface NodeLayout {
  node: PaneNode;
  rect: RectMm;
  /** Content rect (= rect unless the node is sashFramed). */
  content: RectMm;
}

export interface Layout {
  /** Daylight interior of the outer frame. */
  daylight: RectMm;
  /** Every leaf in depth-first reading order (the payload order). */
  leaves: LeafLayout[];
  /**
   * Every divider in the legacy component's emit order: within a split,
   * child i's whole subtree is visited before divider i.
   */
  dividers: DividerLayout[];
  /** Every node's region, keyed by node id. */
  nodes: Map<string, NodeLayout>;
}

/** Child daylight sizes from divider centrelines (exact arithmetic). */
export function widthsFromPositions(
  positionsMm: number[],
  faceMm: number,
  spanMm: number
): number[] {
  const n = positionsMm.length + 1;
  if (n === 1) return [spanMm];
  const widths: number[] = [];
  for (let i = 0; i < n; i++) {
    const left = i === 0 ? 0 : positionsMm[i - 1] + faceMm / 2;
    const right = i === n - 1 ? spanMm : positionsMm[i] - faceMm / 2;
    widths.push(right - left);
  }
  return widths;
}

/** Divider centrelines from child daylight sizes (inverse of the above). */
export function positionsFromWidths(
  widthsMm: number[],
  faceMm: number
): number[] {
  const positions: number[] = [];
  let acc = 0;
  for (let i = 0; i < widthsMm.length - 1; i++) {
    acc += widthsMm[i];
    positions.push(acc + faceMm / 2);
    acc += faceMm;
  }
  return positions;
}

/** Daylight interior size of the frame. */
export function daylightOf(
  design: WindowDesign,
  opts?: LayoutOptions
): { wMm: number; hMm: number } {
  const f = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  return {
    wMm: design.frame.widthMm - 2 * f,
    hMm: design.frame.heightMm - 2 * f,
  };
}

/** Effective divider face: 0 for 'sash' kind regardless of the stored value. */
export function effectiveFaceMm(split: SplitNode): number {
  return (split.dividerKind ?? 'mullion') === 'sash' ? 0 : split.dividerFaceMm;
}

/**
 * Compute the full layout of a design. Throws {@link DesignError} when the
 * tree is structurally inconsistent (counts mismatch); value-range problems
 * (negative pane, out-of-order positions) are reported by checkInvariants
 * instead so a layout stays computable for diagnosis.
 */
export function layout(design: WindowDesign, opts?: LayoutOptions): Layout {
  const f = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const daylight: RectMm = {
    xMm: f,
    yMm: f,
    wMm: design.frame.widthMm - 2 * f,
    hMm: design.frame.heightMm - 2 * f,
  };
  const out: Layout = {
    daylight,
    leaves: [],
    dividers: [],
    nodes: new Map<string, NodeLayout>(),
  };

  const visit = (node: PaneNode, rect: RectMm): void => {
    const content: RectMm = node.sashFramed
      ? {
          xMm: rect.xMm + f,
          yMm: rect.yMm + f,
          wMm: rect.wMm - 2 * f,
          hMm: rect.hMm - 2 * f,
        }
      : rect;
    out.nodes.set(node.id, { node, rect, content });

    if (isLeaf(node)) {
      out.leaves.push({ leaf: node, rect });
      return;
    }

    const split = node;
    const n = split.children.length;
    if (split.positionsMm.length !== n - 1) {
      throw new DesignError(
        `split ${split.id}: ${n} children need ${n - 1} positions, got ${split.positionsMm.length}`
      );
    }
    const face = effectiveFaceMm(split);
    const vertical = split.axis === 'x';
    const span = vertical ? content.wMm : content.hMm;
    const widths = widthsFromPositions(split.positionsMm, face, span);

    let cursor = vertical ? content.xMm : content.yMm;
    for (let i = 0; i < n; i++) {
      const childRect: RectMm = vertical
        ? { xMm: cursor, yMm: content.yMm, wMm: widths[i], hMm: content.hMm }
        : { xMm: content.xMm, yMm: cursor, wMm: content.wMm, hMm: widths[i] };
      visit(split.children[i], childRect);
      if (i < n - 1) {
        const barStart = cursor + widths[i];
        if ((split.dividerKind ?? 'mullion') === 'mullion') {
          out.dividers.push({
            split,
            index: i,
            direction: vertical ? 'vertical' : 'horizontal',
            lengthMm: vertical ? content.hMm : content.wMm,
            rect: vertical
              ? { xMm: barStart, yMm: content.yMm, wMm: face, hMm: content.hMm }
              : { xMm: content.xMm, yMm: barStart, wMm: content.wMm, hMm: face },
          });
        }
      }
      cursor += widths[i] + face;
    }
  };

  visit(design.root, daylight);
  return out;
}

/** The region (outer + content) of one node; throws if the id is unknown. */
export function regionOf(
  design: WindowDesign,
  nodeId: string,
  opts?: LayoutOptions
): NodeLayout {
  const found = layout(design, opts).nodes.get(nodeId);
  if (!found) throw new DesignError(`no node with id '${nodeId}'`);
  return found;
}

/**
 * The span (along the split axis) available to a split's positions, i.e.
 * the split node's CONTENT size on that axis.
 */
export function splitSpanMm(
  design: WindowDesign,
  split: SplitNode,
  opts?: LayoutOptions
): number {
  const region = regionOf(design, split.id, opts);
  return split.axis === 'x' ? region.content.wMm : region.content.hMm;
}

/**
 * Valid centreline range for divider `index` of `split` such that both
 * neighbouring panes keep at least `minPaneMm` daylight.
 */
export function dividerRangeMm(
  split: SplitNode,
  spanMm: number,
  index: number,
  minPaneMm: number = MIN_PANE_MM
): { minMm: number; maxMm: number } {
  const face = effectiveFaceMm(split);
  const prev = index === 0 ? null : split.positionsMm[index - 1];
  const next =
    index === split.positionsMm.length - 1
      ? null
      : split.positionsMm[index + 1];
  const minMm =
    prev === null ? face / 2 + minPaneMm : prev + face + minPaneMm;
  const maxMm =
    next === null ? spanMm - face / 2 - minPaneMm : next - face - minPaneMm;
  return { minMm, maxMm };
}

/**
 * Snap targets for divider `index`: 10 mm grid handled by the caller via
 * `gridMm`; this returns the structural targets — span midpoint, equal-pane
 * positions, and alignment with divider centrelines in sibling splits of
 * the same axis (passed in by the caller as `siblingPositions`).
 */
export function snapDividerMm(
  split: SplitNode,
  spanMm: number,
  index: number,
  rawMm: number,
  opts?: {
    gridMm?: number;
    toleranceMm?: number;
    siblingPositionsMm?: number[];
    minPaneMm?: number;
  }
): number {
  const grid = opts?.gridMm ?? 10;
  const tol = opts?.toleranceMm ?? 8;
  const face = effectiveFaceMm(split);
  const n = split.children.length;

  const targets: number[] = [spanMm / 2];
  // Equal-pane position for THIS divider if all panes were equalised.
  const equalWidth = (spanMm - (n - 1) * face) / n;
  targets.push((index + 1) * equalWidth + index * face + face / 2);
  for (const p of opts?.siblingPositionsMm ?? []) targets.push(p);

  let best = rawMm;
  let bestDist = tol + 1;
  for (const t of targets) {
    const d = Math.abs(t - rawMm);
    if (d <= tol && d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  if (bestDist > tol && grid > 0) {
    best = Math.round(rawMm / grid) * grid;
  }
  const range = dividerRangeMm(split, spanMm, index, opts?.minPaneMm);
  return Math.min(range.maxMm, Math.max(range.minMm, best));
}
