/**
 * The api of a 3D structure as a line of a quotation (card T123; the api half
 * is card T122). A structure is a quotation product line of kind "structure":
 * it has no catalogue product, so `product` is null on it.
 *
 * Every amount shown in the web comes from here; nothing is worked out again.
 * A refusal ("the structure rate 'bar_rate_m.rafter' is not set") arrives as
 * an error whose message is ready to show.
 */
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { quiet } from 'src/app/shared/interceptors/request-options';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';
import type { Structure, Summary } from 'src/app/shared/structure-model';

/** One row of the costing: glass, a bar role, a hub, an opening, wastage, labour, overhead, installation. */
export interface StructureCostRow {
  kind: string;
  name?: string | null;
  role?: string | null;
  fill?: string | null;
  basis?: string | null;
  qty: number;
  unit: string;
  rate?: number | null;
  amount: number;
}

export interface StructureCostTotals {
  material: number;
  wastage: number;
  labour: number;
  overhead: number;
  installation: number;
  cost: number;
}

/** POST quatation/structure/price. */
export interface StructurePriceRequest {
  /** Gives the quotation's margin, so `amount` is what the line will show. */
  quatation_id?: number;
  structure_type: string;
  quantity: number;
  /** Key of a glass rate; absent = the default rate. */
  glass?: string | null;
  /** A typed price for one structure; null = the computed one. */
  unit_price?: number | null;
  summary: Summary;
}

export interface StructurePrice {
  pricing_method: string;
  pricing_version: number;
  quantity: number;
  rows: StructureCostRow[];
  totals: StructureCostTotals;
  computed_unit_price: number;
  /** For one structure, before the quotation's margin, discount, charges and GST. */
  unit_price: number;
  price_is_manual: boolean;
  /** unit_price x quantity. */
  total: number;
  area_sq_ft: number;
  margin_percent: number | null;
  /** total with the quotation's margin: what the quotation line shows. */
  amount: number;
  rate_per_sq_ft: number | null;
}

/** POST quatation/structure/add; the same fields, each optional, for update. */
export interface StructureLineSave {
  quatation_id: number;
  name: string;
  structure_type: string;
  quantity: number;
  glass?: string | null;
  unit_price?: number | null;
  label?: string | null;
  hsn_code?: string | null;
  /** A png or jpeg data URI, 2 MB at most. */
  image?: string | null;
  document: Structure;
  summary: Summary;
}

export interface StructureLine {
  id: number;
  kind: 'structure';
  quatation_id: number;
  position: number;
  label: string | null;
  hsn_code: string | null;
  quantity: number;
  /** Overall width and height, mm (strings, like a window line). */
  width: string | number;
  height: string | number;
  total: number;
  total_sq_ft: string | number;
  image: string | null;
  pricing_method: string;
  pricing_version?: number;
  structure: {
    type: string;
    name: string;
    glass: string | null;
    overall: { widthMm: number; depthMm: number; heightMm: number };
    summary: Summary;
    costing: {
      rows: StructureCostRow[];
      totals: StructureCostTotals;
      rates?: unknown;
      computed_unit_price: number;
      unit_price: number;
      price_is_manual: boolean;
    };
  };
  /** Only from GET quatation/structure/{id}, add and update; quatation/show leaves it out. */
  document?: Structure;
  amount: number;
  rate_per_sq_ft: number | null;
  /** The quotation's totals after the change. */
  totals?: unknown;
}

/** A figure may be 0; null = not set (a structure that needs it is refused). */
export type Rate = number | null;

export interface StructureRates {
  glass_rate_sq_m: { default: Rate; by_glass: Record<string, Rate> };
  solid_panel_rate_sq_m: Rate;
  /** By bar role; `default` serves a role without its own figure. */
  bar_rate_m: Record<string, Rate>;
  hub_rate: Record<string, Rate>;
  opening_extra: Record<string, Rate>;
  wastage_pct: Rate;
  labour_rate_sq_ft: Rate;
  installation_rate_sq_ft: Rate;
  overhead_pct: Rate;
}

export interface StructureRatesAnswer {
  rates: StructureRates;
  bar_roles: string[];
  /** The hubs the designer makes: crown, node, ridge_end, corner (the live api sends it; the contract did not list it). */
  hub_roles?: string[];
  openings: string[];
  /** Paths of the figures that are not set: "bar_rate_m.hip". */
  missing: string[];
}

/** A refusal or a failure, with the sentence to show. `refused` = the api answered and said no. */
export class StructureApiError extends Error {
  constructor(message: string, readonly refused: boolean) {
    super(message);
  }
}

const NO_ANSWER = 'We could not reach the server. Check your connection.';
const NOT_THERE = 'The server does not have this yet, or it is no longer there.';

@Injectable({ providedIn: 'root' })
export class StructureLineService {
  constructor(private readonly api: ApiHttpService) {}

