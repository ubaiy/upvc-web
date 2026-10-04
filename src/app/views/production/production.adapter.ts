import { IconName } from '../../shared/components/icon/icon-paths';
import { DocumentFormat, DocumentType, JobResult, JobWarning, ProductionJob } from './production.model';

export { fileNameFromHeader } from '../../shared/class/download-file';

/** One workshop document as the page lists it. */
export interface DocumentCard {
  type: DocumentType;
  title: string;
  /** Who it is for, in one line. */
  text: string;
  icon: IconName;
}

export const DOCUMENTS: DocumentCard[] = [
  {
    type: 'cutting-list',
    title: 'Cutting list',
    text: 'For the saw: every piece by profile and colour, longest first.',
    icon: 'ruler',
  },
  {
    type: 'glass-order',
    title: 'Glass order',
    text: 'For the glass supplier: every pane size with its quantity and area.',
    icon: 'window',
  },
  {
    type: 'hardware-order',
    title: 'Hardware order',
    text: 'For the store or supplier: every item for the whole job.',
    icon: 'box',
  },
  {
    type: 'sheet',
    title: 'Production sheets',
    text: 'For the bench: one page per window with its drawing and parts.',
    icon: 'layers',
  },
];

/** File name stems the api uses in Content-Disposition. */
const FILE_STEM: Record<DocumentType | 'pack', string> = {
  'cutting-list': 'Cutting-list',
  'glass-order': 'Glass-order',
  'hardware-order': 'Hardware-order',
  sheet: 'Production-sheets',
  pack: 'Production-pack',
};

/**
 * The api's own file name ("Cutting-list-Q-0003-P1.pdf"), rebuilt for an
 * answer that carries no Content-Disposition.
 */
export function fileName(job: ProductionJob, type: DocumentType | 'pack', format: DocumentFormat): string {
  const number = (job.quotation?.number || 'job').replace(/[^A-Za-z0-9._-]+/g, '-');
  return `${FILE_STEM[type]}-${number}-P${job.revision}.${format}`;
}

/** Sorts a job answer into what the page shows. The wording is the api's (phase 14 log, "Refusals"). */
export function toJobResult(res: any): JobResult {
  if (res?.success && res.data) {
    return { kind: 'job', job: res.data as ProductionJob };
  }
  const message: string = res?.message || '';
  if (/no production job/i.test(message)) {
    return { kind: 'no-job' };
  }
  if (/has no windows/i.test(message)) {
    return { kind: 'no-windows' };
  }
  if (/invalid quatation id/i.test(message)) {
    return { kind: 'refused', message: 'This quotation was not found. It may have been deleted.' };
  }
  return { kind: 'refused', message: message || 'The production job could not be loaded.' };
}

/** Headline figures of the job. Sums of the api's own totals; nothing is re-measured. */
export interface JobSummary {
  profileMetres: number;
  profilePieces: number;
  steelMetres: number;
  glassArea: number;
  glassPanes: number;
  hardwareItems: number;
}

export function summarise(job: ProductionJob): JobSummary {
  const totals = job.totals || ({} as ProductionJob['totals']);
  const sum = <T>(rows: T[] | undefined, pick: (row: T) => number) =>
    (rows || []).reduce((total, row) => total + (Number(pick(row)) || 0), 0);
  return {
    profileMetres: sum(totals.profiles, (row) => row.length_m),
    profilePieces: sum(totals.profiles, (row) => row.pieces),
    steelMetres: sum(totals.reinforcement, (row) => row.length_m),
    glassArea: sum(totals.glass, (row) => row.area_sqm),
    glassPanes: sum(totals.glass, (row) => row.panes),
    hardwareItems: (totals.hardware || []).length,
  };
}

/** A warning in workshop words. */
export interface PlainWarning {
  text: string;
  /** "W1, W2", or "All windows". */
  windows: string;
}

