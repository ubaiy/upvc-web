import {
  DOCUMENTS,
  fileName,
  fileNameFromHeader,
  plainWarnings,
  previewPage,
  summarise,
  toJobResult,
} from './production.adapter';
import { ProductionJob } from './production.model';

export const JOB: ProductionJob = {
  id: 1,
  quatation_id: 14,
  number: 'Q-0003/P1',
  revision: 1,
  latest_revision: 1,
  frozen_at: '2026-10-04T18:24:36+00:00',
  is_stale: false,
  verified: false,
  banner: 'Sizes not verified against the supplier manual',
  quotation: { id: 14, number: 'Q-0003', name: 'Al-Rashid Villa Windows', status: 'draft' },
  customer: { name: 'Ahmed Al-Rashid' },
  job: { frozen_by: 'Tester' },
  window_count: 3,
  unit_count: 3,
  totals: {
    profiles: [
      { profile_id: 26, profile_code: 'P60-K-X-R', profile_name: 'Outer Frame', colour: 'Default', pieces: 4, length_mm: 6024, length_m: 6.024 },
      { profile_id: 27, profile_code: 'P60-WKS-R', profile_name: 'Outward Sash', colour: 'Default', pieces: 8, length_mm: 11496, length_m: 11.496 },
    ],
    reinforcement: [
      { profile_id: null, profile_code: null, profile_name: 'GI Reinforcement', pieces: 4, length_mm: 5460, length_m: 5.46 },
    ],
    glass: [{ spec_id: 1, spec: '5mm plain glass', panes: 3, area_sqm: 4.9336 }],
    hardware: [
      { item_id: 29, name: '8x80 Fastner', group: 'Screw', unit: 'nos', supplier: null, qty: 24 },
      { item_id: 40, name: 'Handle', group: 'Handle', unit: 'nos', supplier: null, qty: 2 },
    ],
    gasket_mm: { glazing: 32016, sash: 22896 },
  },
  warnings: [],
};

