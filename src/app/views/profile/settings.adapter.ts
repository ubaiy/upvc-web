import { Injectable } from '@angular/core';
import { Observable, map, shareReplay, switchMap, throwError } from 'rxjs';

import { ApiHttpService } from 'src/app/shared/services/api-http.service';
import {
  CompanySettings,
  DOCUMENT_DEFAULTS,
  DocumentSettings,
  GstRegistrationType,
  GstState,
  NumberSeries,
  SERIES_KEYS,
  SeriesChange,
  SeriesKey,
  SettingsSnapshot,
  TaxSettings,
  normaliseGstin,
} from './settings.model';

/** Endpoints the Settings page talks to. `upvc-api` routes/api.php. */
export const SETTINGS_API = {
  settings: 'company/settings',
  states: 'gst/states',
  identity: 'update-company-profile',
};

/**
 * Screen field → API field for Settings → Documents.
 *
 * Contract: docs/review/phase-9-flow-api-log.md, `company/settings` (card A4).
 */
export const DOCUMENT_FIELDS: Record<keyof DocumentSettings, string> = {
  numberPrefix: 'quotation_number_prefix',
  validityDays: 'quotation_validity_days',
  terms: 'terms_text',
  bankName: 'bank_name',
  bankAccountName: 'bank_account_name',
  bankAccount: 'bank_account_number',
  bankIfsc: 'bank_ifsc',
  upiId: 'upi_id',
  signatory: 'signatory_name',
};

/**
 * The one place the Settings page meets the API. Screens work with the
 * `settings.model` shapes; field names and the "errors arrive as HTTP 200
 * with no success flag" convention stay in here.
 */
@Injectable({ providedIn: 'root' })
export class SettingsAdapter {
  private states$?: Observable<GstState[]>;

  constructor(private api: ApiHttpService) {}

  load(): Observable<SettingsSnapshot> {
    return this.api.get(SETTINGS_API.settings).pipe(map((res) => toSnapshot(unwrap(res))));
  }

  /** GST state list; fetched once. */
  states(): Observable<GstState[]> {
    this.states$ ??= this.api.get(SETTINGS_API.states).pipe(
      map((res) => (unwrap(res) as GstState[]) ?? []),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.states$;
  }

  /**
   * Company tab: name, address, contact and logo go to the old branding
   * endpoint, the GST identity to `company/settings`. Returns the fresh state.
   */
  saveCompany(company: CompanySettings, logo?: File | null, confirmStateChange = false): Observable<SettingsSnapshot> {
    const form = new FormData();
    form.append('name', company.name.trim());
    form.append('address', company.address.trim());
    form.append('email', company.email.trim());
    form.append('phone', company.phone.trim());
    // The second number is optional: left out, the API stores none.
    if (company.phone2.trim()) {
      form.append('phone_no2', company.phone2.trim());
    }
    if (logo) {
      form.append('main_logo', logo);
    }
    const registered = company.registrationType !== 'unregistered';
    // City, district and PIN code are saved with the GST identity; an empty one clears it.
    const place = {
      city: company.city.trim() || null,
      district: company.district.trim() || null,
      pincode: company.pincode.trim() || null,
    };
    // The user said yes to "change the state to the GSTIN's": the api then takes the
    // state from the GSTIN, and must not be sent the old one beside it (phase 30 log, section 5).
    const gst: Record<string, unknown> = confirmStateChange
      ? { ...place, gst_registration_type: company.registrationType, gstin: normaliseGstin(company.gstin), confirm_state_change: true }
      : {
          ...place,
          gst_registration_type: company.registrationType,
          gstin: registered ? normaliseGstin(company.gstin) : null,
          state_code: company.stateCode || null,
        };
    return this.api.post(SETTINGS_API.identity, form).pipe(
      map(unwrap),
      switchMap(() => this.api.post(SETTINGS_API.settings, gst)),
      map((res) => toSnapshot(unwrap(res)))
    );
  }

  saveTax(tax: TaxSettings): Observable<SettingsSnapshot> {
    return this.api
      .post(SETTINGS_API.settings, {
        default_gst_rate: tax.gstRate,
        default_hsn_code: tax.hsnCode.trim(),
        prices_include_gst: tax.pricesIncludeGst,
      })
      .pipe(map((res) => toSnapshot(unwrap(res))));
  }

  /**
   * Documents tab. Refuses when the API has no place for these fields (one
   * older than card A4): it would answer "updated" and keep nothing.
   */
  saveDocuments(
    documents: DocumentSettings,
    stored: boolean,
    series: Partial<Record<SeriesKey, SeriesChange>> = {}
  ): Observable<SettingsSnapshot> {
    if (!stored) {
      return throwError(() => new Error('Document details cannot be saved yet.'));
    }
    const body: Record<string, unknown> = {};
    (Object.keys(DOCUMENT_FIELDS) as (keyof DocumentSettings)[]).forEach((key) => {
      const value = documents[key];
      body[DOCUMENT_FIELDS[key]] = typeof value === 'string' ? value.trim() : value;
    });
    // Only the series the user changed: the api keeps the rest as they are.
    if (Object.keys(series).length) {
      body['number_series'] = series;
    }
    return this.api.post(SETTINGS_API.settings, body).pipe(map((res) => toSnapshot(unwrap(res))));
  }
}

/** A refusal of the api, with what it sent beside the message (`data.errors`, `data.needs_confirmation`). */
export class SettingsRefusal extends Error {
  constructor(message: string, readonly data: any = null) {
    super(message);
  }