  /** The price of a structure that is not saved. Quiet: the designer shows its own states. */
  price(request: StructurePriceRequest): Observable<StructurePrice> {
    return this.data(this.api.post('quatation/structure/price', request, quiet()));
  }

  add(body: StructureLineSave): Observable<StructureLine> {
    return this.data(this.api.post('quatation/structure/add', body, quiet()));
  }

  /** `unit_price: null` goes back to the computed price; `document` and `summary` are sent together. */
  update(id: number, body: Partial<StructureLineSave>): Observable<StructureLine> {
    return this.data(this.api.post(`quatation/structure/update/${id}`, body, quiet()));
  }

  /** The line with its document. */
  get(id: number): Observable<StructureLine> {
    return this.data(this.api.get(`quatation/structure/${id}`, quiet()));
  }

  remove(id: number): Observable<{ id: number; totals?: unknown }> {
    return this.data(this.api.post(`quatation/structure/delete/${id}`, {}, quiet()));
  }

  rates(): Observable<StructureRatesAnswer> {
    return this.data(this.api.get('structure-rates', quiet()));
  }

  /** The whole object is sent; the answer is the same as `rates()`. */
  saveRates(rates: StructureRates): Observable<StructureRatesAnswer> {
    return this.data(this.api.put('structure-rates', { rates }, quiet()));
  }

  /** The usual envelope {success, data, message}: the data, or an error with the api's sentence. */
  private data<T>(request: Observable<any>): Observable<T> {
    return request.pipe(
      map((res) => {
        if (res?.success && res.data !== undefined && res.data !== null) {
          return res.data as T;
        }
        throw new StructureApiError(text(res?.message) || 'The server refused this.', true);
      }),
      catchError((err) => {
        if (err instanceof StructureApiError) {
          return throwError(() => err);
        }
        const said = text(err?.error?.message);
        const status = Number(err?.status) || 0;
        // The api said no in its own words (a rate not set, a summary that does not add up): the user can act on it.
        const refused = !!said && [400, 409, 422].includes(status);
        if (refused) return throwError(() => new StructureApiError(said, true));
        return throwError(() => new StructureApiError(status === 404 ? NOT_THERE : status > 0 && status < 500 && said ? said : NO_ANSWER, false));
      })
    );
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** "bar_rate_m.rafter" out of "…the structure rate 'bar_rate_m.rafter' is not set." ('' when the sentence names none). */
export function missingRate(message: string): string {
  return /structure rate '([^']+)' is not set/i.exec(message)?.[1] ?? '';
}

/** What a rate is called, as on the Structure rates screen: "glass rate per sq m", "rafter rate per metre". */
export function rateName(path: string): string {
  const [group, ...rest] = path.split('.');
  const key = rest[rest.length - 1]?.replace(/[_-]+/g, ' ') ?? '';
  switch (group) {
    case 'glass_rate_sq_m':
      return rest[0] === 'by_glass' ? `${key} glass rate per sq m` : 'glass rate per sq m';
    case 'solid_panel_rate_sq_m':
      return 'solid panel rate per sq m';
    case 'bar_rate_m':
      return key === 'default' ? 'bar rate per metre' : `${key} rate per metre`;
    case 'hub_rate':
      return key === 'default' ? 'hub rate' : `${key} hub rate`;
    case 'opening_extra':
      return `extra for a ${key} panel`;
    case 'wastage_pct':
      return 'wastage %';
    case 'labour_rate_sq_ft':
      return 'labour rate per sq ft';
    case 'installation_rate_sq_ft':
      return 'installation rate per sq ft';
    case 'overhead_pct':
      return 'overhead %';
    default:
      return path.replace(/[_.-]+/g, ' ');
  }
}

/** The rates a structure with this summary is priced with, as the api's paths. Only to name what is missing; no amount is worked out. */
export function neededRates(summary: Summary): string[] {
  const openings = ['casement', 'top-hung', 'door', 'sliding'];
  return [
    ...(summary.glassAreaSqM > 0 ? ['glass_rate_sq_m.default'] : []),
    ...(summary.solidAreaSqM > 0 ? ['solid_panel_rate_sq_m'] : []),
    ...summary.bars.map((bar) => `bar_rate_m.${bar.role}`),
    ...summary.hubs.map((hub) => `hub_rate.${hub.role}`),
    ...[...new Set(summary.panels.map((panel) => String(panel.fill)))].filter((fill) => openings.includes(fill)).map((fill) => `opening_extra.${fill}`),
    'wastage_pct',
    'labour_rate_sq_ft',
    'overhead_pct',
    'installation_rate_sq_ft',
  ];
}

/** The api's refusal in plain words: the name of its pricing method and the path of a rate are not for the user. */
export function plainRefusal(message: string): string {
  const rate = missingRate(message);
  if (rate) return `The ${rateName(rate)} is not set.`;
  const said = message.replace(/^s*[a-z0-9_]+ cannot price this structure:s*/i, '').trim();
  return said ? said.charAt(0).toUpperCase() + said.slice(1) : message;
}
