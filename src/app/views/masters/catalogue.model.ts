/**
 * Types and pure rules of the Catalogue page (card U5). No Angular in here, so
 * every rule below is unit-tested without a TestBed.
 */

export type CatalogueTab = 'profile' | 'profile-color' | 'glass' | 'hardware';

export interface CatalogueTabDef {
  id: CatalogueTab;
  label: string;
  /** Used in "Add …", "Search …" and the empty states. */
  noun: string;
  plural: string;
}

/** The tab id is also the last segment of the address: /masters/<id>. */
export const CATALOGUE_TABS: CatalogueTabDef[] = [
  { id: 'profile', label: 'Profiles', noun: 'profile', plural: 'profiles' },
  { id: 'profile-color', label: 'Colours', noun: 'colour', plural: 'colours' },
  { id: 'glass', label: 'Glass', noun: 'glass', plural: 'glass types' },
  { id: 'hardware', label: 'Hardware', noun: 'hardware', plural: 'hardware items' },
];

/** The four company-wide factors every profile rate is derived from. */
export interface PriceFactors {
  per_kg: number;
  /** Bar length in metres: rate per bar = rate per metre × this. */
  rate_bar: number;
  color_per_kg: number;
  color_rate_bar: number;
}

export interface ProfileRates {
  rate_meter: number;
  rate_bar: number;
  rate_meter_color: number;
  rate_bar_color: number;
}

export interface ProfileRow extends ProfileRates {
  id: number;
  category: string;
  profile_code: string;
  profile_name: string;
  kg_meter: number;
  kg_meter_color: number;
  sub_category?: string | null;
  role?: string | null;
  face_width_mm?: number | null;
  profile_depth_mm?: number | null;
  rebate_mm?: number | null;
  sightline_mm?: number | null;
  updated_at?: string;
}

export interface ColourRow {
  id: number;
  color_name: string;
  color_code: string;
  is_default: number;
}

/** A glass type or a hardware item: one row of the API's "costhead" table. */
export interface ItemRow {
  id: number;
  name: string;
  description?: string | null;
  /** The group, e.g. "Handle", "Roller". Glass is stored as "Glazzing". */
  costhead: string;
  type: string;
  cost: number;
  unit: string;
  category?: string | null;
  conditions?: string | null;
}

/** How the API spells the glass group. It is data, never shown as a label. */
export const GLASS_COSTHEAD = 'Glazzing';

export const PROFILE_ROLES: { value: string; label: string }[] = [
  { value: 'frame', label: 'Frame' },
  { value: 'sash', label: 'Sash' },
  { value: 'shutter', label: 'Shutter' },
  { value: 'mullion', label: 'Mullion' },
  { value: 'transom', label: 'Transom' },
  { value: 'bead', label: 'Bead' },
  { value: 'interlock', label: 'Interlock' },
  { value: 'coupler', label: 'Coupler' },
];

const SPELLING: [RegExp, string][] = [
  [/slidding/gi, 'Sliding'],
  [/glazzing/gi, 'Glazing'],
  [/casment/gi, 'Casement'],
  [/mulian/gi, 'Mullion'],
  [/espage/gi, 'Espag'],
];

/**
 * Corrects the misspelt words the API stores as category and group values
 * ("Slidding", "Glazzing", "Casment"). For display only: the stored value is
 * what gets sent back.
 */
export function fixSpelling(value: string | null | undefined): string {
  let text = (value ?? '').trim();
  if (text === 'C/S') {
    return 'Casement and sliding';
  }
  for (const [wrong, right] of SPELLING) {
    text = text.replace(wrong, (found) =>
      found[0] === found[0].toLowerCase() ? right.toLowerCase() : right
    );
  }
  return text;
}

/** "Sq M" → "sq m", "Rmt" and "Meter" → "m": the unit after a rate. */
export function unitLabel(unit: string | null | undefined): string {
  const key = (unit ?? '').trim().toLowerCase();
  if (key === 'rmt' || key === 'meter' || key === 'metre') {
    return 'm';
  }
  return key || 'unit';
}

