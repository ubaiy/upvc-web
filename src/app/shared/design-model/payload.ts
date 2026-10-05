/**
 * design-model → pricing payload. `toPayload(design)` is THE deterministic
 * mapping to the existing `parts[]` / `sections[]` / `mullion[]` contract
 * (phase-3-api-log item 5) and the only place that contract lives.
 *
 * THE PRICING RULE (one window, one payload, however it was drawn):
 *  - every pane is priced from ITS OWN configuration. A part never borrows
 *    a sash, handle, hinge, track or mesh from another pane, so a window
 *    and its mirror image cost the same;
 *  - an opening sash is always one part at its own daylight size with
 *    `palla_type: 1` (the per-sash form), whether it is the only pane or
 *    one of several. The old screen sent either that or one whole-window
 *    part depending on what was selected, and the two gave different totals;
 *  - a sliding pane is always one part per panel;
 *  - every part carries the glass of ITS pane in `glazz_id` (the pane's own
 *    glass, else the window's). The api charges glass per part from that
 *    key, so a pane with different glass is priced with it.
 *
 * Byte-compatibility contract (golden-tested):
 *  - a single un-split FIXED window emits the legacy single-part array —
 *    the full design-spec field set in the exact key order of the legacy
 *    `designSpecificationForm.getRawValue()`, with the FRAME outer size as
 *    `height`/`width` (what `designSpecArray[0]` produced);
 *  - a divided window emits one part per leaf, each the full spec with the
 *    per-section overrides (`product_id`, `category_type`, `casement_type`,
 *    `sash_id`, `palla_type: 1`, structural `height`/`width` mm with frame +
 *    divider faces deducted, `handle_id`, `opening_direction`,
 *    `hinges_type`) — every key the backend reads is always present (a
 *    missing key 500s under APP_DEBUG);
 *  - a sliding leaf emits ONE part per panel with that leaf's
 *    `is_track`/`fly_mesh` copied onto each (the A2 copy semantics);
 *  - `sections[]`: one per leaf (per panel for sliding), additive;
 *  - `mullion[]`: one per real mullion divider, `{direction, length,
 *    product_id}`, in the legacy depth-first emit order (child i's subtree
 *    before divider i);
 *  - leaf order everywhere: depth-first reading order; parts[i] ↔
 *    sections[i] ↔ i-th leaf;
 *  - a leaf that a shaped frame cuts away completely (the corner beyond a
 *    triangle's slope) has no part and no section: the charged path is not
 *    shape-aware and would price it as a rectangle.
 */

import {
  Layout,
  LayoutOptions,
  LeafGridInfo,
  layout,
  leafGrid,
} from './geometry';
import { clipPanesToShape } from './shape-geometry';
import { API_SHAPE_KINDS, ShapePayload, toShapePayload } from './shape-payload';
import {
  DoorSpec,
  FrameShape,
  Id,
  LeafNode,
  WindowDesign,
  isLeaf,
  walkLeaves,
} from './types';

/**
 * The full design-spec field set, in the EXACT key order of the legacy
 * component's `designSpecificationForm` (key order matters: golden payloads
 * are compared byte-for-byte after JSON serialization).
 */
export interface GlobalSpec {
  designId: Id | null;
  category_type: string | null;
  mullion_quantity: number | null;
  product_id: Id | null;
  color_id: Id | null;
  sash_id: Id | null;
  casement_type: string | null;
  palla_type: number | null;
  hinges_type: string | null;
  opening_direction: string | null;
  glazing_bars_vertical: number;
  glazing_bars_horizontal: number;
  is_track: string | null;
  product_type: string;
  handle_id: Id | null;
  is_cupler: boolean;
  is_louvers: boolean;
  is_lshape: boolean;
  height: number;
  width: number;
  total: number | null;
  glazz_id: Id | null;
  ventilation_id: Id | null;
  ventilation_height: number | null;
  ventilation_width: number | null;
  ventilation_glazz_id: Id | null;
  fly_mesh: boolean | number | null;
  palla: unknown;
  /**
   * Phase 3 additive passthrough (architecture §3.3): present ONLY when
   * the frame shape is not 'rect', appended after the legacy keys so
   * rectangular payloads stay byte-identical. Absent = rectangle.
   */
  shape?: FrameShape;
}

