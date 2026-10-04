/**
 * design-model — canonical WindowDesign document (schema upvc.design/1).
 *
 * Pure TypeScript. NO Angular, NO Konva, NO DOM imports anywhere in this
 * library. The document is the single source of truth for the designer:
 * the canvas renders FROM it, every interaction mutates IT (via the pure
 * operations in operations.ts, each returning a new immutable document),
 * the pricing payload is DERIVED from it (payload.ts), and it is what gets
 * saved inside `old_post_data.design` and reloaded.
 *
 * See docs/product/designer-architecture.md §1 for the binding definition.
 */

export const DESIGN_SCHEMA = 'upvc.design/1';

/** Master-table id as the api uses it (numeric id, sometimes stringly typed). */
export type Id = string | number;

export type Axis = 'x' | 'y';
export type ProductType = 'Window' | 'Door';
export type Category = 'Casement' | 'Slidding';
export type CasementType = 'Fixed' | 'Openable';
export type TrackType = '2 Track' | '2.5 Track' | '3 Track' | '4 Track';

/**
 * What separates the children of a split:
 *  - 'mullion': a real mullion/transom bar with a profile and a face width;
 *    emitted into the pricing payload's `mullion[]`.
 *  - 'sash': a palla/sash division (adjacent framed sashes, e.g. a 2-sash
 *    French casement). Face width is 0 and NOTHING is emitted to `mullion[]`
 *    — this mirrors the legacy component's `kind: 'palla'` splits.
 */
export type DividerKind = 'mullion' | 'sash';

/** The Phase 1 rectangle (the default frame shape). */
export interface RectShape {
  kind: 'rect';
}

/**
 * Arched head over vertical jambs (Phase 3). The arc's chord is the full
 * frame width at the SPRING LINE, `riseMm` below the frame top; the apex
 * touches the frame top. `riseMm === widthMm / 2` is the semicircular
 * arch; smaller rises are segmental. 0 < riseMm <= min(heightMm, widthMm/2).
 */
export interface ArchTopShape {
  kind: 'arch-top';
  riseMm: number;
}

/** Full circle (Phase 3). The frame box is the bounding square: w === h. */
export interface CircleShape {
  kind: 'circle';
}

/**
 * Triangle on a horizontal sill (Phase 3). `apex` places the top vertex:
 * 'left'/'right' = right triangle with the vertical jamb on that side;
 * 'isosceles' = apex centred.
 */
export interface TriangleShape {
  kind: 'triangle';
  apex: 'left' | 'right' | 'isosceles';
}

/**
 * Trapezoid with a sloped head (Phase 3): vertical jambs of
 * `leftHeightMm` / `rightHeightMm`, horizontal sill, straight sloped top.
 * frame.heightMm must equal max(leftHeightMm, rightHeightMm).
 */
export interface TrapezoidShape {
  kind: 'trapezoid';
  leftHeightMm: number;
  rightHeightMm: number;
}

/**
 * Frame outline shape. Phase 1 documents carry {kind:'rect'}; Phase 3 adds
 * the shaped kinds (additive — every existing 'rect' document is valid).
 */
export type FrameShape =
  | RectShape
  | ArchTopShape
  | CircleShape
  | TriangleShape
  | TrapezoidShape;

export type FrameShapeKind = FrameShape['kind'];

export interface Frame {
  shape: FrameShape;
  widthMm: number;
  heightMm: number;
  /** Frame profile product id (the global default; leaves may override). */
  productId: Id | null;
  colorId: Id | null;
  profileColor: string | null;
}

export interface Glazing {
  glassId: Id | null;
  /** Georgian / glazing bar counts (horizontal bars, vertical bars). */
  barsH: number;
  barsV: number;
}

/** Openable-casement hardware spec. */
export interface OpeningSpec {
  /** Left | Right | Top | Bottom | Tilt & Turn Left | Tilt & Turn Right ... */
  direction: string | null;
  handleId: Id | null;
  hingesType: string | null;
}

/**
 * One sliding panel. Panels are NOT geometric splits (they overlap on
 * tracks); they are a property of the sliding leaf. `widthMm` is the user's
 * intended daylight width of the panel (the renderer derives interlock
 * overlap from the sash profile).
 */
export interface SlidePanel {
  widthMm: number;
  direction: 'Left' | 'Right';
  /**
   * True = this panel is fixed glazing on its track (does not slide).
   * Absent/false = a moving shutter. Model-only until the api grows a
   * per-panel fixed flag (see the Phase 2 log's api notes).
   */
  fixed?: boolean;
}

export interface SlideSpec {
  tracks: TrackType;
  mesh: boolean;
  panels: SlidePanel[];
  /**
   * Which half of the opening the fly-mesh panel covers ('2.5 Track''s
   * half-track, or the innermost track on 3/4 track). Default 'Left'.
   * Model/renderer-only; the payload still carries the boolean `fly_mesh`.
   */
  meshPosition?: 'Left' | 'Right';
  /**
   * User-intended shutter overlap at each interlock, mm. When absent the
   * actual overlap is derived from the stored panel widths
   * (sum(panels) − daylight, spread over the interlocks) — see
   * slideLayout(). The renderer/pricing derive their own from the sash
   * profile when neither is given.
   */
  interlockMm?: number;
}