describe('production adapter', () => {
  it('lists the four workshop documents in the order of the pack', () => {
    expect(DOCUMENTS.map((doc) => doc.type)).toEqual(['cutting-list', 'glass-order', 'hardware-order', 'sheet']);
  });

  it('names a file the way the api does', () => {
    expect(fileName(JOB, 'cutting-list', 'pdf')).toBe('Cutting-list-Q-0003-P1.pdf');
    expect(fileName(JOB, 'sheet', 'xlsx')).toBe('Production-sheets-Q-0003-P1.xlsx');
    expect(fileName({ ...JOB, revision: 2 }, 'pack', 'pdf')).toBe('Production-pack-Q-0003-P2.pdf');
  });

  it('reads the file name from Content-Disposition', () => {
    expect(fileNameFromHeader('attachment; filename="Glass-order-Q-0003-P1.pdf"')).toBe('Glass-order-Q-0003-P1.pdf');
    expect(fileNameFromHeader("attachment; filename*=UTF-8''Glass%20order.pdf")).toBe('Glass order.pdf');
    expect(fileNameFromHeader('inline')).toBeNull();
    expect(fileNameFromHeader(null)).toBeNull();
  });

  it('sorts a job answer into job, no job, no windows or a refusal', () => {
    expect(toJobResult({ success: true, data: JOB }).kind).toBe('job');
    expect(toJobResult({ status: 0, message: 'This quatation has no production job yet; create one first' }).kind).toBe('no-job');
    expect(
      toJobResult({ status: 0, message: 'Quatation has no windows; add a window before making a production job' }).kind
    ).toBe('no-windows');
    expect(toJobResult({ status: 0, message: 'revision must be a whole number' })).toEqual({
      kind: 'refused',
      message: 'revision must be a whole number',
    });
    expect(toJobResult({ status: 0, message: 'Invalid quatation id' })).toEqual({
      kind: 'refused',
      message: 'This quotation was not found. It may have been deleted.',
    });
    expect(toJobResult(null).kind).toBe('refused');
  });

  it('adds up the totals the api sent, and nothing else', () => {
    const summary = summarise(JOB);
    expect(summary.profileMetres).toBeCloseTo(17.52, 3);
    expect(summary.profilePieces).toBe(12);
    expect(summary.steelMetres).toBeCloseTo(5.46, 3);
    expect(summary.glassArea).toBeCloseTo(4.9336, 4);
    expect(summary.glassPanes).toBe(3);
    expect(summary.hardwareItems).toBe(2);
  });

  it('gives zeros for a job with no totals', () => {
    expect(summarise({ ...JOB, totals: undefined as any })).toEqual({
      profileMetres: 0,
      profilePieces: 0,
      steelMetres: 0,
      glassArea: 0,
      glassPanes: 0,
      hardwareItems: 0,
    });
  });

  it('gives the preview a screen margin without touching the document', () => {
    const page = previewPage('<html><head><title>Cutting list</title></head><body><p>W1</p></body></html>');
    expect(page).toContain('@media screen');
    expect(page.indexOf('@media screen')).toBeLessThan(page.indexOf('</head>'));
    expect(page).toContain('<body><p>W1</p></body>');
    expect(previewPage('<p>bare</p>')).toContain('<p>bare</p>');
  });

  describe('plainWarnings', () => {
    const all = ['W1', 'W2', 'W3'];

    it('folds every missing rule of the same windows into one line with the values used', () => {
      const lines = plainWarnings(
        [
          { message: "Rule 'sash_deduction_per_side' missing from profile-system rules; falling back to default 13 mm.", windows: all },
          { message: "Rule 'glass_edge_clearance' missing from profile-system rules; falling back to default 5 mm.", windows: all },
        ],
        3
      );
      expect(lines.length).toBe(1);
      expect(lines[0].text).toContain('2 values are missing');
      expect(lines[0].text).toContain('sash deduction per side 13 mm, glass edge clearance 5 mm');
      expect(lines[0].windows).toBe('All windows');
    });

    it('says a missing profile in workshop words, with no engine names', () => {
      const lines = plainWarnings(
        [
          { message: "Profile role 'frame' not found in system 'unknown'; using 60 mm face-width zero-cost placeholder.", windows: ['W1'] },
          { message: "No profile with role 'bead' in the system; bead pieces carry profile_id 0.", windows: ['W1'] },
          { message: "No profile with role 'sash_reinforcement' or 'reinforcement' in the system; steel pieces carry profile_id 0.", windows: ['W2', 'W3'] },
          {
            message:
              'Sizes were calculated when the job was frozen, not when the window was saved (product has no profile_system_id), with default rules: the product is not linked to a profile system.',
            windows: all,
          },
        ],
        3
      );
      expect(lines[0].text).toBe('No frame profile is set for this product, so a 60 mm face width was assumed.');
      expect(lines[1].text).toContain('No glazing bead profile is in the catalogue');
      expect(lines[2].text).toContain('sash steel reinforcement');
      expect(lines[2].windows).toBe('W2, W3');
      expect(lines[3].text).toContain('not linked to a profile system');
      for (const line of lines) {
        expect(line.text).not.toMatch(/profile_id|profile_system_id|placeholder|zero-cost/);
      }
    });

    it('says the same thing once, for all the windows it applies to', () => {
      const lines = plainWarnings(
        [
          { message: 'Sizes were calculated when the job was frozen, not when the window was saved (one reason).', windows: ['W1'] },
          { message: 'Sizes were calculated when the job was frozen, not when the window was saved (another reason).', windows: ['W2', 'W3'] },
        ],
        3
      );
      expect(lines.length).toBe(1);
      expect(lines[0].windows).toBe('All windows');
    });

    it('keeps a message it does not know as the engine wrote it', () => {
      expect(plainWarnings([{ message: 'Bars in both directions are sized as an even grid.', windows: ['W2'] }], 3)).toEqual([
        { text: 'Bars in both directions are sized as an even grid.', windows: 'W2' },
      ]);
    });

    it('names the one window of a one-window job, and survives an empty list', () => {
      expect(plainWarnings([{ message: 'Something to check.', windows: ['W1'] }], 1)[0].windows).toBe('W1');
      expect(plainWarnings(null)).toEqual([]);
      expect(plainWarnings([{ message: '  ', windows: [] }])).toEqual([]);
    });
  });
});