export interface SectionPayload {
  casementType: string | null;
  sashId: Id | null;
  openingDirection: string | null;
  handleId: Id | null;
  hingesType: string | null;
  widthMm: number | null;
  heightMm: number | null;
  /**
   * Phase 2 D3 fields (architecture §1.2), appended after the legacy keys
   * and always emitted: the axis of the leaf's nearest REAL-mullion split
   * ancestor ('mullion' = vertical bars, 'transom' = horizontal), null
   * for an un-split window or inside pure sash divisions — exactly what
   * the api needs to count transoms unambiguously.
   */
  orientation?: 'mullion' | 'transom' | null;
  /** Grid indices: child-index sums over 'y'/'x' split ancestors. */
  row?: number;
  col?: number;
}

export interface MullionPayload {
  direction: 'vertical' | 'horizontal';
  length: number;
  product_id: Id | null;
}

export interface DesignPayload {
  width: number;
  height: number;
  mullion: MullionPayload[];
  parts: GlobalSpec[];
  sections: SectionPayload[];
  /**
   * Phase 3: the api's shaped-frame pricing descriptor (member cut
   * lengths, per-pane glass). Present ONLY for non-rect frames whose kind
   * the api accepts (API_SHAPE_KINDS) — rect payloads are unchanged.
   */
  shape?: ShapePayload;
  /**
   * Doors only (phase-8-design-api-gaps-log.md item 2): the two door keys
   * the api stores and returns. The full DoorSpec travels in the design
   * document; the api drops any other key sent here.
   */
  door?: Pick<DoorSpec, 'threshold' | 'swing'>;
}

export interface ToPayloadOptions extends LayoutOptions {
  /**
   * Overrides for spec fields the model does not carry (ventilation_*,
   * is_cupler, designId, ...). Model-derived fields win over defaults;
   * `spec` overrides win over both (it represents form state the user set
   * outside the drawing).
   */
  spec?: Partial<GlobalSpec>;
}

/**
 * The legacy form's initial raw value (`_designSpecFormInit` defaults),
 * before any model-derived or caller overrides.
 */
export function defaultSpec(): GlobalSpec {
  return {
    designId: null,
    category_type: 'Casement',
    mullion_quantity: null,
    product_id: null,
    color_id: null,
    sash_id: '',
    casement_type: 'Fixed',
    palla_type: null,
    hinges_type: null,
    opening_direction: 'Left',
    glazing_bars_vertical: 0,
    glazing_bars_horizontal: 0,
    is_track: null,
    product_type: 'Window',
    handle_id: null,
    is_cupler: false,
    is_louvers: false,
    is_lshape: false,
    height: 0,
    width: 0,
    total: null,
    glazz_id: null,
    ventilation_id: null,
    ventilation_height: null,
    ventilation_width: null,
    ventilation_glazz_id: null,
    fly_mesh: null,
    palla: null,
  };
}

const SPEC_KEYS = Object.keys(defaultSpec()) as (keyof GlobalSpec)[];

/**
 * The window-level spec exactly as the legacy global form would hold it
 * for this design: defaults, then model-derived values (frame, glazing,
 * the FIRST leaf's config — the legacy "whole window" controls), then the
 * caller's `spec` overrides.
 */
