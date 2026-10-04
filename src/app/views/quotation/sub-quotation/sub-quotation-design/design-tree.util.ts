import * as designConst from 'src/app/shared/configs/design/constConfig';

/**
 * Pane-tree model + persistence helpers for the window designer.
 *
 * The designer's single source of truth is a recursive {@link PaneNode} tree
 * (see sub-quotation-design.component.ts for the full semantics). These
 * helpers exist so that:
 *
 *  1. a SAVED window can be reopened EXACTLY as it was saved (defect B1):
 *     {@link serializePaneTree} produces a JSON-safe snapshot stored in the
 *     save payload (persisted server-side inside `quatation_object_data`),
 *     and {@link deserializePaneTree} restores it with fresh session ids;
 *
 *  2. rows saved BEFORE the snapshot existed can still be reconstructed
 *     best-effort from the `old_post_data.full_window` spec the API embeds
 *     ({@link reconstructFromFullWindow});
 *
 *  3. the palla-count / fly-mesh behaviours are decidable by pure functions
 *     ({@link resolvePallaTarget}, {@link firstSliddingLeafId}) that a unit
 *     test can exercise without Konva or Angular.
 */

export type SplitKind = 'palla' | 'mullion';

export interface PaneSplit {
  direction: 'vertical' | 'horizontal';
  kind: SplitKind;
  profileId?: string | number;
  mullionWidthMm: number;
  children: PaneNode[];
  fractions: number[];
  _availMm?: number;
}

export interface PaneNode {
  id: string;
  framed?: boolean;
  openingDirection?: string;
  handleId?: string | number;
  hingesType?: string;
  casementType?: 'Fixed' | 'Openable';
  category?: 'Casement' | 'Slidding';
  sashId?: string | number;
  productId?: string | number;
  split?: PaneSplit;
  _wMm?: number;
  _hMm?: number;
}

/** Serialized form: same shape minus ids and transient `_*` render fields. */
export interface SerializedPaneNode {
  framed?: boolean;
  openingDirection?: string;
  handleId?: string | number;
  hingesType?: string;
  casementType?: 'Fixed' | 'Openable';
  category?: 'Casement' | 'Slidding';
  sashId?: string | number;
  productId?: string | number;
  split?: {
    direction: 'vertical' | 'horizontal';
    kind: SplitKind;
    profileId?: string | number;
    mullionWidthMm: number;
    fractions: number[];
    children: SerializedPaneNode[];
  };
}

const LEAF_KEYS: (keyof SerializedPaneNode)[] = [
  'framed',
  'openingDirection',
  'handleId',
  'hingesType',
  'casementType',
  'category',
  'sashId',
  'productId',
];

/**
 * JSON-safe snapshot of the pane tree (ids and transient fields stripped).
 * Empty strings are kept on purpose: a leaf whose sashId/handleId is '' must
 * reopen as '' — dropping it would make the restored leaf fall back to the
 * GLOBAL control value, silently pricing e.g. a sash into a Fixed section.
 */
export function serializePaneTree(node: PaneNode): SerializedPaneNode {
  const out: SerializedPaneNode = {};
  for (const key of LEAF_KEYS) {
    const v = (node as any)[key];
    if (v !== undefined && v !== null) {
      (out as any)[key] = v;
    }
  }
  if (node.split) {
    out.split = {
      direction: node.split.direction,
      kind: node.split.kind,
      profileId: node.split.profileId,
      mullionWidthMm: node.split.mullionWidthMm,
      fractions: [...node.split.fractions],
      children: node.split.children.map((c) => serializePaneTree(c)),
    };
  }
  return out;
}

/**
 * Restore a pane tree from its serialized snapshot. Returns null when the
 * data is structurally invalid (wrong types, empty children, fraction count
 * mismatch) so the caller can fall back instead of rendering a broken tree.
 * Fractions are re-normalised to sum to 1 to absorb float drift.
 */
export function deserializePaneTree(
  data: any,
  nextId: () => string
): PaneNode | null {
  if (!data || typeof data !== 'object') return null;
  const node: PaneNode = { id: nextId() };
  for (const key of LEAF_KEYS) {
    const v = data[key];
    // '' is a meaningful value (see serializePaneTree) — only skip absent.
    if (v !== undefined && v !== null) {
      (node as any)[key] = v;
    }
  }
  if (data.split != null) {
    const s = data.split;
    if (
      typeof s !== 'object' ||
      (s.direction !== 'vertical' && s.direction !== 'horizontal') ||
      (s.kind !== 'palla' && s.kind !== 'mullion') ||
      !Array.isArray(s.children) ||
      s.children.length < 1 ||
      !Array.isArray(s.fractions) ||
      s.fractions.length !== s.children.length ||
      s.fractions.some((f: any) => typeof f !== 'number' || !(f > 0))
    ) {
      return null;
    }
    const children: PaneNode[] = [];
    for (const childData of s.children) {
      const child = deserializePaneTree(childData, nextId);
      if (!child) return null;
      children.push(child);
    }
    const sum = s.fractions.reduce((acc: number, f: number) => acc + f, 0);
    node.split = {
      direction: s.direction,
      kind: s.kind,
      profileId: s.profileId,
      mullionWidthMm:
        typeof s.mullionWidthMm === 'number' && s.mullionWidthMm > 0
          ? s.mullionWidthMm
          : designConst.mullionWidthMm,
      children,
      fractions: s.fractions.map((f: number) => f / sum),
    };
  }
  return node;
}