export interface LeafNode {
  id: string;
  kind: 'leaf';
  category: Category;
  /** Casement only: Fixed (plain glass) or Openable (sash + hardware). */
  casementType?: CasementType;
  /** Frame product for THIS section's own system; null = frame default. */
  productId: Id | null;
  sashId: Id | null;
  /** Openable casement hardware. */
  opening?: OpeningSpec;
  /** Slidding only. */
  slide?: SlideSpec;
  /**
   * True when this region is a palla sash drawn with its own sash band
   * (children of a 'sash' split). Geometry: a sashFramed region's CONTENT
   * (anything nested below it) insets by the frame face, exactly like the
   * legacy renderer's `framed` nodes. Visual-only for plain leaves.
   */
  sashFramed?: boolean;
}

export interface SplitNode {
  id: string;
  kind: 'split';
  axis: Axis;
  /** Default 'mullion'. See {@link DividerKind}. */
  dividerKind?: DividerKind;
  /** Mullion profile product id ('mullion' kind only, null for 'sash'). */
  dividerProfileId: Id | null;
  /** Divider bar face width in mm; 0 for 'sash' kind. */
  dividerFaceMm: number;
  /**
   * Divider CENTRELINES in mm measured from this pane's left (axis 'x') or
   * top (axis 'y') daylight edge. Strictly increasing; children.length is
   * always positionsMm.length + 1.
   */
  positionsMm: number[];
  /**
   * Per-divider resize behaviour: true = the divider keeps its mm offset on
   * frame resize (clamped); false = it scales proportionally. Same length
   * as positionsMm.
   */
  lockedMm: boolean[];
  /** n+1 children, left→right (axis 'x') or top→bottom (axis 'y'). */
  children: PaneNode[];
  /** See {@link LeafNode.sashFramed}; a split region can carry a sash band. */
  sashFramed?: boolean;
}

export type PaneNode = LeafNode | SplitNode;

/** Door sill/threshold options (Phase 2). */
export type ThresholdType = 'Standard' | 'Low' | 'None';

/**
 * Door-level configuration (Phase 2), present when productType is 'Door'.
 * The door leaf/leaves themselves are ordinary Openable casement leaves in
 * the tree (a double door is a 2-child 'sash' split, exactly like a
 * 2-palla casement); side lights and top lights are ordinary 'mullion'
 * splits around them. This record carries what the TREE cannot express.
 */
export interface DoorSpec {
  /** 1 = single door, 2 = double (French) door. */
  leaves: 1 | 2;
  /** Hinge side of the (active) leaf, as seen from outside. */
  openingSide: 'Left' | 'Right';
  /** Swing direction: opens into the room or out of it. */
  swing: 'In' | 'Out';
  threshold: ThresholdType;
  /**
   * Node id of the door leaf (leaves === 1) or of the 'sash' split holding
   * both door leaves (leaves === 2). Lets side/top lights wrap the door
   * without ambiguity about which pane IS the door.
   */
  doorNodeId: string;
}

export interface WindowDesign {
  schema: string;
  unit: 'mm';
  frame: Frame;
  productType: ProductType;
  glazing: Glazing;
  root: PaneNode;
  /** Door configuration; only meaningful when productType is 'Door'. */
  door?: DoorSpec;
}

/* ------------------------------------------------------------------ */
/* Guards & small helpers                                              */
/* ------------------------------------------------------------------ */

export function isLeaf(node: PaneNode): node is LeafNode {
  return node.kind === 'leaf';
}

export function isSplit(node: PaneNode): node is SplitNode {
  return node.kind === 'split';
}

/** Depth-first, reading-order walk of every LEAF (the payload order). */
export function walkLeaves(node: PaneNode, out: LeafNode[] = []): LeafNode[] {
  if (isLeaf(node)) {
    out.push(node);
    return out;
  }
  for (const child of node.children) {
    walkLeaves(child, out);
  }
  return out;
}

/** Depth-first search for any node by id. */
export function findNode(node: PaneNode, id: string): PaneNode | null {
  if (node.id === id) return node;
  if (isLeaf(node)) return null;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** Parent split of `id` (null when `id` is the root or not found). */
export function findParent(node: PaneNode, id: string): SplitNode | null {
  if (isLeaf(node)) return null;
  for (const child of node.children) {
    if (child.id === id) return node;
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Next unused pane id for this document. Ids are `p<N>`; scanning for the
 * max keeps id generation deterministic (test-friendly) and collision-free
 * without hidden module state.
 */
export function nextIdSeq(root: PaneNode): number {
  let max = 0;
  const visit = (n: PaneNode): void => {
    const m = /^p(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
    if (isSplit(n)) n.children.forEach(visit);
  };
  visit(root);
  return max + 1;
}

/** Error type thrown by operations on invalid structural input. */
export class DesignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignError';
  }
}