export function buildBaseSpec(
  design: WindowDesign,
  opts?: ToPayloadOptions
): GlobalSpec {
  const base = defaultSpec();
  const primary = walkLeaves(design.root)[0];

  base.category_type = primary.category;
  base.product_id = primary.productId ?? design.frame.productId;
  base.color_id = design.frame.colorId;
  base.sash_id = primary.sashId ?? base.sash_id;
  base.glazing_bars_vertical = design.glazing.barsV;
  base.glazing_bars_horizontal = design.glazing.barsH;
  base.product_type = design.productType;
  base.height = design.frame.heightMm;
  base.width = design.frame.widthMm;
  base.glazz_id = design.glazing.glassId;

  if (primary.category === 'Slidding') {
    base.casement_type = null;
    base.is_track = primary.slide?.tracks ?? null;
    base.fly_mesh = primary.slide?.mesh ?? null;
    base.palla_type = primary.slide?.panels.length ?? null;
    base.opening_direction =
      primary.slide?.panels[0]?.direction ?? base.opening_direction;
  } else {
    base.casement_type = primary.casementType ?? base.casement_type;
    base.opening_direction =
      primary.opening?.direction ?? base.opening_direction;
    base.handle_id = primary.opening?.handleId ?? base.handle_id;
    base.hinges_type = primary.opening?.hingesType ?? base.hinges_type;
  }

  if (opts?.spec) {
    for (const key of SPEC_KEYS) {
      if (Object.prototype.hasOwnProperty.call(opts.spec, key)) {
        (base as unknown as Record<string, unknown>)[key] = (
          opts.spec as Record<string, unknown>
        )[key];
      }
    }
  }
  return base;
}

function isOpenable(leaf: LeafNode): boolean {
  return leaf.category === 'Casement' && leaf.casementType === 'Openable';
}

/**
 * The hardware of ONE pane, from that pane alone (see THE PRICING RULE):
 * fixed glass has no sash, handle or hinges; a casement has no track or
 * mesh. Values match the legacy form's empty state ('' sash, null rest).
 */
function ownHardware(leaf: LeafNode): Pick<
  GlobalSpec,
  'sash_id' | 'handle_id' | 'hinges_type' | 'opening_direction' | 'is_track' | 'fly_mesh'
> {
  const blank = defaultSpec();
  if (leaf.category === 'Slidding') {
    return {
      sash_id: leaf.sashId ?? blank.sash_id,
      handle_id: null,
      hinges_type: null,
      opening_direction: leaf.slide?.panels[0]?.direction ?? blank.opening_direction,
      is_track: leaf.slide?.tracks ?? null,
      fly_mesh: leaf.slide?.mesh ?? null,
    };
  }
  if (!isOpenable(leaf)) {
    return {
      sash_id: blank.sash_id,
      handle_id: null,
      hinges_type: null,
      opening_direction: blank.opening_direction,
      is_track: null,
      fly_mesh: null,
    };
  }
  return {
    sash_id: leaf.sashId ?? blank.sash_id,
    handle_id: leaf.opening?.handleId ?? null,
    hinges_type: leaf.opening?.hingesType ?? null,
    opening_direction: leaf.opening?.direction ?? blank.opening_direction,
    is_track: null,
    fly_mesh: null,
  };
}

/** The pane's own glass; nothing when it uses the window's. */
function ownGlass(leaf: LeafNode): Partial<GlobalSpec> {
  return leaf.glassId === null || leaf.glassId === undefined
    ? {}
    : { glazz_id: leaf.glassId };
}

/** One per-section part: full spec + the pane's own configuration. */
function leafPart(
  base: GlobalSpec,
  leaf: LeafNode,
  widthMm: number,
  heightMm: number,
  frameProductId: Id | null,
  override?: Partial<GlobalSpec>
): GlobalSpec {
  return {
    ...base,
    product_id: leaf.productId ?? frameProductId ?? base.product_id,
    category_type: leaf.category,
    casement_type:
      leaf.category === 'Slidding' ? null : leaf.casementType ?? 'Fixed',
    palla_type: 1,
    height: Math.round(heightMm),
    width: Math.round(widthMm),
    ...ownHardware(leaf),
    ...ownGlass(leaf),
    ...override,
  };
}

/**
 * Derive the pricing payload from the design. Pure and deterministic:
 * the same design (and options) always yields the identical payload.
 */