/** Map one saved `parts[]` entry onto a leaf's per-section config. */
function leafFromPart(part: any, framed: boolean, nextId: () => string): PaneNode {
  const node: PaneNode = { id: nextId(), framed };
  if (part && typeof part === 'object') {
    if (part.opening_direction) node.openingDirection = part.opening_direction;
    if (part.handle_id !== undefined && part.handle_id !== null && part.handle_id !== '')
      node.handleId = part.handle_id;
    if (part.hinges_type) node.hingesType = part.hinges_type;
    if (part.casement_type === 'Openable' || part.casement_type === 'Fixed')
      node.casementType = part.casement_type;
    if (part.category_type === 'Slidding' || part.category_type === 'Casement')
      node.category = part.category_type;
    if (part.sash_id !== undefined && part.sash_id !== null && part.sash_id !== '')
      node.sashId = part.sash_id;
    if (part.product_id !== undefined && part.product_id !== null && part.product_id !== '')
      node.productId = part.product_id;
  }
  return node;
}

/** Equal-split palla division of `n` framed sashes under a fresh parent. */
function pallaSplitOf(children: PaneNode[], fractions: number[], nextId: () => string): PaneNode {
  return {
    id: nextId(),
    framed: false,
    split: {
      direction: 'vertical',
      kind: 'palla',
      mullionWidthMm: designConst.mullionWidthMm,
      children,
      fractions,
    },
  };
}

/** Proportional fractions from per-part mm sizes; equal split when unusable. */
function fractionsFromSizes(sizes: number[]): number[] {
  const clean = sizes.map((s) => (typeof s === 'number' && s > 0 ? s : NaN));
  if (clean.some((s) => isNaN(s))) {
    return sizes.map(() => 1 / sizes.length);
  }
  const sum = clean.reduce((a, b) => a + b, 0);
  return clean.map((s) => s / sum);
}

export interface ReconstructedTree {
  root: PaneNode;
  /** Top-level palla count to mirror into the palla_type control (null = leave). */
  palla: number | null;
  /** True when the layout could only be approximated (nested legacy save). */
  approximate: boolean;
}

/**
 * Best-effort pane-tree reconstruction for rows saved BEFORE the design_tree
 * snapshot existed, from `old_post_data` (which carries the A2 `full_window`
 * spec: window dims + every section part + the mullion rows).
 *
 * Covered exactly:
 *  - single-section windows (incl. palla-divided casement/sliding saved as
 *    one legacy part with palla_type > 1);
 *  - one palla division of N sashes (N parts, no mullion rows);
 *  - one mullion/transom level: N parts split by N-1 same-direction mullions.
 * Anything deeper (nested splits) is approximated by a chain of binary
 * mullion splits and flagged `approximate` so the caller can warn the user.
 */
