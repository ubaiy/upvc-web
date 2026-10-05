/**
 * design-model glass per pane.
 *
 * The window has ONE glass (`glazing.glassId`). A pane may carry its own in
 * `leaf.glassId`; a pane without one uses the window's. So a document saved
 * before this field existed means exactly what it always meant, and a pane
 * never stores the window's own glass as an override (one way to write one
 * window).
 *
 * Same op contract as operations.ts: every mutation returns a new immutable
 * document and leaves its input untouched.
 */

import {
  DesignError,
  Id,
  LeafNode,
  PaneNode,
  WindowDesign,
  findNode,
  isLeaf,
  walkLeaves,
} from './types';

const sameId = (a: Id | null | undefined, b: Id | null | undefined): boolean =>
  (a ?? null) === null || (b ?? null) === null
    ? (a ?? null) === (b ?? null)
    : String(a) === String(b);

/** The glass this pane is glazed with: its own, else the window's. */
export function paneGlassId(design: WindowDesign, leaf: LeafNode): Id | null {
  return leaf.glassId ?? design.glazing.glassId ?? null;
}

/** True when the pane's glass is not the window's. */
export function hasOwnGlass(design: WindowDesign, leaf: LeafNode): boolean {
  return (
    leaf.glassId !== null &&
    leaf.glassId !== undefined &&
    !sameId(leaf.glassId, design.glazing.glassId)
  );
}

function mapLeaves(node: PaneNode, fn: (leaf: LeafNode) => LeafNode): PaneNode {
  if (isLeaf(node)) return fn(node);
  let changed = false;
  const children = node.children.map((c) => {
    const next = mapLeaves(c, fn);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

function withGlass(leaf: LeafNode, glassId: Id | null, windowGlass: Id | null): LeafNode {
  const own = glassId !== null && !sameId(glassId, windowGlass);
  if (!own) {
    if (!('glassId' in leaf)) return leaf;
    const next = { ...leaf };
    delete next.glassId;
    return next;
  }
  if (sameId(leaf.glassId, glassId)) return leaf;
  return { ...leaf, glassId };
}

/**
 * Glaze the given panes with `glassId`. null, or the window's own glass,
 * takes a pane back to the window's glass. Every other pane is untouched.
 */
export function setPaneGlass(
  design: WindowDesign,
  paneIds: string[],
  glassId: Id | null
): WindowDesign {
  const ids = new Set(paneIds);
  for (const id of ids) {
    const node = findNode(design.root, id);
    if (!node) throw new DesignError(`no node with id '${id}'`);
    if (!isLeaf(node)) throw new DesignError(`node '${id}' is not a leaf`);
  }
  const windowGlass = design.glazing.glassId ?? null;
  const root = mapLeaves(design.root, (leaf) =>
    ids.has(leaf.id) ? withGlass(leaf, glassId, windowGlass) : leaf
  );
  return root === design.root ? design : { ...design, root };
}

/** "Whole window": every pane gets `glassId`; no pane keeps a glass of its own. */
export function setWindowGlass(design: WindowDesign, glassId: Id | null): WindowDesign {
  const root = mapLeaves(design.root, (leaf) => withGlass(leaf, null, glassId));
  if (root === design.root && sameId(design.glazing.glassId, glassId)) return design;
  return { ...design, glazing: { ...design.glazing, glassId }, root };
}

export interface GlassOfPanes {
  /** The one glass of the panes; null when they differ (or none is set). */
  glassId: Id | null;
  /** True when the panes do not all have the same glass. */
  mixed: boolean;
}

/** The glass of a set of panes (all panes of the window when `paneIds` is omitted). */
export function glassOfPanes(design: WindowDesign, paneIds?: string[]): GlassOfPanes {
  const ids = paneIds ? new Set(paneIds) : null;
  const leaves = walkLeaves(design.root).filter((l) => !ids || ids.has(l.id));
  if (!leaves.length) return { glassId: design.glazing.glassId ?? null, mixed: false };
  const first = paneGlassId(design, leaves[0]);
  const mixed = leaves.some((l) => !sameId(paneGlassId(design, l), first));
  return { glassId: mixed ? null : first, mixed };
}

/**
 * The different glasses of the window in pane order, the window's own first.
 * Drawings number them from this list (G1 = the window's glass).
 */
export function glassesOf(design: WindowDesign): (Id | null)[] {
  const out: (Id | null)[] = [design.glazing.glassId ?? null];
  for (const leaf of walkLeaves(design.root)) {
    const id = paneGlassId(design, leaf);
    if (!out.some((o) => sameId(o, id))) out.push(id);
  }
  return out;
}

/** Position of the pane's glass in {@link glassesOf} (0 = the window's glass). */
export function glassIndexOf(design: WindowDesign, leaf: LeafNode): number {
  const id = paneGlassId(design, leaf);
  return Math.max(0, glassesOf(design).findIndex((o) => sameId(o, id)));
}
