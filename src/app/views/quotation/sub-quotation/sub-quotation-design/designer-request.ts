/**
 * The one `quatation/manage-product` request of the designer. The live
 * price and the save are the SAME body built from the same WindowDesign;
 * the save only adds `is_saved`, the design document and the picture. So
 * the price on screen is the price that is stored.
 *
 * Pure: no Angular, no HTTP.
 */

import {
  DesignPayload,
  WindowDesign,
  serialize,
  toPayload,
} from 'src/app/shared/design-model';
import { DesignerCatalog, colourOf } from './designer-catalog';

export interface RequestContext {
  quotationId: string | number;
  /** The line being edited; null for a new window. */
  lineId: string | number | null;
  quantity: number;
  /** "Master bedroom"; blank clears it. */
  label: string;
  frameFaceMm?: number;
}

export interface SaveExtras {
  /** PNG data URI of the drawing, for the quotation list and the PDF. */
  image: string | null;
}

export interface ManageProductBody extends DesignPayload {
  quatation_id: string | number;
  quatation_product_id: string | number;
  is_saved: boolean;
  quantity: number;
  color: unknown;
  profile_color: string;
  label: string | null;
  image: string | null;
  /** The WindowDesign document; sent on save only. */
  design?: unknown;
}

/**
 * Build the request for a COMPLETED design (see completeDesign). The same
 * design, quantity and label always give the same body.
 */
export function buildManageProductBody(
  design: WindowDesign,
  catalog: DesignerCatalog,
  ctx: RequestContext,
  save?: SaveExtras
): ManageProductBody {
  const payload = toPayload(design, { frameFaceMm: ctx.frameFaceMm });
  const colour = colourOf(design, catalog);
  const label = ctx.label.trim();
  const body: ManageProductBody = {
    quatation_id: ctx.quotationId,
    quatation_product_id: ctx.lineId ?? '',
    is_saved: !!save,
    quantity: ctx.quantity,
    color: colour ? colour.row : null,
    profile_color: colour?.hex ?? design.frame.profileColor ?? '#ffffff',
    label: label ? label.slice(0, 100) : null,
    image: save ? save.image : null,
    ...payload,
  };
  if (save) body.design = JSON.parse(serialize(design));
  return body;
}

/** What identifies the priced window: the design payload without the save-only keys. */
export function pricedPayloadOf(body: ManageProductBody): unknown {
  const { is_saved, image, design, label, quatation_product_id, ...priced } = body;
  void is_saved;
  void image;
  void design;
  void label;
  void quatation_product_id;
  return priced;
}

/** The figures of the live price call, exactly as the api returns them. */
export interface LivePrice {
  /** Cost of the line, all pieces. */
  cost: number;
  /** What the line sells for on its quotation, before discount and tax. */
  amount: number;
  areaSqFt: number;
  rate: number;
}

/**
 * Reads `quatation/manage-product` (is_saved false). The api adds the
 * quotation's margin itself (`data.amount`, `data.rate_per_sq_ft`); the web
 * works out neither.
 */
export function livePriceOf(data: any): LivePrice {
  return {
    cost: Number(data?.total) || 0,
    amount: Number(data?.amount) || 0,
    areaSqFt: Math.round((Number(data?.total_sq_ft) || 0) * 100) / 100,
    rate: Number(data?.rate_per_sq_ft) || 0,
  };
}

/** One row of the "Price details" panel. */
export interface PriceLine {
  name: string;
  group: string;
  quantity: number | null;
  rate: number | null;
  cost: number;
}

/** Flatten the api's cost breakdown (costheads, then profiles) into rows. */
export function priceLinesOf(data: any): PriceLine[] {
  const out: PriceLine[] = [];
  for (const c of (data?.costhead_information?.costhead ?? []) as any[]) {
    out.push({
      name: c.name,
      group: c.costhead || c.type || 'Other',
      quantity: c.quantity ?? null,
      rate: c.cost ?? null,
      cost: Number(c.totalCost) || 0,
    });
  }
  for (const p of (data?.product_information ?? []) as any[]) {
    out.push({
      name: [p.profile_code, p.profile_name].filter(Boolean).join(' · '),
      group: 'Profile',
      quantity: p.quantity ?? null,
      rate: p.rate_meter ?? null,
      cost: Number(p.totalCost) || 0,
    });
  }
  // The api lists every costhead it knows, once per pane. Shown: what this
  // window uses, each item once with its quantities and costs added up.
  const merged = new Map<string, PriceLine>();
  for (const line of out) {
    if (!(line.cost > 0)) continue;
    const key = `${line.group}|${line.name}`;
    const seen = merged.get(key);
    if (!seen) {
      merged.set(key, { ...line });
      continue;
    }
    seen.cost = Math.round((seen.cost + line.cost) * 100) / 100;
    seen.quantity =
      seen.quantity === null || line.quantity === null
        ? null
        : Math.round((Number(seen.quantity) + Number(line.quantity)) * 100) / 100;
  }
  return [...merged.values()];
}
