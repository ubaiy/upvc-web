import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { API_END_POINT } from '../../shared/configs/api.config';
import { quiet } from '../../shared/interceptors/request-options';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { AccessService } from 'src/app/shared/access/access.service';
import {
  ColourRow,
  GLASS_COSTHEAD,
  ItemRow,
  PriceFactors,
  ProfileRow,
  RatePreview,
  RateRequest,
  subCategoryFor,
} from './catalogue.model';

/**
 * The one place the Catalogue page talks to the API (card U5, wired to the
 * endpoints of docs/review/phase-17-screen-api-gaps-log.md by card T76).
 */
@Injectable({ providedIn: 'root' })
export class CatalogueAdapter {
  constructor(private api: ApiHttpService, private access: AccessService) {}

  profiles(): Observable<ProfileRow[]> {
    return this.read<ProfileRow[]>(API_END_POINT.product.productList).pipe(
      map((rows) => rows.map((row) => this.numbers(row)))
    );
  }

  colours(): Observable<ColourRow[]> {
    return this.read<ColourRow[]>(API_END_POINT.profile_color.list);
  }

  /** Every glass type and hardware item in one call; see `isGlass`. */
  items(): Observable<ItemRow[]> {
    return this.read<ItemRow[]>(API_END_POINT.costHead.costHeadList).pipe(
      map((rows) => rows.map((row) => ({ ...row, cost: Number(row.cost) })))
    );
  }

  /** null until the fabricator has set rates per kg. */
  factors(): Observable<PriceFactors | null> {
    // The rates per kg are cost: a role without it (sales) is not asked a route it would be refused.
    if (!this.access.can('prices.view_cost')) {
      return of(null);
    }
    return this.read<Partial<PriceFactors> | null>(API_END_POINT.bulkPriceUpdate.get).pipe(
      map((data) =>
        data && data.per_kg != null
          ? {
              per_kg: Number(data.per_kg),
              rate_bar: Number(data.rate_bar),
              color_per_kg: Number(data.color_per_kg),
              color_rate_bar: Number(data.color_rate_bar),
            }
          : null
      )
    );
  }

  units(): Observable<string[]> {
    return this.read<string[]>(API_END_POINT.costHead.unit);
  }

  saveProfile(profile: ProfileRow): Observable<ProfileRow> {
    return this.write<ProfileRow>(`${API_END_POINT.product.edit}/${profile.id}`, this.profileBody(profile)).pipe(
      map((saved) => this.numbers({ ...profile, ...saved }))
    );
  }

  addProfile(profile: Omit<ProfileRow, 'id'>): Observable<ProfileRow> {
    return this.write<ProfileRow>(API_END_POINT.product.add, this.profileBody(profile)).pipe(
      map((saved) => this.numbers(saved))
    );
  }

  /** Refused, with the quotation numbers in the message, while a quotation uses the profile. */
  deleteProfile(id: number): Observable<void> {
    return this.remove(`${API_END_POINT.product.delete}/${id}`);
  }

  /**
   * A rate change for every profile or one category, in one call. With
   * `dryRun` nothing is saved and the answer is the preview.
   */
  changeRates(request: RateRequest, dryRun: boolean): Observable<RatePreview> {
    const body: Record<string, unknown> = { mode: request.mode, category: request.category || 'all', dry_run: dryRun };
    if (request.mode === 'percent') {
      body['percent'] = request.percent;
    } else {
      Object.assign(body, request.factors);
    }
    return this.write<RatePreview>(API_END_POINT.bulkPriceUpdate.changeRates, body);
  }

  saveColour(colour: Partial<ColourRow>): Observable<ColourRow> {
    const url = colour.id ? API_END_POINT.profile_color.update + colour.id : API_END_POINT.profile_color.add;
    return this.write<ColourRow>(url, { color_name: colour.color_name, color_code: colour.color_code });
  }

  /** Refused for the default colour, and while a quotation uses the colour (the numbers are in the message). */
  deleteColour(id: number): Observable<void> {
    return this.remove(API_END_POINT.profile_color.delete + id);
  }

