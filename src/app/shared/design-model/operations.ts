/**
 * design-model operations — every mutation of a WindowDesign goes through
 * one of these pure functions, each returning a NEW document (structural
 * sharing on untouched branches; the input is never modified). That is what
 * makes undo/redo trivial (history.ts) and renders deterministic.
 *
 * Every operation preserves the invariants checked by
 * {@link checkInvariants}: span changes cascade through resizeRegion
 * (resize.ts), which rescales nested splits and sliding panels and clamps
 * against each subtree's REQUIRED minimum, so no sequence of operations can
 * ever produce a pane below minimum size.
 */

import {
  DEFAULT_FRAME_FACE_MM,
  FRAME_MAX_MM,
  FRAME_MIN_MM,
  MIN_PANE_MM,
  LayoutOptions,
  effectiveFaceMm,
  regionOf,
  scaleShape,
  splitSpanMm,
  widthsFromPositions,
} from './geometry';
import { clampPositionsRequired, requiredAlong, resizeRegion } from './resize';
import {
  Axis,
  DESIGN_SCHEMA,
  DesignError,
  DividerKind,
  Frame,
  Glazing,
  Id,
  LeafNode,
  PaneNode,
  SplitNode,
  WindowDesign,
  findNode,
  findParent,
  isLeaf,
  isSplit,
  nextIdSeq,
} from './types';

export interface OpOptions extends LayoutOptions {
  minPaneMm?: number;
}

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

export function createLeaf(
  id: string,
  partial?: Partial<Omit<LeafNode, 'id' | 'kind'>>
): LeafNode {
  return {
    id,
    kind: 'leaf',
    category: 'Casement',
    casementType: 'Fixed',
    productId: null,
    sashId: null,
    ...partial,
  };
}

/** A fresh single-pane design (the designer's blank state). */
export function createDesign(partial?: {
  frame?: Partial<Frame>;
  productType?: 'Window' | 'Door';
  glazing?: Partial<Glazing>;
  root?: PaneNode;
}): WindowDesign {
  return {
    schema: DESIGN_SCHEMA,
    unit: 'mm',
    frame: {
      shape: { kind: 'rect' },
      widthMm: 1500,
      heightMm: 1200,
      productId: null,
      colorId: null,
      profileColor: '#ffffff',
      ...partial?.frame,
    },
    productType: partial?.productType ?? 'Window',
    glazing: { glassId: null, barsH: 0, barsV: 0, ...partial?.glazing },
    root: partial?.root ?? createLeaf('p1'),
  };
}

/* ------------------------------------------------------------------ */
/* Internal tree surgery (path-copying)                                */
/* ------------------------------------------------------------------ */

