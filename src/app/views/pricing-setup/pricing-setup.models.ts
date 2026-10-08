/**
 * What the api answers on the routes of "Pricing setup" (card T182; contract in
 * docs/review/phase-62-own-profiles-log.md, sections CONTRACT (T148) and T152).
 * The web keeps these figures and shows the api's sentences; it works out no price.
 */

/** One thing that stands between the company and a price. `text` is shown; the rest says where it is fixed. */
export interface Missing {
  code: string;
  text: string;
  /** A figure of `pricing-setup/settings`. */
  key?: string;
  /** A role of a profile system. */
  role?: string;
  /** "casement" | "sliding" | "door": the kind that has no default hardware set. */
  category?: string;
  product_id?: number;
  /** The system of a profile the area formula has no rate for (`unpriced_profiles`). */
  system_id?: number;
  profile_code?: string;
}

export interface SetRef {
  id: number;
  code: string;
  name: string;
}

export interface Trial {
  window: string;
  width: number;
  height: number;
  priced: boolean;
  glass?: string;
  cost?: number;
  reason?: string;
  warnings?: string[];
  /** The bill of materials of the trial in short (api T187). */
  bom?: BomShort;
}

/** A ready system of the starter pack, and the company's system of that name when it has one (api T187). */
export interface Pack {
  pack: string;
  what: string;
  kind: string;
  profiles: number;
  system_id: number | null;
  /** A system of a brand pack: how many of its weights are generic, to confirm from the supplier's invoice (api T194). */
  confirm?: number;
}

/** The ready systems of one brand of profile, and how true the pack is (api T194). */
export interface Brand {
  brand: string;
  note: string;
  packs: Pack[];
}

export interface SystemSummary {
  id: number;
  name: string;
  category: string;
  kind: string;
  retired: boolean;
  /** The profiles of the system, and those of them that hold a role (api T184). */
  profiles?: number;
  profiles_with_role?: number;
  ready: boolean;
  missing: Missing[];
  hardware_set: SetRef | null;
  trials: Trial[];
}

export interface RoleInfo {
  role: string;
  label: string;
  what?: string;
  required_for?: string[];
  without_it?: string | null;
}

/** A value of the example pack a new company starts with, and how far it can be trusted. */
export interface ExampleValue {
  what: string;
  key: string;
  label: string;
  value: number | string | null;
  unit?: string;
  confidence: string;
  confidence_text?: string;
  flagged: boolean;
  source?: string;
  stored: boolean;
  system?: string;
  role?: string;
}

export interface ExamplePack {
  pack: string;
  name: string;
  note: string;
  confidence: Record<string, string>;
  to_confirm: ExampleValue[];
}

export interface MethodChoice {
  key: string;
  label: string;
}

/** GET pricing-setup. */
export interface Checklist {
  method: string;
  methods: MethodChoice[];
  ready: boolean;
  missing: Missing[];
  notes: string[];
  /** While the method is the area formula: each profile of a system in use it has no rate for. A window on one is refused. */
  unpriced_profiles: Missing[];
  systems: SystemSummary[];
  example: ExamplePack | null;
  roles: RoleInfo[];
  charged_by_hardware_set: Record<string, string>;
  packs: Pack[];
  brands: Brand[];
}

export interface RoleProfile {
  id: number;
  profile_code: string;
  profile_name: string;
  kg_meter: number | null;
  /** null: bought the company's way (`settings.profile_rate_basis`). */
  charge_basis: 'per_kg' | 'per_m' | null;
  rate_meter: number | null;
  /** The bar as it is bought, in mm (5800). Kept and shown; no price reads it. */
  bar_length_mm?: number | null;
}

export interface SystemRole extends RoleInfo {
  required: boolean;
  profile: RoleProfile | null;
}

export interface SystemRule {
  key: string;
  label: string;
  /** mm, deg, flag (0 / 1), count, kg. */
  unit: string;
  group: string;
  default: number | null;
  value: number | null;
  is_set: boolean;
  /** true: copied from a pack, not yet the company's own figure. */
  is_placeholder: boolean | null;
  source: string | null;
  notes: string | null;
}

export interface SystemRow {
  id: number;
  name: string;
  series: string | null;
  category: string;
  system_depth_mm: number | null;
  notes: string | null;
  is_verified: boolean;
  retired_at: string | null;
}

