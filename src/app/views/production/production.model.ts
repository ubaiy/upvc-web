/**
 * The production job as `production/job/{quatation_id}` returns it
 * (docs/review/phase-14-production-pack-log.md, section 2). Only the fields
 * the Production page reads are typed; the window parts stay on the api's
 * documents.
 */

/** The four workshop documents. `pack` is all four in one PDF. */
export type DocumentType = 'cutting-list' | 'glass-order' | 'hardware-order' | 'sheet';
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
  totals: {
    profiles: ProfileTotal[];
    reinforcement: ProfileTotal[];
    glass: GlassTotal[];
    hardware: HardwareTotal[];
    gasket_mm?: { glazing: number; sash: number };
  };
  warnings: JobWarning[];
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
