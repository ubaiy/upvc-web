import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';

import { quiet } from 'src/app/shared/interceptors/request-options';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';

/** The four rates of GET / PUT pricing-settings/extras (card T144), in the order the page shows them. */
export const EXTRA_RATE_KEYS = [
  'sash_bar_rate_m',
  'bend_rate_per_bend',
  'bend_rate_per_m',
  'shaped_glass_surcharge_pct',
] as const;
export type ExtraRateKey = (typeof EXTRA_RATE_KEYS)[number];

/** A rate: a number, or null when the company has not set it (it then charges nothing). */
export type ExtraRates = Record<ExtraRateKey, number | null>;

/** A cost head of the catalogue's group "Pivot Hardware". */
export interface PivotHardwareItem {
  id: number;
  name: string;
  rate: number;
}

/** `data` of GET and of PUT pricing-settings/extras. */
export interface PricingExtras {
  rates: ExtraRates;
  /** The api's unit of each rate: "INR per m", "INR per bend", "percent". */
  units: Partial<Record<ExtraRateKey, string>>;
  /** The rates that charge nothing: not set, or 0. */
  missing: ExtraRateKey[];
  pivot_hardware: { available: boolean; items: PivotHardwareItem[] };
}

/** What a save was refused for: the api's sentence for each field (422), and one for the whole form. */
export class PricingExtrasRefusal extends Error {
  constructor(message: string, readonly fields: Partial<Record<ExtraRateKey, string>> = {}) {
    super(message);
  }
}

function rate(value: unknown): number | null {
  const n = Number(value);
  return value === null || value === undefined || value === '' || !isFinite(n) ? null : n;
}

/** The api's answer with every key in place, whatever it left out. */
export function toPricingExtras(data: any): PricingExtras {
  const given = data?.rates ?? {};
  const rates = {} as ExtraRates;
  for (const key of EXTRA_RATE_KEYS) rates[key] = rate(given[key]);
  const items: any[] = Array.isArray(data?.pivot_hardware?.items) ? data.pivot_hardware.items : [];
  return {
    rates,
    units: data?.units && typeof data.units === 'object' ? data.units : {},
    missing: (Array.isArray(data?.missing) ? data.missing : []).filter((key: any) => EXTRA_RATE_KEYS.includes(key)),
    pivot_hardware: {
      available: items.length > 0,
      items: items.map((row) => ({ id: Number(row?.id), name: String(row?.name ?? ''), rate: Number(row?.rate) || 0 })),
    },
  };
}

function refusal(err: HttpErrorResponse, fallback: string): PricingExtrasRefusal {
  const errors = err?.error?.data?.errors ?? err?.error?.errors;
  const fields: Partial<Record<ExtraRateKey, string>> = {};
  if (errors && typeof errors === 'object') {
    for (const key of EXTRA_RATE_KEYS) {
      const said = (errors as any)[key] ?? (errors as any)[`rates.${key}`];
      if (said) fields[key] = String(Array.isArray(said) ? said[0] : said);
    }
  }
  const message =
    err?.status === 0
      ? 'We could not reach the server. Check your connection.'
      : Object.keys(fields).length
        ? 'Some figures were not accepted. They are marked below.'
        : err?.error?.message || fallback;
  return new PricingExtrasRefusal(message, fields);
}

/**
 * The company's rates for a bar inside a sash or shutter, for bending and
 * for shaped glass. The api prices; the web only keeps the rates.
 */
@Injectable({ providedIn: 'root' })
export class PricingExtrasService {
  constructor(private api: ApiHttpService) {}

  /** GET pricing-settings/extras. `null`: this api has no such route (404). */
  load(): Observable<PricingExtras | null> {
    return this.api.get('pricing-settings/extras', quiet()).pipe(
      map((res: any) => toPricingExtras(res?.data)),
      catchError((err: HttpErrorResponse) =>
        err?.status === 404 ? of(null) : throwError(() => refusal(err, 'The rates could not be loaded.'))
      )
    );
  }

  /** PUT pricing-settings/extras: every rate named is set, or unset with null. Answers what GET answers. */
  save(rates: ExtraRates): Observable<PricingExtras> {
    return this.api.put('pricing-settings/extras', { rates }, quiet()).pipe(
      map((res: any) => toPricingExtras(res?.data)),
      catchError((err: HttpErrorResponse) => throwError(() => refusal(err, 'The rates could not be saved. Please try again.')))
    );
  }
}
