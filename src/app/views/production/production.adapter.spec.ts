import {
  DOCUMENTS,
  assumedLine,
  barRule,
  barSettingsMessage,
  barTotals,
  barsStat,
  fileName,
  fileNameFromHeader,
  plainWarnings,
  previewPage,
  structureRows,
  summarise,
  toBarSettingsAnswer,
  toJobResult,
  tooLongNote,
} from './production.adapter';
import { BarPlan, ProductionJob } from './production.model';

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

/** A bar plan as the api sends it (card P6): the sums add up, as the api's do. */
export const BAR_PLAN: BarPlan = {
  settings: { bar_mm: 5800, blade_mm: 6, end_trim_mm: 20, min_offcut_mm: 500 },
  standard: false,
  sections: [
    {
      code: 'P60-K-X-R', name: 'Outer Frame', colour: 'Default', steel: false, profile_id: 26,
      bar_mm: 5800, bar_assumed: false, bars: 3, pieces: 4,
      bought_m: 17.4, cut_m: 6.024, blade_m: 0.024, trim_m: 0.12, scrap_m: 0.332, offcut_m: 10.9,
      offcuts: 2, offcut_sizes: [{ mm: 5450, count: 2 }], waste_m: 0.476, waste_pct: 2.7,
    },
    {
      code: 'P60-WKS-R', name: 'Outward Sash', colour: 'Default', steel: false, profile_id: 27,
      bar_mm: 5800, bar_assumed: false, bars: 5, pieces: 8,
      bought_m: 29, cut_m: 11.496, blade_m: 0.048, trim_m: 0.2, scrap_m: 0.056, offcut_m: 17.2,
      offcuts: 4, offcut_sizes: [{ mm: 4300, count: 4 }], waste_m: 0.304, waste_pct: 1,
    },
    {
      code: null, name: 'GI Reinforcement', colour: null, steel: true, profile_id: null,
      bar_mm: 5800, bar_assumed: false, bars: 1, pieces: 4,
      bought_m: 5.8, cut_m: 5.46, blade_m: 0.024, trim_m: 0.04, scrap_m: 0.276, offcut_m: 0,
      offcuts: 0, offcut_sizes: [], waste_m: 0.34, waste_pct: 5.9,
    },
  ],
  totals: {
    profile: { bars: 8, pieces: 12, bought_m: 46.4, cut_m: 17.52, offcut_m: 28.1, offcuts: 6, waste_m: 0.78, waste_pct: 1.7 },
    steel: { bars: 1, pieces: 4, bought_m: 5.8, cut_m: 5.46, offcut_m: 0, offcuts: 0, waste_m: 0.34, waste_pct: 5.9 },
  },
  assumed: [],
  too_long: 0,
};

