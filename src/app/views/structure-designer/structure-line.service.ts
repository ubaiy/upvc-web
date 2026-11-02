/**
 * The api of a 3D structure as a line of a quotation (card T123; the api half
 * is card T122). A structure is a quotation product line of kind "structure":
 * it has no catalogue product, so `product` is null on it.
 *
 * Every amount shown in the web comes from here; nothing is worked out again.
 * A refusal ("Choose what the solid panels are made of.") arrives as an error
 * whose message is ready to show, with `missing` naming what to choose.
 */
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { quiet } from 'src/app/shared/interceptors/request-options';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';
import type { Structure, Summary } from 'src/app/shared/structure-model';
import type { StructureWindow } from './structure-windows';

/**
 * One row of the costing: a window (`face_ids`, `count` of them at `unit_cost` each), glass, a solid panel, a bar,
 * a hub, labour, installation, wastage or overhead.
 */
export interface StructureCostRow {
  kind: string;
  name?: string | null;
  role?: string | null;
  fill?: string | null;
  basis?: string | null;
  costhead_id?: number | null;
  product_id?: number | null;
  face_ids?: string[] | null;
  count?: number | null;
  unit_cost?: number | null;
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
  /** A typed price for one structure; null = the computed one. */
  unit_price?: number | null;
  /** The structure with the window of every wall panel; its `defaults` say which catalogue rows it is made of. */
  document?: Structure;
  /** The windows, equal ones together: each priced exactly as the same window is on a window line. */
  windows?: StructureWindow[];
  summary: Summary;
}

export interface StructurePrice {
  pricing_method: string;
  pricing_version: number;
  quantity: number;
  /** Left out of the answer for a user who may not see costs; the amount is still there. */
  rows?: StructureCostRow[];
  totals?: StructureCostTotals;
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
  /** The name of the glass row of the structure: the workshop glass order prints it. */
  glass?: string | null;
  unit_price?: number | null;
  label?: string | null;
  hsn_code?: string | null;
  /** A png or jpeg data URI, 2 MB at most. */
  image?: string | null;
  document: Structure;
  windows?: StructureWindow[];
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
    overall: { widthMm: number; depthMm: number; heightMm: number };
    summary: Summary;
    costing: {
      rows?: StructureCostRow[];
      totals?: StructureCostTotals;
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

/** A refusal or a failure, with the sentence to show. `refused` = the api answered and said no. */
export class StructureApiError extends Error {
  /** `missing` of a refusal: what to choose ("glass", "solid_panel", "bar.rafter"); '' when it names nothing. */
  constructor(message: string, readonly refused: boolean, readonly missing = '') {
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

  /** The usual envelope {success, data, message}: the data, or an error with the api's sentence. */
  private data<T>(request: Observable<any>): Observable<T> {
    return request.pipe(
      map((res) => {
        if (res?.success && res.data !== undefined && res.data !== null) {
          return res.data as T;
        }
        throw new StructureApiError(text(res?.message) || 'The server refused this.', true, missingOf(res));
      }),
      catchError((err) => {
        if (err instanceof StructureApiError) {
          return throwError(() => err);
        }
        const said = text(err?.error?.message);
        const status = Number(err?.status) || 0;
        // The api said no in its own words (a rate not set, a summary that does not add up): the user can act on it.
        const refused = !!said && [400, 409, 422].includes(status);
        if (refused) return throwError(() => new StructureApiError(said, true, missingOf(err?.error)));
        return throwError(() => new StructureApiError(status === 404 ? NOT_THERE : status > 0 && status < 500 && said ? said : NO_ANSWER, false));
      })
    );
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** What a refusal asks to be chosen, wherever the api put it. */
function missingOf(body: any): string {
  return text(body?.missing) || text(body?.data?.missing) || text(body?.errors?.missing);
}

/** The api's refusal in plain words: the name of its pricing method is not for the user. */
export function plainRefusal(message: string): string {
  const said = message.replace(/^\s*[a-z0-9_]+ cannot price this structure:\s*/i, '').trim();
  return said ? said.charAt(0).toUpperCase() + said.slice(1) : message;
}
