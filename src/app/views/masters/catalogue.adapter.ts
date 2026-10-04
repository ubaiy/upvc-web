import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, concat, defer, of, throwError, timer } from 'rxjs';
import { catchError, last, map, switchMap, tap } from 'rxjs/operators';

import { API_END_POINT } from '../../shared/configs/api.config';
import { ApiHttpService } from '../../shared/services/api-http.service';
import {
  ColourRow,
  GLASS_COSTHEAD,
  ItemRow,
  PriceFactors,
  ProfileRates,
  ProfileRow,
} from './catalogue.model';

/** Thrown when the API has no endpoint for what the screen asked. */
export class NotAvailableError extends Error {}

/** Above this many saves in one go, calls are spaced to stay under 60 a minute. */
const PACE_ABOVE = 40;
const PACE_MS = 1100;

/**
 * The one place the Catalogue page talks to the API (card U5).
 *
 * It uses today's endpoints. What the target flow needs and the API does not
 * have yet is kept behind this class and listed in
 * docs/review/phase-10-u5-log.md:
 *  - `product/add` is switched off in the API, so `addProfile` reports
 *    NotAvailableError;
 *  - a rate change for one category has no endpoint, so `saveProfileRates`
 *    saves the profiles one after another.
 */
@Injectable({ providedIn: 'root' })
export class CatalogueAdapter {
  constructor(private api: ApiHttpService) {}

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
      map((saved) => this.numbers(saved)),
      catchError((err) =>
        throwError(() =>
          err instanceof HttpErrorResponse && (err.status === 404 || err.status === 405)
            ? new NotAvailableError('Adding a profile is not switched on yet.')
            : err
        )
      )
    );
  }

  /** Reprices every profile from its weight and stores the factors. One call. */
  updateAllRates(factors: PriceFactors): Observable<void> {
    return this.write<unknown>(API_END_POINT.bulkPriceUpdate.post, factors).pipe(map(() => undefined));
  }

  /**
   * Saves new rates on each profile in turn and reports how many are done.
   * Completes with the saved rows; stops at the first failure.
   */
  saveProfileRates(
    profiles: ProfileRow[],
    rates: (profile: ProfileRow) => ProfileRates,
    progress: (done: number) => void = () => {}
  ): Observable<ProfileRow[]> {
    if (!profiles.length) {
      return of([]);
    }
    const saved: ProfileRow[] = [];
    const pace = profiles.length > PACE_ABOVE ? PACE_MS : 0;
    const steps = profiles.map((profile, index) =>
      defer(() => (index && pace ? timer(pace) : of(0))).pipe(
        switchMap(() => this.saveProfile({ ...profile, ...rates(profile) })),
        tap((row) => {
          saved.push(row);
          progress(saved.length);
        })
      )
    );
    return concat(...steps).pipe(
      last(),
      map(() => saved)
    );
  }

  saveColour(colour: Partial<ColourRow>): Observable<ColourRow> {
    const url = colour.id ? API_END_POINT.profile_color.update + colour.id : API_END_POINT.profile_color.add;
    return this.write<ColourRow>(url, { color_name: colour.color_name, color_code: colour.color_code });
  }

  deleteColour(id: number): Observable<void> {
    return this.write<unknown>(API_END_POINT.profile_color.delete + id).pipe(map(() => undefined));
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
    };
    return this.write<ItemRow>(url, body).pipe(map((saved) => ({ ...item, ...saved, cost: Number(saved.cost) } as ItemRow)));
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
      return err.error?.message || fallback;
    }
    return (err as Error)?.message || fallback;
  }

  private read<T>(url: string): Observable<T> {
    return this.api.get(url).pipe(map((res) => this.unwrap<T>(res)));
  }

  private write<T>(url: string, body?: unknown): Observable<T> {
    return this.api.post(url, body).pipe(map((res) => this.unwrap<T>(res)));
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