/** What a profile is used as: its role, or the older sub-category. */
export function usedAs(profile: Pick<ProfileRow, 'role' | 'sub_category'>): string {
  const value = (profile.role || profile.sub_category || '').trim();
  return value ? value[0].toUpperCase() + value.slice(1) : '';
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function hasFactors(factors: PriceFactors | null | undefined): factors is PriceFactors {
  return !!factors && Number(factors.per_kg) > 0 && Number(factors.color_per_kg) > 0;
}

/**
 * The four rates of a profile from its weight, by the same sum the API runs in
 * `setting/update-price` (rate per metre = kg per metre × rate per kg).
 */
export function deriveRates(kgPerMetre: number, colourKgPerMetre: number, factors: PriceFactors): ProfileRates {
  const white = kgPerMetre * factors.per_kg;
  const colour = colourKgPerMetre * factors.color_per_kg;
  return {
    rate_meter: round2(white),
    rate_bar: round2(white * factors.rate_bar),
    rate_meter_color: round2(colour),
    rate_bar_color: round2(colour * factors.color_rate_bar),
  };
}

/** A rate typed in the row: the bar rate keeps its ratio to the metre rate. */
export function withMetreRate(
  profile: ProfileRow,
  field: 'rate_meter' | 'rate_meter_color',
  value: number,
  factors: PriceFactors | null
): ProfileRates {
  const rates: ProfileRates = {
    rate_meter: profile.rate_meter,
    rate_bar: profile.rate_bar,
    rate_meter_color: profile.rate_meter_color,
    rate_bar_color: profile.rate_bar_color,
  };
  const barField = field === 'rate_meter' ? 'rate_bar' : 'rate_bar_color';
  const old = Number(profile[field]);
  const barLength =
    old > 0 && Number(profile[barField]) > 0
      ? Number(profile[barField]) / old
      : Number(field === 'rate_meter' ? factors?.rate_bar : factors?.color_rate_bar) || 0;
  rates[field] = round2(value);
  rates[barField] = round2(value * barLength);
  return rates;
}

export type RateChangeMode = 'percent' | 'rate';

/** The sample window of the "Update rates" preview: one casement, 1200 × 1500 mm. */
export const SAMPLE_WINDOW = { widthMm: 1200, heightMm: 1500, frameMetres: 5.4, sashMetres: 5.0 };

export interface SampleCost {
  frame: ProfileRow;
  sash: ProfileRow | null;
  before: number;
  after: number;
}

/**
 * Profile material for the sample window before and after a change: the outer
 * frame all round, plus one sash when the catalogue has one. Glass, hardware
 * and margin do not move with profile rates, so they are left out.
 */
export function sampleCost(
  profiles: ProfileRow[],
  ratesAfter: (profile: ProfileRow) => ProfileRates
): SampleCost | null {
  const frame = profiles.find((p) => usedAs(p).toLowerCase() === 'frame') ?? profiles[0];
  if (!frame) {
    return null;
  }
  const sash =
    profiles.find((p) => p.category === frame.category && usedAs(p).toLowerCase() === 'sash') ?? null;
  const cost = (rate: (p: ProfileRow) => number) =>
    round2(rate(frame) * SAMPLE_WINDOW.frameMetres + (sash ? rate(sash) * SAMPLE_WINDOW.sashMetres : 0));
  return {
    frame,
    sash,
    before: cost((p) => Number(p.rate_meter)),
    after: cost((p) => ratesAfter(p).rate_meter),
  };
}

/** Parses what a person types into a rate box. NaN when it is not a number. */
export function parseAmount(text: string | number | null | undefined): number {
  const cleaned = String(text ?? '').replace(/[₹,\s]/g, '');
  return cleaned === '' ? NaN : Number(cleaned);
}

/** The API refuses rates above this (audit H5). */
export const MAX_RATE = 1000000;

/** What `setting/change-rates` is asked: a percentage, or new rates per kg. */
export interface RateRequest {
  mode: RateChangeMode;
  /** null = every profile. */
  category: string | null;
  percent?: number;
  factors?: PriceFactors;
}

/** The answer of `setting/change-rates`; with `dry_run` nothing was saved. */
export interface RatePreview {
  dry_run: boolean;
  saved: boolean;
  count: number;
  factors: { before: PriceFactors | null; after: PriceFactors | null };
  profiles: { id: number; before: ProfileRates; after: ProfileRates }[];
}

/** The stored `sub_category` each "used as" role belongs to in the catalogue. */
const SUB_CATEGORY_OF: Record<string, string> = {
  frame: 'Frame',
  sash: 'Sash',
  shutter: 'Sash',
  mullion: 'Mullion',
  transom: 'Mullion',
  bead: 'Beading',
  interlock: 'Accessories',
  coupler: 'Accessories',
};

/**
 * The `sub_category` to save with a profile: the one it has, or the one its
 * role belongs to. The designer's profile lists are filtered by it, so a
 * profile saved without one is never offered for a frame or sash.
 */
export function subCategoryFor(profile: Pick<ProfileRow, 'role' | 'sub_category'>): string | null {
  return profile.sub_category || SUB_CATEGORY_OF[(profile.role ?? '').toLowerCase()] || null;
}
