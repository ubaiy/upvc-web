import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { quiet } from '../interceptors/request-options';
import { ApiHttpService } from './api-http.service';

/** What the PIN code directory knows about one PIN. */
export interface PinLookup {
  pincode: string;
  city: string;
  district: string;
  stateCode: string;
  stateName: string;
  /** Post office and area names under the PIN: suggestions for the area line. */
  localities: string[];
}

/** One city of the directory, with every PIN code it has. */
export interface CityOption {
  city: string;
  district: string;
  stateCode: string;
  pincodes: string[];
}

export const PIN_PATTERN = /^[1-9][0-9]{5}$/;

/**
 * The PIN code and city directory (`location/pincode/{pin}`, `location/cities`).
 * It only helps: every call is quiet (no overlay, no toast), and a caller
 * treats a failure as "no suggestion", never as a reason to stop a save.
 */
@Injectable({ providedIn: 'root' })
export class LocationService {
  /** A PIN's answer does not change while the page is open; null is "not in the directory". */
  private pins = new Map<string, PinLookup | null>();

  constructor(private api: ApiHttpService) {}

  /** The PIN's city, district and state; null when the directory does not have it. Errors on a failed call. */
  lookupPin(pin: string): Observable<PinLookup | null> {
    if (this.pins.has(pin)) {
      return of(this.pins.get(pin) as PinLookup | null);
    }
    return this.api.get(`location/pincode/${encodeURIComponent(pin)}`, quiet()).pipe(
      map((res) => toPinLookup(res?.data, pin)),
      catchError((err) => (err?.status === 404 ? of(null) : throwError(() => err))),
      tap((found) => this.pins.set(pin, found))
    );
  }

  /** Cities whose name starts with, then contains, the text; within one state when a state is given. */
  cities(stateCode: string, text: string, limit = 20): Observable<CityOption[]> {
    const query = [
      stateCode ? `state_code=${encodeURIComponent(stateCode)}` : '',
      text ? `q=${encodeURIComponent(text)}` : '',
      `limit=${limit}`,
    ]
      .filter(Boolean)
      .join('&');
    return this.api.get(`location/cities?${query}`, quiet()).pipe(
      map((res) => (Array.isArray(res?.data) ? res.data : []).map(toCityOption).filter((c: CityOption) => !!c.city))
    );
  }
}

function toPinLookup(data: any, pin: string): PinLookup | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  return {
    pincode: String(data.pincode || pin),
    city: String(data.city || ''),
    district: String(data.district || ''),
    stateCode: data.state_code != null ? String(data.state_code) : '',
    stateName: String(data.state_name || ''),
    localities: Array.isArray(data.localities) ? data.localities.map(String).filter(Boolean) : [],
  };
}

function toCityOption(row: any): CityOption {
  return {
    city: String(row?.city || ''),
    district: String(row?.district || ''),
    stateCode: row?.state_code != null ? String(row.state_code) : '',
    pincodes: Array.isArray(row?.pincodes) ? row.pincodes.map(String) : [],
  };
}