export function toPayload(
  design: WindowDesign,
  opts?: ToPayloadOptions
): DesignPayload {
  const base = buildBaseSpec(design, opts);
  const lay: Layout = layout(design, opts);

  const mullion: MullionPayload[] = lay.dividers.map((d) => ({
    direction: d.direction,
    length: Math.round(d.lengthMm),
    product_id: d.split.dividerProfileId,
  }));

  const parts: GlobalSpec[] = [];
  const sections: SectionPayload[] = [];

  const root = design.root;
  // Only a single FIXED pane keeps the legacy whole-window part. A single
  // opening sash is priced like every other sash (and the api refuses an
  // Openable part without a palla count).
  const singleFixedRoot =
    isLeaf(root) && root.category === 'Casement' && !isOpenable(root);
  const grid = leafGrid(root);
  // Phase 3 §3.3: additive `shape` key on every part for non-rect frames
  // only, appended after the legacy keys (absent = rectangle).
  const shapeExtra: Partial<GlobalSpec> =
    design.frame.shape.kind !== 'rect' ? { shape: design.frame.shape } : {};
  const cutAway = cutAwayLeafIds(design, opts);
  // A pane without its own frame profile uses the window's, never a neighbour's.
  const frameProductId = design.frame.productId;

  for (const { leaf, rect } of lay.leaves) {
    if (cutAway.has(leaf.id)) continue;
    // Phase 2 D3: every section of this leaf carries the same grid cell
    // (sliding panels overlap inside ONE cell — they are not columns).
    const cell = grid.get(leaf.id) as LeafGridInfo;

    if (leaf.category === 'Slidding' && leaf.slide) {
      // One part (and one section) per sliding PANEL, each carrying the
      // leaf's own track/mesh — panels are a property of the leaf, not
      // geometric splits (the structural fix for defect B2).
      for (const panel of leaf.slide.panels) {
        parts.push(
          leafPart(base, leaf, panel.widthMm, rect.hMm, frameProductId, {
            opening_direction: panel.direction,
            ...shapeExtra,
          })
        );
        sections.push({
          casementType: null,
          sashId: leaf.sashId ?? defaultSpec().sash_id,
          openingDirection: panel.direction,
          handleId: null,
          hingesType: null,
          widthMm: Math.round(panel.widthMm),
          heightMm: Math.round(rect.hMm),
          orientation: cell.orientation,
          row: cell.row,
          col: cell.col,
        });
      }
      continue;
    }

    // Casement leaf. The single un-split fixed window keeps the LEGACY
    // part (full spec with the frame outer size), byte-identical to what
    // the old component sent, so its pricing is unchanged.
    const own = ownHardware(leaf);
    if (singleFixedRoot) {
      parts.push({ ...base, ...ownGlass(leaf), ...shapeExtra });
    } else {
      parts.push(leafPart(base, leaf, rect.wMm, rect.hMm, frameProductId, shapeExtra));
    }
    sections.push({
      casementType: leaf.casementType ?? 'Fixed',
      sashId: singleFixedRoot ? base.sash_id : own.sash_id,
      openingDirection: singleFixedRoot ? base.opening_direction : own.opening_direction,
      handleId: singleFixedRoot ? base.handle_id : own.handle_id,
      hingesType: singleFixedRoot ? base.hinges_type : own.hinges_type,
      widthMm: Math.round(rect.wMm),
      heightMm: Math.round(rect.hMm),
      orientation: cell.orientation,
      row: cell.row,
      col: cell.col,
    });
  }

  const payload: DesignPayload = {
    width: design.frame.widthMm,
    height: design.frame.heightMm,
    mullion,
    parts,
    sections,
  };
  const shapePayload = toShapePayload(design, opts);
  if (shapePayload && API_SHAPE_KINDS.includes(shapePayload.kind)) {
    payload.shape = shapePayload;
  }
  if (design.productType === 'Door' && design.door) {
    payload.door = {
      threshold: design.door.threshold,
      swing: design.door.swing,
    };
  }
  return payload;
}

/**
 * Leaves with no glass left inside a shaped frame. Never every leaf: a
 * window always keeps at least one part.
 */
function cutAwayLeafIds(
  design: WindowDesign,
  opts?: ToPayloadOptions
): Set<string> {
  const out = new Set<string>();
  if (design.frame.shape.kind === 'rect') return out;
  const clips = clipPanesToShape(design, opts);
  for (const clip of clips) {
    if (clip.polygonMm.length < 3 || !(clip.areaMm2 > 0)) out.add(clip.leafId);
  }
  if (out.size === clips.length) out.clear();
  return out;
}