export function reconstructFromFullWindow(
  oldPostData: any,
  nextId: () => string
): ReconstructedTree | null {
  if (!oldPostData || typeof oldPostData !== 'object') return null;
  const fw = oldPostData.full_window;
  const parts: any[] =
    fw && Array.isArray(fw.parts) && fw.parts.length
      ? fw.parts
      : [oldPostData];
  const mullion: any[] = fw && Array.isArray(fw.mullion) ? fw.mullion : [];

  if (parts.length === 1) {
    const p = parts[0];
    const palla = Number(p.palla_type) || 0;
    const sashed = p.category_type === 'Slidding' || p.casement_type === 'Openable';
    if (sashed && palla >= 1) {
      const children: PaneNode[] = [];
      const fractions: number[] = [];
      for (let i = 0; i < palla; i++) {
        const leaf = leafFromPart(p, true, nextId);
        // Adjacent sashes alternate so a 2-track slider reads sensibly.
        leaf.openingDirection = i % 2 === 0 ? 'Left' : 'Right';
        if (palla === 1 && p.opening_direction) {
          leaf.openingDirection = p.opening_direction;
        }
        children.push(leaf);
        fractions.push(1 / palla);
      }
      return { root: pallaSplitOf(children, fractions, nextId), palla, approximate: false };
    }
    return { root: leafFromPart(p, false, nextId), palla: null, approximate: false };
  }

  if (mullion.length === 0) {
    // One palla division: N framed sashes side by side.
    const children = parts.map((p) => leafFromPart(p, true, nextId));
    const fractions = fractionsFromSizes(parts.map((p) => Number(p.width)));
    return {
      root: pallaSplitOf(children, fractions, nextId),
      palla: parts.length,
      approximate: false,
    };
  }

  const allSameDirection = mullion.every(
    (m) => m && m.direction === mullion[0].direction
  );
  if (mullion.length === parts.length - 1 && allSameDirection) {
    // One mullion/transom level separating N glazed sections.
    const direction =
      mullion[0].direction === 'horizontal' ? 'horizontal' : 'vertical';
    const children = parts.map((p) => leafFromPart(p, false, nextId));
    const sizes = parts.map((p) =>
      Number(direction === 'vertical' ? p.width : p.height)
    );
    const root: PaneNode = {
      id: nextId(),
      framed: false,
      split: {
        direction,
        kind: 'mullion',
        profileId: mullion[0].product_id,
        mullionWidthMm: designConst.mullionWidthMm,
        children,
        fractions: fractionsFromSizes(sizes),
      },
    };
    return { root, palla: null, approximate: false };
  }

  // Nested legacy layout: approximate with a chain of binary mullion splits
  // (first section | rest), assigning saved parts to leaves in order.
  let leafIndex = 0;
  const takePart = () => parts[Math.min(leafIndex++, parts.length - 1)];
  const buildChain = (depth: number): PaneNode => {
    if (depth >= mullion.length) {
      return leafFromPart(takePart(), false, nextId);
    }
    const m = mullion[depth];
    const direction = m && m.direction === 'horizontal' ? 'horizontal' : 'vertical';
    const first = leafFromPart(takePart(), false, nextId);
    const rest = buildChain(depth + 1);
    return {
      id: nextId(),
      framed: false,
      split: {
        direction,
        kind: 'mullion',
        profileId: m ? m.product_id : undefined,
        mullionWidthMm: designConst.mullionWidthMm,
        children: [first, rest],
        fractions: [0.5, 0.5],
      },
    };
  };
  return { root: buildChain(0), palla: null, approximate: true };
}

/** Depth-first search for a node by id (standalone twin of the component's). */
export function findPaneIn(node: PaneNode, id: string): PaneNode | null {
  if (node.id === id) return node;
  if (!node.split) return null;
  for (const child of node.split.children) {
    const found = findPaneIn(child, id);
    if (found) return found;
  }
  return null;
}

/** Find the parent split node of `id` (null when `id` is the root). */
export function findParentIn(node: PaneNode, id: string): PaneNode | null {
  if (!node.split) return null;
  for (const child of node.split.children) {
    if (child.id === id) return node;
    const found = findParentIn(child, id);
    if (found) return found;
  }
  return null;
}

export type PallaTarget =
  | { mode: 'window' }
  | { mode: 'container'; node: PaneNode }
  | { mode: 'leaf'; node: PaneNode };

/**
 * Decide what a palla-count change applies to (defect B2).
 *
 * The old behaviour subdivided the SELECTED leaf unconditionally, so changing
 * "3 palla" while one sash of a 2-palla slider was highlighted nested a split
 * INSIDE that sash (3 skinny panes + one leftover giant pane whose widths no
 * longer summed to the frame). The rule now:
 *  - nothing (or something stale) selected  → the whole window;
 *  - selected leaf sits in a palla division → that CONTAINER is re-divided
 *    (changing the window's sash count, never nesting);
 *  - selected leaf is a mullion section or the root leaf → that leaf itself
 *    (a section of a composite window genuinely divides into sub-sashes).
 */
export function resolvePallaTarget(
  root: PaneNode,
  selectedId: string | null
): PallaTarget {
  if (!selectedId) return { mode: 'window' };
  const node = findPaneIn(root, selectedId);
  if (!node || node.split) return { mode: 'window' };
  const parent = findParentIn(root, node.id);
  if (parent && parent.split && parent.split.kind === 'palla') {
    return { mode: 'container', node: parent };
  }
  return { mode: 'leaf', node };
}

/**
 * The leaf that carries the fly-mesh drawing: the first (DFS) leaf whose
 * resolved system is Slidding. Null when the window has no sliding section.
 */
export function firstSliddingLeafId(
  node: PaneNode,
  globalCategory: string
): string | null {
  if (!node.split) {
    const category = node.category ?? globalCategory;
    return category === 'Slidding' ? node.id : null;
  }
  for (const child of node.split.children) {
    const found = firstSliddingLeafId(child, globalCategory);
    if (found) return found;
  }
  return null;
}
