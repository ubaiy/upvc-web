/** GST registration of the fabricator's own company. Values are the API's. */
export type GstRegistrationType = 'regular' | 'composition' | 'unregistered';

export const REGISTRATION_TYPES: { value: GstRegistrationType; label: string; hint: string }[] = [
  { value: 'regular', label: 'Regular', hint: 'GST is charged on every quotation and bill.' },
  { value: 'composition', label: 'Composition', hint: 'No tax lines; documents say "Composition taxable person".' },
  { value: 'unregistered', label: 'Not registered', hint: 'No GSTIN and no tax lines on documents.' },
];

/** Same pattern as the API (GstCalculator::GSTIN_PATTERN). */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export interface GstState {
  code: string;
  name: string;
  abbreviation?: string;
}

/** Settings → Company. */
export interface CompanySettings {
  name: string;
  /** Building, street and area. City and PIN code have their own fields since T90. */
  address: string;
  city: string;
  /** Filled by the PIN code directory. */
  district: string;
  pincode: string;
  /** The api's sentence when the PIN code belongs to another state than the company's. */
  pincodeWarning?: string;
  email: string;
  phone: string;
  phone2: string;
  logoUrl: string | null;
  gstin: string | null;
  stateCode: string | null;
  stateName: string | null;
  registrationType: GstRegistrationType;
}

/** Settings → Pricing and tax (the GST part; margins and payment terms are lists). */
export interface TaxSettings {
  gstRate: number;
  hsnCode: string;
  pricesIncludeGst: boolean;
}

/** Settings → Documents. */
export interface DocumentSettings {
  numberPrefix: string;
  validityDays: number;
  terms: string;
  bankName: string;
  bankAccountName: string;
  bankAccount: string;
  bankIfsc: string;
  upiId: string;
  signatory: string;
}

/** The five series the api numbers documents from (phase 30 log, section 4). */
export type SeriesKey = 'quotation' | 'invoice' | 'order' | 'challan' | 'receipt';

export const SERIES_KEYS: SeriesKey[] = ['quotation', 'invoice', 'order', 'challan', 'receipt'];

/** One number series as `company/settings` returns it. */
export interface NumberSeries {
  key: SeriesKey;
  /** "Invoice", "Delivery challan": the api's label. */
  label: string;
  prefix: string;
  /** The number the next document takes. */
  next: number;
  lastUsed: number;
  /** One more than the highest number used: `next` cannot be lower. */
  minNext: number;
  /** "INV/26-27/0004": the next number as it will print. */
  example: string;
  /** Restarts at 1 each April and carries the financial year. */
  yearly: boolean;
  financialYear: string;
}

/** What the user changed in one series; only these go to the api. */
export interface SeriesChange {
  prefix?: string;
  next?: number;
}

/** "INV/26-27/0251" or "Q-0017": how a series prints a number, the way the api writes its `example`. */
export function seriesExample(series: Pick<NumberSeries, 'yearly' | 'financialYear'>, prefix: string, next: number): string {
  const number = String(Math.max(0, Math.floor(next) || 0)).padStart(4, '0');
  return series.yearly ? `${prefix}/${series.financialYear}/${number}` : `${prefix}${number}`;
}

export interface SettingsSnapshot {
  company: CompanySettings;
  tax: TaxSettings;
  documents: DocumentSettings;
  /** Empty against an api that has no number series (older than card T83). */
  numberSeries: NumberSeries[];
  /** False when the API is older than card A4 and has no place for the document fields. */
  documentsStored: boolean;
}

export const DOCUMENT_DEFAULTS: DocumentSettings = {
  numberPrefix: 'Q-',
  validityDays: 30,
  terms: '',
  bankName: '',
  bankAccountName: '',
  bankAccount: '',
  bankIfsc: '',
  upiId: '',
  signatory: '',
};

/** "24abcde1234f1z5 " → "24ABCDE1234F1Z5"; blank → null. */
export function normaliseGstin(value: string | null | undefined): string | null {
  const gstin = (value ?? '').replace(/\s+/g, '').toUpperCase();
  return gstin || null;
}

/** The state a GSTIN names (its first two digits), or null when it is not well formed. */
export function stateCodeFromGstin(value: string | null | undefined): string | null {
  const gstin = normaliseGstin(value);
  return gstin && GSTIN_PATTERN.test(gstin) ? gstin.slice(0, 2) : null;
}