/** GET pricing-setup/systems/{id}, and the answer of every change to a system. */
export interface SystemDetail {
  system: SystemRow;
  kind: string;
  retired: boolean;
  ready: boolean;
  missing: Missing[];
  settings_ready: boolean;
  hardware_set: SetRef | null;
  trials: Trial[];
  roles: SystemRole[];
  rule_groups: Record<string, string>;
  rules: SystemRule[];
  rule_templates: { code: string; name: string }[];
  /** Only after a pack of rules was copied in. */
  template_added?: string[];
  /** Only in the answer of a copy: what came over, and the new code of each profile. */
  copied?: { from: number; profiles: number; rules: number; codes: Record<string, string> };
}

/** One line of PUT pricing-setup/systems/{id}/roles. */
export interface RoleChange {
  role: string;
  product_id: number | null;
  kg_meter?: number;
  charge_basis?: 'per_kg' | 'per_m' | null;
  rate_meter?: number;
  bar_length_mm?: number | null;
}

export interface SystemBody {
  name: string;
  category: string;
  system_depth_mm: number;
  series?: string | null;
  notes?: string | null;
}

/** A profile of the catalogue as `product/{id}` holds it. */
export interface ProductRow {
  id: number;
  category: string;
  profile_code: string;
  profile_name: string;
  kg_meter: number;
  rate_meter: number;
  rate_bar: number;
  kg_meter_color: number;
  rate_meter_color: number;
  rate_bar_color: number;
  profile_system_id: number | null;
  role: string | null;
  face_width_mm: number | null;
  profile_depth_mm: number | null;
  rebate_mm: number | null;
  sightline_mm: number | null;
  bar_length_mm?: number | null;
  [key: string]: unknown;
}

export type SettingValue = number | string | null;

export interface GlassRow {
  id: number;
  name: string;
  rate: number;
  unit: string;
  glass_mm: number | null;
}

export interface ColourRow {
  id: number;
  name: string;
  rate_kg: number | null;
}

/** GET / PUT pricing-setup/settings. */
export interface Figures {
  settings: Record<string, SettingValue>;
  set_by_company: string[];
  defaults: Record<string, SettingValue>;
  labels: Record<string, { label: string; unit: string }>;
  missing: Missing[];
  glass: GlassRow[];
  colours: ColourRow[];
  /** The profiles that hold a role in a system in use (api T187). */
  profiles: RateProfile[];
}

export interface RateProfile extends RoleProfile {
  profile_system_id: number;
  role: string;
  role_label: string;
}

export interface FiguresBody {
  settings?: Record<string, SettingValue>;
  /** `rate` alone leaves the thickness as it is. */
  glass?: { id: number; glass_mm?: number | null; rate?: number }[];
  colours?: { id: number; rate_kg: number | null }[];
  /** A profile at its own rate per metre; `charge_basis` null: the company's way again. */
  profiles?: { id: number; charge_basis: 'per_m' | null; rate_meter?: number }[];
  /** The price of a hardware item (a cost head that is not a glass). */
  items?: { id: number; rate: number }[];
}

/** PUT pricing-setup/method. */
export interface MethodAnswer {
  method: string;
  changed: boolean;
  saved_lines: Record<string, number>;
  notes: string[];
}

export interface HardwareSet {
  id: number;
  code: string;
  name: string;
  brand: string | null;
  category: string;
  profile_system_id: number | null;
  rebate_offset_mm: number | null;
  is_default: boolean;
  is_verified: boolean;
  source: string | null;
  rules_count: number;
  /** Items with no cost head: a window that needs one is refused. */
  unmatched: string[];
  /** Items whose cost head costs 0. */
  unpriced: string[];
}

export interface HardwarePack {
  code: string;
  what: string;
  imported: boolean;
}

/** GET hardware-sets. */
export interface HardwareSets {
  sets: HardwareSet[];
  packs: HardwarePack[];
  categories: string[];
}

