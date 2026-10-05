import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { PLAN_OFFERS, PlanOffer } from 'src/app/shared/configs/plans';
import { quiet } from 'src/app/shared/interceptors/request-options';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';

/**
 * The plans a company can choose, and where the list came from:
 * `api`: GET plans; `fallback`: the api has no such route (404), the web's own copy is drawn;
 * `failed`: the api did not answer (no connection, an error): only the company's own plan is known.
 */
export interface PlanList {
  source: 'api' | 'fallback' | 'failed';
  offers: PlanOffer[];
}

/** A limit of `features`: a number is the limit, `null` (or nothing said) means no limit. */
function limitOf(value: unknown): number | null {
  const n = Number(value);
  return value === null || value === undefined || value === '' || !isFinite(n) ? null : n;
}

/** The rows of GET plans (`data.plans`, in the api's order) as the page draws them. Limits are the number keys of `features`. */
export function toPlanOffers(data: any): PlanOffer[] {
  const rows: any[] = Array.isArray(data?.plans) ? data.plans : [];
  return rows
    .filter((row) => row && typeof row.code === 'string' && row.code)
    .map((row) => {
      const features = row.features && typeof row.features === 'object' ? row.features : {};
      const price = Number(row.price ?? Number(row.price_paise) / 100);
      const seats = Number(row.seats);
      return {
        code: row.code,
        name: String(row.name || row.code),
        price: isFinite(price) ? price : 0,
        seats: isFinite(seats) ? seats : 0,
        quotationsPerMonth: limitOf(features.max_quotations_per_month),
        designTemplates: limitOf(features.max_design_templates),
        has3d: features.feature_3d === true,
      };
    });
}

@Injectable({ providedIn: 'root' })
export class PlansService {
  constructor(private api: ApiHttpService) {}

  /** GET plans (any signed-in user of a company; a locked company can still read it). Never fails: see PlanList. */
  list(): Observable<PlanList> {
    return this.api.get('plans', quiet()).pipe(
      map((res: any): PlanList => {
        const offers = toPlanOffers(res?.data);
        return offers.length ? { source: 'api', offers } : { source: 'failed', offers: [] };
      }),
      catchError((err: HttpErrorResponse) =>
        of<PlanList>(err?.status === 404 ? { source: 'fallback', offers: PLAN_OFFERS } : { source: 'failed', offers: [] })
      )
    );
  }
}