/** Engine part names, as the workshop says them. */
const PART: Record<string, string> = {
  frame: 'frame',
  sash: 'sash',
  shutter: 'shutter',
  bead: 'glazing bead',
  mullion: 'mullion',
  transom: 'transom',
  reinforcement: 'steel reinforcement',
  frame_reinforcement: 'frame steel reinforcement',
  sash_reinforcement: 'sash steel reinforcement',
  shutter_reinforcement: 'shutter steel reinforcement',
};

/** Engine rule names, as the supplier manual says them. */
const RULE: Record<string, string> = {
  sash_deduction_per_side: 'sash deduction per side',
  glass_edge_clearance: 'glass edge clearance',
  bead_deduction: 'bead deduction',
  mullion_half_deduction: 'mullion deduction',
  transom_half_deduction: 'transom deduction',
  interlock_overlap: 'interlock overlap',
  frame_daylight_deduction: 'frame daylight deduction',
  track_height_clearance: 'track height clearance',
};

const words = (key: string, names: Record<string, string>) => names[key] || key.replace(/_/g, ' ');

/**
 * The engine's warnings in plain language, one line per thing to check.
 * Every "rule missing" message of the same windows becomes one line that
 * names the standard values used. A message this does not know is shown as
 * the engine wrote it, so nothing is hidden.
 */
export function plainWarnings(warnings: JobWarning[] | null | undefined, windowCount = 0): PlainWarning[] {
  const lines: PlainWarning[] = [];
  const rules = new Map<string, { windows: string; values: string[] }>();
  // Two engine messages can come to the same plain sentence: they are one line for all their windows.
  const byText = new Map<string, string[]>();
  const label = (codes: string[]) =>
    windowCount > 1 && codes.length >= windowCount ? 'All windows' : codes.join(', ');

  for (const warning of warnings || []) {
    const message = (warning?.message || '').trim();
    if (!message) {
      continue;
    }
    const codes = warning.windows || [];

    const rule = /^Rule '([^']+)' missing .*default ([\d.]+) ?mm/i.exec(message);
    if (rule) {
      const windows = label(codes);
      const group = rules.get(windows) || { windows, values: [] };
      group.values.push(`${words(rule[1], RULE)} ${rule[2]} mm`);
      rules.set(windows, group);
      continue;
    }

    const text = plainMessage(message);
    const known = byText.get(text) || [];
    byText.set(text, known.concat(codes.filter((code) => !known.includes(code))));
  }

  for (const [text, codes] of byText) {
    lines.push({ text, windows: label(codes) });
  }

  for (const group of rules.values()) {
    const count = group.values.length;
    lines.push({
      text:
        `${count} ${count === 1 ? 'value is' : 'values are'} missing from the profile system, ` +
        `so standard values were used: ${group.values.join(', ')}. Enter the supplier's values in the catalogue.`,
      windows: group.windows,
    });
  }
  return lines;
}

function plainMessage(message: string): string {
  if (/^Sizes were calculated when the job was frozen/i.test(message)) {
    return (
      'The product is not linked to a profile system, so sizes were worked out with standard values ' +
      'when the job was frozen. Check them against the supplier manual before cutting.'
    );
  }
  const role = /^Profile role '([^']+)' not found .*using (\d+) ?mm face-width/i.exec(message);
  if (role) {
    return `No ${words(role[1], PART)} profile is set for this product, so a ${role[2]} mm face width was assumed.`;
  }
  const none = /^No profile with role '([^']+)'/i.exec(message);
  if (none) {
    return `No ${words(none[1], PART)} profile is in the catalogue for this product, so those pieces are listed without a profile code.`;
  }
  return message;
}

/**
 * The api page is laid out for A4 paper, where the printer adds the margins.
 * On screen it gets a margin and the width of the sheet, so the preview reads
 * like the printed page. Nothing in the document itself is changed.
 */
const SCREEN_STYLE =
  '<style>@media screen { html { background: #fff; } body { max-width: 186mm; margin: 0 auto !important; padding: 16px; } }</style>';

export function previewPage(html: string): string {
  const head = /<\/head>/i;
  return head.test(html) ? html.replace(head, SCREEN_STYLE + '</head>') : SCREEN_STYLE + html;
}