/** One line of a hardware set: which item, for which opening, and how many. */
export interface HardwareRule {
  id: number;
  hardware_set_id: number;
  priority: number | null;
  kind: string | null;
  role: string;
  scope: string;
  applies_opening: string | null;
  applies_leaf: string | null;
  band_on: string | null;
  band_min_mm: number | null;
  band_max_mm: number | null;
  weight_min_kg: number | null;
  weight_max_kg: number | null;
  costhead_id: number | null;
  item_name: string;
  qty_formula: string | null;
  qty_factor: string | number | null;
  qty_min: number | null;
  step_mm: number | null;
  measure: string | null;
  source_note: string | null;
  costhead: { id: number; name: string; cost: number; unit: string } | null;
  [key: string]: unknown;
}

/** GET hardware-sets/{id}, and the answer of every change to a set or its lines. */
export interface HardwareSetDetail {
  set: HardwareSet;
  rules: HardwareRule[];
  created?: boolean;
  rule_id?: number;
}

export interface CostHead {
  id: number;
  name: string;
  cost: number;
  unit: string;
  costhead: string;
}

/** The api's "no", in its own words: one sentence for the form and one for each thing it named. */
export class SetupRefusal extends Error {
  constructor(message: string, readonly errors: string[] = [], readonly code = '', readonly status = 0, readonly data: any = null) {
    super(message);
  }
}

/**
 * The refusals that belong to one row. The api starts a sentence with the label of
 * what it is about ("Opening sash: the weight per metre must be ..."), or names it inside.
 */
export function refusalsFor(errors: string[], label: string): string[] {
  const name = (label || '').trim().toLowerCase();
  if (!name) return [];
  return errors.filter((sentence) => {
    const text = sentence.toLowerCase();
    return text.startsWith(name + ':') || text.includes(`'${name}'`) || text.includes(`"${name}"`);
  });
}

/** The refusals no row took: shown once, at the foot of the form. */
export function refusalsLeft(errors: string[], labels: string[]): string[] {
  const taken = new Set(labels.flatMap((label) => refusalsFor(errors, label)));
  return errors.filter((sentence) => !taken.has(sentence));
}

/** What is typed in a number box, as the api takes it: empty = null. NaN when it is not a number. */
export function typedNumber(value: unknown): number | null {
  const text = String(value ?? '').trim();
  return text === '' ? null : Number(text);
}

/** What a box holds, as text. A number box hands Angular a number, not a string. */
export function typedText(value: unknown): string {
  return String(value ?? '').trim();
}

export function shownNumber(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** "casement" → "Casement". */
export function words(key: string): string {
  const text = String(key ?? '').replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One window of GET pricing-setup/compare priced by one method: the line total, or the sentence of the refusal. */
export interface ComparedPrice {
  method: string;
  priced: boolean;
  total: number | null;
  reason: string | null;
  /** Where a refusal is fixed: the query string of /pricing-setup; null when nothing there fixes it. */
  place?: Record<string, string | number> | null;
  /** The bill of materials of one window in short (the new method only). */
  bom?: BomShort;
}

export interface BomShort {
  profiles: { role: string; code: string; name: string; metres: number; kg: number; amount: number }[];
  glass: { name: string; qty: number; unit: string; amount: number }[];
  hardware_set: SetRef | null;
  hardware: { items: number; amount: number };
  figures: Record<string, number | null>;
  totals: { material: number; labour: number; overhead: number; installation: number; cost: number };
  warnings: string[];
  /** T202: the parts this window is priced without (a rule or a profile the system lacks), in the api's sentences. */
  priced_without?: string[];
}

export interface ComparedWindow {
  line_id: number;
  quotation_id: number;
  quotation_number: string | null;
  label: string | null;
  description: string;
  width: number;
  height: number;
  quantity: number;
  stored: { method: string; total: number };
  old: ComparedPrice;
  new: ComparedPrice;
  /** The saved profile is in no system: the new price is that of the same window built from this one. */
  compared_as?: { id: number; name: string } | null;
  difference: number | null;
}

/** GET pricing-setup/compare: the company's own saved windows under both methods. The totals add the windows both price. */
export interface Comparison {
  method: string;
  scope: { limit: number; quotation_id: number | null; as_system_id?: number | null };
  totals: { windows: number; compared: number; not_priced: number; old: number; new: number; difference: number; priced_without?: { text: string; windows: number }[] };
  windows: ComparedWindow[];
}
