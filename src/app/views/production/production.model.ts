/**
 * The production job as `production/job/{quatation_id}` returns it
 * (docs/review/phase-14-production-pack-log.md, section 2). Only the fields
 * the Production page reads are typed; the window parts stay on the api's
 * documents.
 */

/** The five workshop documents. `pack` is all of them in one PDF. */
export type DocumentType = 'cutting-list' | 'bar-plan' | 'glass-order' | 'hardware-order' | 'sheet';
export type DocumentFormat = 'pdf' | 'html' | 'xlsx';

export interface ProfileTotal {
  profile_id: number | null;
  profile_code: string | null;
  profile_name: string;
  colour?: string | null;
  pieces: number;
  length_mm: number;
  length_m: number;
}

export interface GlassTotal {
  spec_id: number | null;
  spec: string;
  panes: number;
  area_sqm: number;
}

export interface HardwareTotal {
  item_id: number | null;
  name: string;
  group: string | null;
  unit: string | null;
  supplier: string | null;
  qty: number;
}

export interface JobWarning {
  message: string;
  windows: string[];
}

/**
 * One line of "Check before cutting", worded by the api (phase 30 log,
 * section 2). `where` names the api field behind the note, never a screen.
 */
export interface JobNote {
  code: string;
  text: string;
  windows: string[];
  where?: unknown;
}

export interface ProductionJob {
  id: number;
  quatation_id: number;
  /** Job number, for example "Q-0003/P1". */
  number: string;
  revision: number;
  latest_revision: number;
  frozen_at: string;
  /** A window was added, removed or saved again after the freeze. */
  is_stale: boolean;
  verified: boolean;
  /** The text to show above the documents, or null. Decided by the api. */
  banner: string | null;
  quotation: { id: number; number: string; name: string | null; status?: string; date?: string };
  customer: { name: string | null; phone?: string | null } | null;
  job?: { frozen_by?: string | null };
  window_count: number;
  unit_count: number;
  /** The 3D structures of the quotation (card T123): geometric sizes, not cut sizes. Absent from an older api. */
  structures?: JobStructure[];
  totals: {
    profiles: ProfileTotal[];
    reinforcement: ProfileTotal[];
    glass: GlassTotal[];
    hardware: HardwareTotal[];
    gasket_mm?: { glazing: number; sash: number };
  };
  warnings: JobWarning[];
  /** The same things to check, in the api's own plain words. Shown as sent; `warnings` is the older raw form. */
  notes?: JobNote[];
  /** The bars to buy and the waste (card P6), without the cut patterns. Absent from an older api. */
  bar_plan?: BarPlan;
}

/** The four numbers of Bar settings, as the api names them. */
export interface BarSettings {
  /** Bar length for a profile that has none of its own. */
  bar_mm: number;
  /** The same for steel reinforcement. Absent from a job made before it existed. */
  steel_bar_mm?: number;
  /** What one cut takes out of the bar. */
  blade_mm: number;
  /** Trimmed from each end of a bar. */
  end_trim_mm: number;
  /** A leftover this long or longer is kept as an offcut. */
  min_offcut_mm: number;
}

/** `data` of GET and POST production/bar-settings. */
export interface BarSettingsAnswer {
  settings: BarSettings;
  /** The standard values; null when an api sends none. */
  defaults: BarSettings | null;
}

/** A piece longer than the bar, left out of the plan. */
export interface BarTooLong {
  mm: number;
  /** The window's code, "W1". */
  code?: string | null;
  window?: string | null;
  part?: string | null;
  qty?: number;
}

/** One profile (or steel profile) of a colour in the bar plan. Metres are the api's. */
export interface BarSection {
  code: string | null;
  name: string;
  colour: string | null;
  steel: boolean;
  profile_id: number | null;
  bar_mm: number;
  /** The profile has no bar length of its own: the company's was used. */
  bar_assumed: boolean;
  bars: number;
  pieces: number;
  bought_m: number;
  cut_m: number;
  blade_m: number;
  trim_m: number;
  scrap_m: number;
  offcut_m: number;
  offcuts: number;
  offcut_sizes: { mm: number; count: number }[];
  waste_m: number;
  waste_pct: number;
  too_long?: BarTooLong[];
}

export interface BarTotals {
  bars: number;
  pieces: number;
  bought_m: number;
  cut_m: number;
  offcut_m: number;
  offcuts: number;
  waste_m: number;
  waste_pct: number;
}

/** The api's `bar_plan` for the web: the plan without its patterns. */
export interface BarPlan {
  settings: BarSettings;
  /** An old job: worked out with the standard values. */
  standard: boolean;
  sections: BarSection[];
  totals: { profile: BarTotals; steel: BarTotals };
  /** Profiles priced at the company's bar length, "OLD-F · Old Frame". */
  assumed: string[];
  /** How many pieces are longer than the bar. */
  too_long: number;
}

/** A 3D structure on the job, as the api lists it. */
export interface JobStructure {
  line_id: number;
  code?: string | null;
  name?: string | null;
  label?: string | null;
  type?: string | null;
  quantity?: number | null;
  overall?: { widthMm?: number; depthMm?: number; heightMm?: number } | null;
  /** The api's own sentence on what these sizes are. */
  note?: string | null;
  panel_count?: number | null;
  glass_area_sq_m?: number | null;
}

/** What a job call gave back: the job, or the api's reason for not giving one. */
export type JobResult =
  | { kind: 'job'; job: ProductionJob }
  | { kind: 'no-job' }
  | { kind: 'no-windows' }
  | { kind: 'refused'; message: string };

/** One file fetched from `production/document`. */
export interface DocumentFile {
  blob: Blob;
  /** From Content-Disposition when the browser may read it, else null. */
  fileName: string | null;
}