describe('production adapter', () => {
  it('lists the five workshop documents in the order of the pack, the bar plan after the cutting list', () => {
    expect(DOCUMENTS.map((doc) => doc.type)).toEqual(['cutting-list', 'bar-plan', 'glass-order', 'hardware-order', 'sheet']);
    const plan = DOCUMENTS[1];
    expect(plan.title).toBe('Bar plan');
    expect(plan.text).toBe('For buying and the saw: bars to order, the cuts on each bar, offcuts and waste.');
    expect(DOCUMENTS.map((doc) => doc.icon).filter((icon, i, all) => all.indexOf(icon) === i).length).withContext('five different icons').toBe(5);
  });

  it('names a file the way the api does', () => {
    expect(fileName(JOB, 'bar-plan', 'pdf')).toBe('Bar-plan-Q-0003-P1.pdf');
    expect(fileName({ ...JOB, revision: 3 }, 'bar-plan', 'xlsx')).toBe('Bar-plan-Q-0003-P3.xlsx');
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
      bars: 0,
      steelBars: 0,
      wastePct: 0,
      offcuts: 0,
    });
  });

  describe('bar plan (card P6)', () => {
    it('takes the bars, steel bars, waste and offcuts from the totals the api sent', () => {
      const summary = summarise({ ...JOB, bar_plan: BAR_PLAN });
      expect(summary.bars).toBe(8);
      expect(summary.steelBars).toBe(1);
      expect(summary.wastePct).toBe(1.7);
      expect(summary.offcuts).toBe(6);
    });

    it('gives zeros for a job from an api that sends no bar plan, and for a plan with no totals', () => {
      const none = { bars: 0, steelBars: 0, wastePct: 0, offcuts: 0 };
      expect(summarise(JOB)).toEqual(jasmine.objectContaining(none));
      expect(summarise({ ...JOB, bar_plan: { ...BAR_PLAN, totals: undefined as any } })).toEqual(jasmine.objectContaining(none));
      expect(summarise({ ...JOB, bar_plan: { ...BAR_PLAN, totals: { profile: BAR_PLAN.totals.profile } as any } }).steelBars).toBe(0);
    });

    it('words the stat: bars, then the steel bars and the waste', () => {
      expect(barsStat(summarise({ ...JOB, bar_plan: BAR_PLAN }))).toEqual({ value: '8 bars', detail: 'plus 1 steel bar, 1.7% waste' });
      const many = { ...BAR_PLAN, totals: { profile: { ...BAR_PLAN.totals.profile, bars: 42, waste_pct: 4.2 }, steel: { ...BAR_PLAN.totals.steel, bars: 12 } } };
      expect(barsStat(summarise({ ...JOB, bar_plan: many }))).toEqual({ value: '42 bars', detail: 'plus 12 steel bars, 4.2% waste' });
      const one = { ...BAR_PLAN, totals: { profile: { ...BAR_PLAN.totals.profile, bars: 1, waste_pct: 0 }, steel: { ...BAR_PLAN.totals.steel, bars: 0 } } };
      expect(barsStat(summarise({ ...JOB, bar_plan: one }))).toEqual({ value: '1 bar', detail: '0% waste' });
    });

    it('has a sum row for the profiles and one for the steel, as the api totals them', () => {
      expect(barTotals(BAR_PLAN)).toEqual([
        { label: 'Profile total', bars: 8, offcuts: 6, waste_pct: 1.7 },
        { label: 'Steel total', bars: 1, offcuts: 0, waste_pct: 5.9 },
      ]);
      const profilesOnly = { ...BAR_PLAN, sections: BAR_PLAN.sections.filter((section) => !section.steel) };
      expect(barTotals(profilesOnly)).toEqual([{ label: 'Total', bars: 8, offcuts: 6, waste_pct: 1.7 }]);
      const steelOnly = { ...BAR_PLAN, sections: BAR_PLAN.sections.filter((section) => section.steel) };
      expect(barTotals(steelOnly)).toEqual([{ label: 'Total', bars: 1, offcuts: 0, waste_pct: 5.9 }]);
      expect(barTotals({ ...BAR_PLAN, sections: [] })).toEqual([]);
    });

    it('says the rule the bars were worked out with', () => {
      expect(barRule(BAR_PLAN.settings)).toBe('Blade 6 mm · 20 mm trimmed from each end · offcuts from 500 mm kept, not counted as waste');
      expect(barRule({ bar_mm: 5800, blade_mm: 5.7, end_trim_mm: 0, min_offcut_mm: 0 })).toBe(
        'Blade 5.7 mm · 0 mm trimmed from each end · offcuts from 0 mm kept, not counted as waste'
      );
    });

    it('names the profiles with no bar length of their own, and the length used', () => {
      expect(assumedLine(BAR_PLAN)).toBe('');
      expect(assumedLine({ ...BAR_PLAN, assumed: ['OLD-F · Old Frame', 'GI Reinforcement'] })).toBe(
        'No bar length is set for OLD-F · Old Frame; GI Reinforcement. 5800 mm was used.'
      );
      const none = BAR_PLAN.sections.map((section) => ({ ...section, bar_assumed: true }));
      expect(assumedLine({ ...BAR_PLAN, sections: none, assumed: ['OLD-F · Old Frame', 'OLD-B · Old Bead'] })).toBe(
        'No profile has its own bar length, so 5800 mm was used for all of them. Set it on a profile in the Catalogue, or change it in Bar settings.'
      );
    });

    it('names the pieces that are longer than the bar, from the sections', () => {
      expect(tooLongNote(BAR_PLAN)).toBe('');
      const long = {
        ...BAR_PLAN,
        too_long: 3,
        sections: [
          { ...BAR_PLAN.sections[0], too_long: [{ mm: 6200, code: 'W1', window: 'Hall', part: 'frame', qty: 1 }, { mm: 6400, code: 'W3', window: 'Hall', part: 'bead', qty: 2 }] },
          BAR_PLAN.sections[1],
        ],
      };
      expect(tooLongNote(long)).toBe(
        '3 pieces are longer than the bar and are not in this plan: W1 frame 6200 mm, W3 glazing bead 6400 mm × 2.'
      );
      expect(tooLongNote({ ...BAR_PLAN, too_long: 1 })).toBe('1 piece is longer than the bar and is not in this plan.');
    });
  });

  describe('bar settings (card P6)', () => {
    const answer = {
      settings: { bar_mm: 6000, blade_mm: 5.7, end_trim_mm: 25, min_offcut_mm: 400 },
      defaults: { bar_mm: 5800, blade_mm: 6, end_trim_mm: 20, min_offcut_mm: 500 },
    };

    it('reads the settings and the standard values, as numbers', () => {
      expect(toBarSettingsAnswer({ settings: { bar_mm: '6000', blade_mm: '5.7', end_trim_mm: 25, min_offcut_mm: 400 }, defaults: answer.defaults })).toEqual(answer);
    });

    it('keeps the steel bar length, as a number', () => {
      const read = toBarSettingsAnswer({ settings: { ...answer.settings, steel_bar_mm: '6100' }, defaults: { ...answer.defaults, steel_bar_mm: 6000 } })!;
      expect(read.settings.steel_bar_mm).toBe(6100);
      expect(read.defaults!.steel_bar_mm).toBe(6000);
    });

    it('refuses an answer without settings', () => {
      expect(toBarSettingsAnswer({ defaults: answer.defaults })).toBeNull();
      expect(toBarSettingsAnswer(null)).toBeNull();
      expect(toBarSettingsAnswer({ settings: { bar_mm: 'x' } })).toBeNull();
    });

    it('has no standard values when the api sends none', () => {
      expect(toBarSettingsAnswer({ settings: answer.settings })!.defaults).toBeNull();
    });

    it("gives the api's own sentence for a refusal, the connection for no answer, else the fallback", () => {
      const fallback = 'The settings could not be saved.';
      expect(barSettingsMessage({ status: 422, error: { message: 'The bar must be 500 to 20000 mm. The blade must be 0 to 20 mm.', data: { errors: ['a', 'b'] } } }, fallback)).toBe(
        'The bar must be 500 to 20000 mm. The blade must be 0 to 20 mm.'
      );
      expect(barSettingsMessage({ status: 422, error: { data: { errors: ['The blade must be 0 to 20 mm.', 'The end trim must be 0 to 200 mm.'] } } }, fallback)).toBe(
        'The blade must be 0 to 20 mm. The end trim must be 0 to 200 mm.'
      );
      expect(barSettingsMessage({ status: 0 }, fallback)).toBe('We could not reach the server. Check your connection.');
      expect(barSettingsMessage({ status: 500, error: {} }, fallback)).toBe(fallback);
      expect(barSettingsMessage(new Error('The settings came back empty.'), fallback)).toBe('The settings came back empty.');
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

  describe('3D structures of a job (T123)', () => {
    it('lists each with its code, name, type, overall size, panels and the note the api sends', () => {
      const rows = structureRows([
        {
          line_id: 161,
          code: 'S2',
          name: 'Balcony cabin',
          type: 'cabin',
          label: null,
          quantity: 1,
          overall: { widthMm: 3600, depthMm: 2400, heightMm: 2700 },
          note: 'Geometric sizes, not workshop cut sizes.',
          panel_count: 20,
          glass_area_sq_m: 41.04,
        },
        { line_id: 162, type: null, name: null, quantity: null, overall: null },
      ]);
      expect(rows).toEqual([
        {
          id: 161,
          code: 'S2',
          name: 'Balcony cabin · Cabin',
          size: '3600 × 2400 × 2700 mm (width × depth × height)',
          detail: '20 panels · 41.04 sq m of glass',
          quantity: 1,
          note: 'Geometric sizes, not workshop cut sizes.',
        },
        { id: 162, code: '', name: '3D structure 2', size: '', detail: '', quantity: 1, note: '' },
      ]);
    });

    it('is empty for a job of windows only and for an older api', () => {
      expect(structureRows(undefined)).toEqual([]);
      expect(structureRows(null)).toEqual([]);
      expect(structureRows([])).toEqual([]);
    });
  });
});