  /** The sentence for one form field, when the api names one. */
  fieldError(field: string): string {
    const text = this.data?.errors?.[field];
    return typeof text === 'string' && text ? readableMessage(text) : '';
  }
}

/** The API reports a refusal as HTTP 200 with `{ status: 0, message }`. */
export function unwrap(res: any): any {
  if (!res || res.success !== true) {
    throw new SettingsRefusal(readableMessage(res?.message), res?.data ?? null);
  }
  return res.data;
}

/** "state_code does not match…" → "State does not match…": field names are not for users. */
export function readableMessage(message: unknown): string {
  if (typeof message !== 'string' || !message.trim()) {
    return 'Something went wrong. Please try again.';
  }
  const text = message
    .replace(/\bstate_code\b/g, 'State')
    .replace(/\bgstin\b/g, 'GSTIN')
    .replace(/\bphone_no2\b/g, 'Second phone')
    .replace(/\bdefault_gst_rate\b/g, 'GST rate')
    .replace(/\bdefault_hsn_code\b/g, 'HSN code')
    .replace(/\bmain_logo\b/g, 'Logo')
    .replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** An error thrown by `unwrap`, or by HttpClient, as one sentence. */
export function errorText(err: any): string {
  if (err?.error?.message) {
    return readableMessage(err.error.message);
  }
  if (err?.status === 0) {
    return 'We could not reach the server. Check your connection.';
  }
  return err instanceof Error && err.message ? err.message : readableMessage(null);
}

export function toSnapshot(data: any): SettingsSnapshot {
  const d = data ?? {};
  const registration: GstRegistrationType = ['regular', 'composition', 'unregistered'].includes(d.gst_registration_type)
    ? d.gst_registration_type
    : 'regular';
  const company: CompanySettings = {
    name: text(d.name),
    address: text(d.address),
    city: text(d.city),
    district: text(d.district),
    pincode: text(d.pincode),
    pincodeWarning: (Array.isArray(d.warnings) && d.warnings.find((w: any) => w?.field === 'pincode')?.message) || '',
    email: text(d.email),
    phone: text(d.phone),
    // Before the second number became optional, "none" was saved as the first number again.
    phone2: text(d.phone_no2) === text(d.phone) ? '' : text(d.phone_no2),
    logoUrl: d.main_logo || null,
    gstin: d.gstin || null,
    stateCode: d.state_code || null,
    stateName: d.state_name || null,
    registrationType: registration,
  };
  const rate = Number(d.default_gst_rate);
  const tax: TaxSettings = {
    gstRate: Number.isFinite(rate) ? rate : 18,
    hsnCode: text(d.default_hsn_code),
    pricesIncludeGst: !!d.prices_include_gst,
  };
  const documentsStored = Object.values(DOCUMENT_FIELDS).every((field) => field in d);
  const days = Number(d[DOCUMENT_FIELDS.validityDays]);
  const documents: DocumentSettings = documentsStored
    ? {
        numberPrefix: text(d[DOCUMENT_FIELDS.numberPrefix]) || DOCUMENT_DEFAULTS.numberPrefix,
        validityDays: Number.isFinite(days) && days > 0 ? days : DOCUMENT_DEFAULTS.validityDays,
        terms: text(d[DOCUMENT_FIELDS.terms]),
        bankName: text(d[DOCUMENT_FIELDS.bankName]),
        bankAccountName: text(d[DOCUMENT_FIELDS.bankAccountName]),
        bankAccount: text(d[DOCUMENT_FIELDS.bankAccount]),
        bankIfsc: text(d[DOCUMENT_FIELDS.bankIfsc]),
        upiId: text(d[DOCUMENT_FIELDS.upiId]),
        signatory: text(d[DOCUMENT_FIELDS.signatory]),
      }
    : { ...DOCUMENT_DEFAULTS };
  return { company, tax, documents, documentsStored, numberSeries: toNumberSeries(d.number_series) };
}

function toNumberSeries(raw: any): NumberSeries[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  return SERIES_KEYS.filter((key) => raw[key] && typeof raw[key] === 'object').map((key) => {
    const s = raw[key];
    const next = Number(s.next);
    const min = Number(s.min_next);
    return {
      key,
      label: text(s.label) || key,
      prefix: text(s.prefix),
      next: Number.isFinite(next) ? next : 1,
      lastUsed: Number(s.last_used) || 0,
      minNext: Number.isFinite(min) && min > 0 ? min : 1,
      example: text(s.example),
      yearly: !!s.yearly,
      financialYear: text(s.financial_year),
    };
  });
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}