function replaceNode(
  node: PaneNode,
  id: string,
  replacer: (n: PaneNode) => PaneNode
): PaneNode {
  if (node.id === id) return replacer(node);
  if (isLeaf(node)) return node;
  let changed = false;
  const children = node.children.map((c) => {
    const next = replaceNode(c, id, replacer);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

function withRoot(design: WindowDesign, root: PaneNode): WindowDesign {
  return root === design.root ? design : { ...design, root };
}

function mustFind(design: WindowDesign, id: string): PaneNode {
  const node = findNode(design.root, id);
  if (!node) throw new DesignError(`no node with id '${id}'`);
  return node;
}

function mustSplit(design: WindowDesign, id: string): SplitNode {
  const node = mustFind(design, id);
  if (!isSplit(node)) throw new DesignError(`node '${id}' is not a split`);
  return node;
}

/** Cross-axis content size of a split's region (children all share it). */
function crossSizeMm(
  design: WindowDesign,
  split: SplitNode,
  opts?: OpOptions
): number {
  const region = regionOf(design, split.id, opts);
  return split.axis === 'x' ? region.content.hMm : region.content.wMm;
}

/**
 * Core position writer: clamp `positions` against every child's required
 * minimum, resize each child region accordingly, and return the design.
 */
function withPositions(
  design: WindowDesign,
  splitId: string,
  positions: number[],
  lockedMm: boolean[] | null,
  opts?: OpOptions
): WindowDesign {
  const split = mustSplit(design, splitId);
  const f = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const minPane = opts?.minPaneMm ?? MIN_PANE_MM;
  const face = effectiveFaceMm(split);
  const span = splitSpanMm(design, split, opts);
  const cross = crossSizeMm(design, split, opts);
  const mins = split.children.map((c) =>
    requiredAlong(c, split.axis, f, minPane)
  );
  const next = clampPositionsRequired(positions, face, span, mins);
  const widthsOld = widthsFromPositions(split.positionsMm, face, span);
  const widthsNew = widthsFromPositions(next, face, span);
  const children = split.children.map((c, i) =>
    split.axis === 'x'
      ? resizeRegion(c, widthsOld[i], cross, widthsNew[i], cross, f, minPane)
      : resizeRegion(c, cross, widthsOld[i], cross, widthsNew[i], f, minPane)
  );
  return withRoot(
    design,
    replaceNode(design.root, splitId, (n) => ({
      ...(n as SplitNode),
      positionsMm: next,
      lockedMm: lockedMm ?? (n as SplitNode).lockedMm,
      children,
    }))
  );
}

/* ------------------------------------------------------------------ */
/* Split / divider operations                                          */
/* ------------------------------------------------------------------ */

export interface SplitPaneOptions extends OpOptions {
  dividerKind?: DividerKind;
  dividerProfileId?: Id | null;
  dividerFaceMm?: number;
}

/**
 * Split a LEAF pane along `axis` at centreline `positionMm` (mm from the
 * pane's left/top daylight edge). Both children inherit the leaf's spec.
 * The position is clamped so both children keep `minPaneMm`.
 */
export function splitPane(
  design: WindowDesign,
  paneId: string,
  axis: Axis,
  positionMm: number,
  opts?: SplitPaneOptions
): WindowDesign {
  const node = mustFind(design, paneId);
  if (!isLeaf(node)) throw new DesignError(`node '${paneId}' is already split`);
  const kind = opts?.dividerKind ?? 'mullion';
  const faceMm =
    kind === 'sash' ? 0 : opts?.dividerFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const minPane = opts?.minPaneMm ?? MIN_PANE_MM;

  const region = regionOf(design, paneId, opts);
  const span = axis === 'x' ? region.content.wMm : region.content.hMm;
  if (span < 2 * minPane + faceMm) {
    throw new DesignError(
      `pane '${paneId}' is too small to split (${span} mm daylight)`
    );
  }
  const lo = faceMm / 2 + minPane;
  const hi = span - faceMm / 2 - minPane;
  const pos = Math.min(hi, Math.max(lo, positionMm));

  let seq = nextIdSeq(design.root);
  // Each half is the pane it came from. The panels of a sliding pane are
  // sized in mm, so across a vertical divider they shrink with their half:
  // kept at the old widths they would overlap and be priced as two windows
  // of the full width.
  const inherit = (widthMm: number): LeafNode => {
    const leaf: LeafNode = { ...node, id: `p${seq++}` };
    if (axis !== 'x' || !node.slide || span <= 0) return leaf;
    const ratio = widthMm / span;
    return {
      ...leaf,
      slide: { ...node.slide, panels: node.slide.panels.map((p) => ({ ...p, widthMm: p.widthMm * ratio })) },
    };
  };
  const split: SplitNode = {
    id: node.id,
    kind: 'split',
    axis,
    dividerKind: kind,
    dividerProfileId: kind === 'sash' ? null : opts?.dividerProfileId ?? null,
    dividerFaceMm: faceMm,
    positionsMm: [pos],
    lockedMm: [false],
    children: [inherit(pos - faceMm / 2), inherit(span - pos - faceMm / 2)],
    ...(node.sashFramed ? { sashFramed: true } : {}),
  };
  return withRoot(design, replaceNode(design.root, paneId, () => split));
}

/**
 * Replace a LEAF with `count` equal sash (palla) divisions — the 2-sash /
 * n-palla casement representation the legacy screen builds with
 * `_applyPallaDivisions`. Children are sash-framed and alternate
 * Left/Right opening directions exactly like the legacy seeding. `count`
 * of 1 still produces a (single-child) sash split, mirroring the legacy
 * payload for a 1-palla openable window.
 */
export function splitPaneEqualSash(
  design: WindowDesign,
  paneId: string,
  count: number,
  opts?: OpOptions & { axis?: Axis }
): WindowDesign {
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new DesignError(`invalid sash division count ${count}`);
  }
  const node = mustFind(design, paneId);
  if (!isLeaf(node)) throw new DesignError(`node '${paneId}' is already split`);
  const axis = opts?.axis ?? 'x';
  const region = regionOf(design, paneId, opts);
  const span = axis === 'x' ? region.content.wMm : region.content.hMm;

  let seq = nextIdSeq(design.root);
  const children: LeafNode[] = [];
  for (let i = 0; i < count; i++) {
    children.push({
      ...node,
      id: `p${seq++}`,
      sashFramed: true,
      opening: {
        direction: i % 2 === 0 ? 'Left' : 'Right',
        handleId: node.opening?.handleId ?? null,
        hingesType: node.opening?.hingesType ?? null,
      },
    });
  }
  const positionsMm: number[] = [];
  for (let i = 1; i < count; i++) positionsMm.push((i * span) / count);
  const split: SplitNode = {
    id: node.id,
    kind: 'split',
    axis,
    dividerKind: 'sash',
    dividerProfileId: null,
    dividerFaceMm: 0,
    positionsMm,
    lockedMm: positionsMm.map(() => false),
    children,
    ...(node.sashFramed ? { sashFramed: true } : {}),
  };
  return withRoot(design, replaceNode(design.root, paneId, () => split));
}

/**
 * Move divider `index` of split `splitId` to centreline `positionMm`,
 * clamped so both neighbouring subtrees keep their minimum sizes. Nested
 * splits and sliding panels in the two affected children rescale with
 * their new span. Lock state is unchanged.
 */
export function moveDivider(
  design: WindowDesign,
  splitId: string,
  index: number,
  positionMm: number,
  opts?: OpOptions
): WindowDesign {
  return setDividerPosition(design, splitId, index, positionMm, false, opts);
}

/**
 * Typed "exact mm" on a divider: moves it AND marks it locked so it keeps
 * its mm offset on later frame resizes.
 */
export function setDividerMm(
  design: WindowDesign,
  splitId: string,
  index: number,
  positionMm: number,
  opts?: OpOptions
): WindowDesign {
  return setDividerPosition(design, splitId, index, positionMm, true, opts);
}

function setDividerPosition(
  design: WindowDesign,
  splitId: string,
  index: number,
  positionMm: number,
  lock: boolean,
  opts?: OpOptions
): WindowDesign {
  const split = mustSplit(design, splitId);
  if (index < 0 || index >= split.positionsMm.length) {
    throw new DesignError(`split '${splitId}' has no divider ${index}`);
  }
  const positions = split.positionsMm.slice();
  positions[index] = positionMm;
  const lockedMm = lock ? split.lockedMm.slice() : null;
  if (lockedMm) lockedMm[index] = true;
  return withPositions(design, splitId, positions, lockedMm, opts);
}

/**
 * Typed exact pane size: sets the ADJACENT divider so pane `paneId` gets
 * `sizeMm` daylight along its parent split's axis, and locks that divider
 * (the legacy typed-resize semantics). The last child adjusts the divider
 * on its left/top; every other child adjusts the one on its right/bottom.
 */
export function setPaneSizeMm(
  design: WindowDesign,
  paneId: string,
  sizeMm: number,
  opts?: OpOptions
): WindowDesign {
  const parent = findParent(design.root, paneId);
  if (!parent) throw new DesignError(`pane '${paneId}' has no parent split`);
  const i = parent.children.findIndex((c) => c.id === paneId);
  const n = parent.children.length;
  const face = effectiveFaceMm(parent);
  if (n === 1) throw new DesignError('single-child split has no divider to move');
  if (i < n - 1) {
    const leftEdge = i === 0 ? 0 : parent.positionsMm[i - 1] + face / 2;
    return setDividerMm(design, parent.id, i, leftEdge + sizeMm + face / 2, opts);
  }
  const span = splitSpanMm(design, parent, opts);
  return setDividerMm(design, parent.id, i - 1, span - sizeMm - face / 2, opts);
}

/** Equalise the children of a split (reference-parity "equalize" tool). */
export function equalize(
  design: WindowDesign,
  splitId: string,
  opts?: OpOptions
): WindowDesign {
  const split = mustSplit(design, splitId);
  const span = splitSpanMm(design, split, opts);
  const n = split.children.length;
  const face = effectiveFaceMm(split);
  const child = (span - (n - 1) * face) / n;
  const positionsMm: number[] = [];
  for (let k = 1; k < n; k++) positionsMm.push(k * child + (k - 1) * face + face / 2);
  return withPositions(
    design,
    splitId,
    positionsMm,
    positionsMm.map(() => false),
    opts
  );
}

/**
 * Remove divider `index` from a split, merging children `index` and
 * `index+1` into the one at `index` (its spec wins — the UI confirms first
 * when the two specs differ). When the last divider goes, the split node
 * itself is replaced by the merged child. A merged child that is itself a
 * split keeps its proportions (positions rescale into the grown region).
 */
export function removeDivider(
  design: WindowDesign,
  splitId: string,
  index: number,
  opts?: OpOptions
): WindowDesign {
  const split = mustSplit(design, splitId);
  if (index < 0 || index >= split.positionsMm.length) {
    throw new DesignError(`split '${splitId}' has no divider ${index}`);
  }
  const f = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const minPane = opts?.minPaneMm ?? MIN_PANE_MM;
  const span = splitSpanMm(design, split, opts);
  const cross = crossSizeMm(design, split, opts);
  const face = effectiveFaceMm(split);
  const widths = widthsFromPositions(split.positionsMm, face, span);
  const mergedWidth = widths[index] + face + widths[index + 1];
  const keep =
    split.axis === 'x'
      ? resizeRegion(split.children[index], widths[index], cross, mergedWidth, cross, f, minPane)
      : resizeRegion(split.children[index], cross, widths[index], cross, mergedWidth, f, minPane);

  const children = split.children.slice();
  children.splice(index, 2, keep);
  const positionsMm = split.positionsMm.slice();
  positionsMm.splice(index, 1);
  const lockedMm = split.lockedMm.slice();
  lockedMm.splice(index, 1);

  const replacement: PaneNode =
    positionsMm.length === 0
      ? { ...keep, id: split.id }
      : { ...split, children, positionsMm, lockedMm };
  return withRoot(design, replaceNode(design.root, splitId, () => replacement));
}

export { LeafSpecPatch, setLeafSpec, setSlide } from './leaf-ops';

/* ------------------------------------------------------------------ */
/* Frame operations                                                    */
/* ------------------------------------------------------------------ */

/**
 * Resize the outer frame, clamped to the form's 200–5800 mm bounds AND to
 * the tree's required minimum (every pane keeps `minPaneMm`). Unlocked
 * dividers scale proportionally; locked dividers keep their mm offset
 * (clamped); sliding panels scale with their leaf's daylight width.
 */
export function resizeFrame(
  design: WindowDesign,
  widthMm: number,
  heightMm: number,
  opts?: OpOptions
): WindowDesign {
  const f = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const minPane = opts?.minPaneMm ?? MIN_PANE_MM;
  const minW = Math.max(
    FRAME_MIN_MM,
    requiredAlong(design.root, 'x', f, minPane) + 2 * f
  );
  const minH = Math.max(
    FRAME_MIN_MM,
    requiredAlong(design.root, 'y', f, minPane) + 2 * f
  );
  let w = Math.min(FRAME_MAX_MM, Math.max(minW, widthMm));
  let h = Math.min(FRAME_MAX_MM, Math.max(minH, heightMm));
  if (design.frame.shape.kind === 'circle') {
    // Phase 3: a circle's frame box is its bounding square — the side
    // the caller actually changed drives both (width wins a tie).
    const side =
      w !== design.frame.widthMm ? Math.max(w, minH) : Math.max(h, minW);
    w = side;
    h = side;
  }
  if (w === design.frame.widthMm && h === design.frame.heightMm) return design;
  const root = resizeRegion(
    design.root,
    design.frame.widthMm - 2 * f,
    design.frame.heightMm - 2 * f,
    w - 2 * f,
    h - 2 * f,
    f,
    minPane
  );
  // Phase 3: shape mm parameters follow the frame ('rect' is returned as-is).
  const shape = scaleShape(
    design.frame.shape,
    design.frame.widthMm,
    design.frame.heightMm,
    w,
    h
  );
  return {
    ...design,
    frame: { ...design.frame, shape, widthMm: w, heightMm: h },
    root,
  };
}

/** Patch frame product / colour / profile colour. */
export function setFrameSpec(
  design: WindowDesign,
  patch: Partial<Omit<Frame, 'shape' | 'widthMm' | 'heightMm'>>
): WindowDesign {
  return { ...design, frame: { ...design.frame, ...patch } };
}

/** Patch glazing (glass product, bar counts). */
export function setGlazing(
  design: WindowDesign,
  patch: Partial<Glazing>
): WindowDesign {
  return { ...design, glazing: { ...design.glazing, ...patch } };
}