  saveItem(item: Partial<ItemRow>): Observable<ItemRow> {
    const url = item.id ? `${API_END_POINT.costHead.costHeadUpdate}/${item.id}` : API_END_POINT.costHead.costHeadAdd;
    const body = {
      name: item.name,
      type: item.type || item.costhead,
      cost: item.cost,
      unit: item.unit,
      costhead: item.costhead,
      description: item.description ?? '',
      category: item.category ?? null,
      // The "used for" text; the API keeps what is stored when it is not sent.
      ...(item.conditions != null ? { conditions: item.conditions } : {}),
    };
    return this.write<ItemRow>(url, body).pipe(map((saved) => ({ ...item, ...saved, cost: Number(saved.cost) } as ItemRow)));
  }

  /** A glass type or hardware item; refused like `deleteProfile` while in use. */
  deleteItem(id: number): Observable<void> {
    return this.remove(`${API_END_POINT.costHead.delete}/${id}`);
  }

  /** Words to show a person when a call fails. */
  message(err: unknown, fallback = 'Something went wrong. Try again.'): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return 'No connection to the server. Check your internet and try again.';
      }
      if (err.status === 429) {
        return 'Too many changes at once. Wait a minute, then try again.';
      }
      // A 5xx carries the server's own exception text, which is not for the screen.
      return err.status >= 500 ? fallback : err.error?.message || fallback;
    }
    return (err as Error)?.message || fallback;
  }

  private read<T>(url: string): Observable<T> {
    // The lists draw their own skeleton rows: the app ring stays out (card T138). A failure still raises the toast.
    return this.api.get(url, quiet('loader')).pipe(map((res) => this.unwrap<T>(res)));
  }

  private write<T>(url: string, body?: unknown): Observable<T> {
    return this.api.post(url, body).pipe(map((res) => this.unwrap<T>(res)));
  }

  /**
   * A delete. The dialog shows why one was refused ("… used by 2 quotations
   * (Q-0005, Q-0007)"), so the global toast is told not to say it again.
   */
  private remove(url: string): Observable<void> {
    return this.api.post(url, undefined, quiet('errors')).pipe(map((res) => void this.unwrap<unknown>(res)));
  }

  /** The API answers a refused request with HTTP 200 and no `success`. */
  private unwrap<T>(res: { success?: boolean; data: T; message?: string }): T {
    if (!res || res.success !== true) {
      throw new Error(res?.message || 'The server refused the request.');
    }
    return res.data;
  }

  private profileBody(profile: Partial<ProfileRow>) {
    return {
      category: profile.category,
      profile_code: profile.profile_code,
      profile_name: profile.profile_name,
      kg_meter: profile.kg_meter,
      rate_meter: profile.rate_meter,
      rate_bar: profile.rate_bar,
      kg_meter_color: profile.kg_meter_color,
      rate_meter_color: profile.rate_meter_color,
      rate_bar_color: profile.rate_bar_color,
      // The designer offers a profile for a frame or sash by this value.
      ...(subCategoryFor(profile) ? { sub_category: subCategoryFor(profile) } : {}),
      role: profile.role ?? null,
      face_width_mm: profile.face_width_mm ?? null,
      profile_depth_mm: profile.profile_depth_mm ?? null,
      rebate_mm: profile.rebate_mm ?? null,
      sightline_mm: profile.sightline_mm ?? null,
    };
  }

  private numbers(row: ProfileRow): ProfileRow {
    return {
      ...row,
      kg_meter: Number(row.kg_meter),
      kg_meter_color: Number(row.kg_meter_color ?? row.kg_meter),
      rate_meter: Number(row.rate_meter),
      rate_bar: Number(row.rate_bar),
      rate_meter_color: Number(row.rate_meter_color),
      rate_bar_color: Number(row.rate_bar_color),
    };
  }
}

export function isGlass(item: Pick<ItemRow, 'costhead'>): boolean {
  return item.costhead === GLASS_COSTHEAD;
}
