/**
 * design-model → pricing payload. `toPayload(design)` is THE deterministic
 * mapping to the existing `parts[]` / `sections[]` / `mullion[]` contract
 * (phase-3-api-log item 5) and the only place that contract lives.
 *
 * Byte-compatibility contract (golden-tested):
 *  - a single un-split casement window emits the legacy single-part array —
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
 *    sections[i] ↔ i-th leaf.
 */

import { Layout, LayoutOptions, layout } from './geometry';
import { Id, LeafNode, WindowDesign, isLeaf, walkLeaves } from './types';

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
}

export interface SectionPayload {
  casementType: string | null;
  sashId: Id | null;
  openingDirection: string | null;
  handleId: Id | null;
  hingesType: string | null;
  widthMm: number | null;
  heightMm: number | null;
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

/** One per-section part: full spec + the per-leaf overrides, in place. */
function leafPart(
  base: GlobalSpec,
  leaf: LeafNode,
  widthMm: number,
  heightMm: number,
  override?: Partial<GlobalSpec>
): GlobalSpec {
  return {
    ...base,
    product_id: leaf.productId ?? base.product_id,
    category_type: leaf.category,
    casement_type:
      leaf.category === 'Slidding'
        ? null
        : leaf.casementType ?? base.casement_type,
    sash_id: leaf.sashId ?? base.sash_id,
    palla_type: 1,
    height: Math.round(heightMm),
    width: Math.round(widthMm),
    handle_id: leaf.opening?.handleId ?? base.handle_id,
    opening_direction: leaf.opening?.direction ?? base.opening_direction,
    hinges_type: leaf.opening?.hingesType ?? base.hinges_type,
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
  const singleCasementRoot = isLeaf(root) && root.category === 'Casement';

  for (const { leaf, rect } of lay.leaves) {
    if (leaf.category === 'Slidding' && leaf.slide) {
      // One part (and one section) per sliding PANEL, each carrying the
      // leaf's own track/mesh — panels are a property of the leaf, not
      // geometric splits (the structural fix for defect B2).
      for (const panel of leaf.slide.panels) {
        parts.push(
          leafPart(base, leaf, panel.widthMm, rect.hMm, {
            is_track: leaf.slide.tracks,
            fly_mesh: leaf.slide.mesh,
            opening_direction: panel.direction,
          })
        );
        sections.push({
          casementType: null,
          sashId: leaf.sashId ?? base.sash_id,
          openingDirection: panel.direction,
          handleId: base.handle_id,
          hingesType: base.hinges_type,
          widthMm: Math.round(panel.widthMm),
          heightMm: Math.round(rect.hMm),
        });
      }
      continue;
    }

    // Casement leaf. The single un-split window keeps the LEGACY part
    // (full spec with the frame outer size), byte-identical to what the
    // old component sent, so single-window pricing is unchanged.
    if (singleCasementRoot) {
      parts.push({ ...base });
    } else {
      parts.push(leafPart(base, leaf, rect.wMm, rect.hMm));
    }
    sections.push({
      casementType: leaf.casementType ?? base.casement_type,
      sashId: leaf.sashId ?? base.sash_id,
      openingDirection: leaf.opening?.direction ?? base.opening_direction,
      handleId: leaf.opening?.handleId ?? base.handle_id,
      hingesType: leaf.opening?.hingesType ?? base.hinges_type,
      widthMm: Math.round(rect.wMm),
      heightMm: Math.round(rect.hMm),
    });
  }

  return {
    width: design.frame.widthMm,
    height: design.frame.heightMm,
    mullion,
    parts,
    sections,
  };
}
