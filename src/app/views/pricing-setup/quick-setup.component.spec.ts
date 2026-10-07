import { ComponentFixture } from '@angular/core/testing';

import { Checklist, Figures, HardwareSet } from './pricing-setup.models';
import { FakeApi, button, checklist, comparison, figures, linkOf, meOf, mount, ok, OWNER, refused422, settle, toastOf, type } from './pricing-setup.testing';
import { QuickSetupComponent, choicesOf, groupsOf, itemsOf, ratesBody } from './quick-setup.component';

const SET: HardwareSet = {
  id: 3, code: 'RS-CAS-1', name: 'Casement, espagnolette + hinges', brand: null, category: 'casement', profile_system_id: null, rebate_offset_mm: 8,
  is_default: true, is_verified: false, source: null, rules_count: 3, unmatched: [], unpriced: ['Door shoot bolt'],
};

const RULES = [
  { id: 1, hardware_set_id: 3, item_name: 'Window hinge', qty_formula: 'fixed', qty_factor: '2.0000', step_mm: null, costhead: { id: 55, name: 'Window hinge', cost: 82.6, unit: 'Unit' } },
  { id: 2, hardware_set_id: 3, item_name: 'Window hinge', qty_formula: 'fixed', qty_factor: '3.0000', step_mm: null, costhead: { id: 55, name: 'Window hinge', cost: 82.6, unit: 'Unit' } },
  { id: 3, hardware_set_id: 3, item_name: 'Door shoot bolt', qty_formula: 'per_m', qty_factor: '1.0000', step_mm: null, costhead: { id: 56, name: 'Door shoot bolt', cost: 0, unit: 'Rmt' } },
];

/** A new company: the casement system of the pack is his and ready, the sliding one is offered, one system is his own. */
function lists(): { list: Checklist; rates: Figures } {
  const list = checklist({ ready: true, missing: [] });
  list.systems = [
    {
      id: 1, name: 'Generic 60 mm casement', category: 'Casement', kind: 'casement', retired: false, ready: true, missing: [], hardware_set: { id: 3, code: 'RS-CAS-1', name: 'Casement pack' },
      trials: [
        { window: 'A fixed window 1000 x 1200', width: 1000, height: 1200, priced: true, glass: 'Clear float glass 5 mm', cost: 3974.25, bom: comparison().windows[0].new.bom },
        { window: 'A side-hung window 600 x 1200', width: 600, height: 1200, priced: false, reason: 'no hinge fits a sash of 600 mm.' },
      ],
    },
    { id: 4, name: 'Alpha 60', category: 'Casement', kind: 'casement', retired: false, ready: false, missing: [{ code: 'role_empty', role: 'bead', text: 'No profile is given for the role Glazing bead.' }], hardware_set: null, trials: [] },
    { id: 9, name: 'Old 50 sliding', category: 'Sliding', kind: 'sliding', retired: true, ready: false, missing: [], hardware_set: null, trials: [] },
  ];
  list.packs = [
    { pack: 'Generic 60 mm casement', what: 'Casement windows and hinged doors, 60 mm', kind: 'casement', profiles: 8, system_id: 1 },
    { pack: 'Generic sliding 2 track', what: 'Sliding windows, 2 track', kind: 'sliding', profiles: 6, system_id: null },
  ];
  list.example = {
    pack: 'generic_india_60', name: 'Generic Indian uPVC', note: 'Example value: check it against your supplier before you send a price.', confidence: {},
    to_confirm: [
      { what: 'setting', key: 'profile_rate_kg', label: 'Profile rate kg', value: 140, confidence: '2+', flagged: false, stored: true },
      { what: 'setting', key: 'labour_rate', label: 'Labour rate', value: 25, confidence: 'rule', flagged: true, stored: true },
      { what: 'glass_rate', key: 'Clear float glass 5 mm', label: 'Clear float glass 5 mm', value: 50, confidence: '2+', flagged: false, stored: true },
      { what: 'hardware_price', key: 'Window hinge', label: 'Window hinge', value: 82.6, confidence: 'example', flagged: true, stored: true },
    ],
  };
  const rates = figures({
    settings: { profile_rate_kg: 140, steel_rate_kg: 90, labour_rate: 30, installation_rate: null },
    labels: {
      profile_rate_kg: { label: 'Profile rate, white', unit: 'INR per kg' },
      steel_rate_kg: { label: 'Steel rate', unit: 'INR per kg' },
      labour_rate: { label: 'Fabrication labour', unit: 'INR per sq ft' },
      installation_rate: { label: 'Installation labour', unit: 'INR per sq ft' },
    },
    missing: [],
    glass: [
      { id: 11, name: 'Clear float glass 5 mm', rate: 50, unit: 'Sq Ft', glass_mm: 5 },
      { id: 12, name: 'Old tinted glass', rate: 70, unit: 'Sq Ft', glass_mm: null },
    ],
    profiles: [
      { id: 31, profile_code: 'GEN-C60-FR', profile_name: 'Casement frame 60 / 60', kg_meter: 1.043, charge_basis: null, rate_meter: 0, profile_system_id: 1, role: 'frame', role_label: 'Outer frame' },
      { id: 32, profile_code: 'GEN-C60-BD', profile_name: 'Casement bead', kg_meter: 0.278, charge_basis: 'per_m', rate_meter: 38, profile_system_id: 1, role: 'bead', role_label: 'Glazing bead' },
    ],
  });
  return { list, rates };
}

describe('Pricing setup, the quick setup (T187)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<QuickSetupComponent>;
  let list: Checklist;
  let rates: Figures;
  const el = (): HTMLElement => fixture.nativeElement;
  const choice = (note: string): HTMLElement => el().querySelector(`[data-choice="${note}"]`)!;
  const tick = (note: string): HTMLInputElement => choice(note).querySelector('input[type="checkbox"]')!;
  const box = (selector: string): HTMLInputElement => el().querySelector(selector)!;
  const marked = (selector: string): boolean => !!el().querySelector(`${selector} [data-mark="example"]`);

  function routes(over: FakeApi['answer'] = () => undefined): void {
    api.answer = (c) =>
      over(c) ??
      (c.url === 'pricing-setup' ? ok(list) : c.url === 'pricing-setup/settings' ? ok(rates) : c.url === 'hardware-sets' ? ok({ sets: [SET, { ...SET, id: 5, code: 'MINE', is_default: false }], packs: [], categories: [] }) : c.url === 'hardware-sets/3' ? ok({ set: SET, rules: RULES }) : undefined);
  }

  beforeEach(async () => {
    api = new FakeApi();
    api.me = meOf(OWNER, { code: 'classic_example', example_rates: true, note: 'Example rates.' });
    ({ list, rates } = lists());
    routes();
    fixture = await mount(QuickSetupComponent, api);
  });

  it('the lines of step 1: the ready systems first, then the company\'s own', () => {
    expect(choicesOf(list).map((c) => [c.name, c.pack, c.system?.id ?? null])).toEqual([
      ['Casement windows and hinged doors, 60 mm', 'Generic 60 mm casement', 1],
      ['Sliding windows, 2 track', 'Generic sliding 2 track', null],
      ['Alpha 60', null, 4],
      ['Old 50 sliding', null, 9],
    ]);
  });

  it('is three steps on one page, read with three calls', () => {
    expect(api.sent).toEqual(['GET pricing-setup', 'GET pricing-setup/settings', 'GET hardware-sets']);
    expect(Array.from(el().querySelectorAll('h2')).map((h) => h.textContent)).toEqual(['1. Which systems do you sell?', '2. Your rates', '3. Check a window']);
    expect(el().querySelector('[data-setup="ready"]')!.textContent).toBe('Ready to price');
  });

  it('step 1: what is in use is ticked; a system that is not ready says how many things it misses, each with its link', () => {
    expect([tick('Generic 60 mm casement').checked, tick('Generic sliding 2 track').checked, tick('Casement').checked, tick('Sliding').checked]).toEqual([true, false, true, false]);
    expect(choice('Generic 60 mm casement').textContent).toContain('Ready');
    const alpha = choice('Casement');
    expect(alpha.querySelector('summary')!.textContent!.trim()).toBe('1 thing missing');
    expect(alpha.querySelector<HTMLDetailsElement>('details')!.open).toBe(false);
    expect(linkOf(alpha, 'Give the profile')).toContain('/pricing-setup?tab=systems&system=4&role=bead');
  });

  it('step 1: a tick takes a ready system (POST pricing-setup/packs), no tick retires one, a tick brings one back; the page is read again', async () => {
    api.calls = [];
    tick('Generic sliding 2 track').click();
    await settle(fixture);
    expect(api.bodyOf('post', 'pricing-setup/packs')).toEqual({ pack: 'Generic sliding 2 track' });
    expect(api.sent.slice(1)).toEqual(['GET pricing-setup', 'GET pricing-setup/settings', 'GET hardware-sets']);

    tick('Generic 60 mm casement').click();
    await settle(fixture);
    expect(api.bodyOf('post', 'pricing-setup/systems/1/retire')).toEqual({ retired: true });

    tick('Sliding').click();
    await settle(fixture);
    expect(api.bodyOf('post', 'pricing-setup/systems/9/retire')).toEqual({ retired: false });
  });

  it('step 1: a refusal is shown in the api\'s words', async () => {
    routes((c) => (c.url === 'pricing-setup/packs' ? refused422(['Your catalogue has GEN-S2-FR already (in use or deleted): the pack brings profiles of the same codes.']) : undefined));
    tick('Generic sliding 2 track').click();
    await settle(fixture);
    expect(el().querySelector('[data-setup="tick-error"]')!.textContent).toContain('Your catalogue has GEN-S2-FR already');
  });

  it('step 2: the four rates, the glass with a thickness, the rest folded; a figure still the pack\'s is marked "example"', () => {
    const rows = Array.from(el().querySelectorAll('[data-setup="rates"] tbody tr')).map((tr) => tr.querySelector('label')!.textContent!.trim());
    expect(rows).toEqual(['Profile rate, white', 'Steel rate', 'Fabrication labour', 'Installation labour', 'Glass: Clear float glass 5 mm']);
    expect(box('#q-profile_rate_kg').value).toBe('140');
    expect(box('#q-installation_rate').value).toBe('');
    expect(el().querySelector('[data-rate="profile_rate_kg"] .input-group')!.textContent).toContain('per kg');
    // 140 is the pack's figure; the labour rate was changed to 30, steel is not in the list.
    expect([marked('[data-rate="profile_rate_kg"]'), marked('[data-rate="labour_rate"]'), marked('[data-rate="steel_rate_kg"]'), marked('[data-glass="Clear float glass 5 mm"]')]).toEqual([true, false, false, true]);
    expect(el().querySelector('[data-setup="more-glass"] summary')!.textContent).toContain('Other glass (1)');
    expect(el().querySelector('[data-setup="own-rates"] summary')!.textContent).toContain('A profile at its own rate (1 of 2)');
    expect(el().querySelector<HTMLDetailsElement>('[data-setup="own-rates"]')!.open).toBe(false);
  });

  it('step 2: a hardware set is one closed line with its count of items without a price; opened, each item has its quantity and its price', async () => {
    const set = el().querySelector<HTMLDetailsElement>('[data-set="RS-CAS-1"]')!;
    expect(el().querySelectorAll('[data-set]').length).toBe(1);
    expect(set.querySelector('[data-mark="no-price"]')!.textContent).toBe('1 without a price');
    expect(api.sent).not.toContain('GET hardware-sets/3');

    set.open = true;
    set.dispatchEvent(new Event('toggle'));
    await settle(fixture);
    expect(itemsOf(RULES as any).map((i) => [i.name, i.counted])).toEqual([['Window hinge', '2 / 3'], ['Door shoot bolt', '1 per metre']]);
    const hinge = set.querySelector('[data-item="Window hinge"]')!;
    expect(hinge.textContent).toContain('Quantity: 2 / 3');
    expect(hinge.querySelector('[data-mark="example"]')).not.toBeNull();
    expect(hinge.querySelector<HTMLInputElement>('input')!.value).toBe('82.6');
    expect(set.querySelector('[data-item="Door shoot bolt"]')!.textContent).toContain('No price yet');
  });

  it('step 2: one save sends only what was changed, in one call, then the page is read again', async () => {
    const set = el().querySelector<HTMLDetailsElement>('[data-set="RS-CAS-1"]')!;
    set.open = true;
    set.dispatchEvent(new Event('toggle'));
    await settle(fixture);

    type(box('#q-profile_rate_kg'), '150');
    type(box('#q-installation_rate'), '40');
    type(box('#q-glass-11'), '60');
    type(box('[data-box="mm-12"]'), '6');
    type(box('[data-box="own-31"]'), '210');
    type(box('[data-box="own-32"]'), '');
    type(box('[data-box="item-3-56"]'), '120');
    api.calls = [];
    button(el(), 'Save my rates').click();
    await settle(fixture);

    expect(api.writes.length).toBe(1);
    expect(api.bodyOf('put', 'pricing-setup/settings')).toEqual({
      settings: { profile_rate_kg: 150, installation_rate: 40 },
      glass: [{ id: 11, rate: 60 }, { id: 12, glass_mm: 6 }],
      profiles: [{ id: 31, charge_basis: 'per_m', rate_meter: 210 }, { id: 32, charge_basis: null }],
      items: [{ id: 56, rate: 120 }],
    });
    expect(toastOf().showSuccess).toHaveBeenCalledWith('Your rates are saved');
    expect(api.sent).toContain('GET pricing-setup');
  });

  it('step 2: nothing changed sends nothing; a refusal shows each sentence', async () => {
    expect(ratesBody(rates, { profile_rate_kg: '140', steel_rate_kg: '90', labour_rate: '30', installation_rate: '' }, { 11: { rate: '50', mm: '5' }, 12: { rate: '70', mm: '' } }, { 31: '', 32: '38' })).toEqual({});
    api.calls = [];
    button(el(), 'Save my rates').click();
    await settle(fixture);
    expect(api.writes).toEqual([]);

    routes((c) => (c.verb === 'put' ? refused422(['Profile rate, white (profile_rate_kg) must be a number of 0 or more.']) : undefined));
    type(box('#q-profile_rate_kg'), '2000000');
    button(el(), 'Save my rates').click();
    await settle(fixture);
    expect(Array.from(el().querySelectorAll('[data-setup="rates-error"]')).map((p) => p.textContent)).toEqual(['Profile rate, white (profile_rate_kg) must be a number of 0 or more.']);
  });

  it('step 3: the trial windows of the systems in use with the cost the api gave; one opens into its bill of materials', () => {
    const trials = Array.from(el().querySelectorAll('[data-trial] summary')).map((s) => s.textContent!.replace(/\s+/g, ' ').trim());
    expect(trials).toEqual([
      'Generic 60 mm casement: A fixed window 1000 x 1200 with Clear float glass 5 mm costs ₹3,974.25',
      'Generic 60 mm casement: A side-hung window 600 x 1200 is not priced: no hinge fits a sash of 600 mm.',
    ]);
    const bom = el().querySelector('[data-trial="A fixed window 1000 x 1200"] app-setup-bom')!;
    expect(Array.from(bom.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')!.textContent!.trim())).toEqual(['frame', 'sash + mesh sash', 'reinforcement', 'glass', 'hardware', 'labour', 'overhead', 'installation', 'One window']);
    expect(el().querySelector<HTMLDetailsElement>('[data-trial]')!.open).toBe(false);
  });

  it('step 3: on example values it offers "These are my rates now", and links to Compare and the method', () => {
    const check = el().querySelector<HTMLElement>('[data-setup="quick-check"]')!;
    expect(check.querySelector('[data-setup="example"]')!.textContent).toContain('These are example values.');
    expect(button(check, 'These are my rates now')).toBeDefined();
    expect(check.querySelector('[data-setup="method"]')!.textContent).toBe('Area formula (the price as it was)');
    expect(linkOf(check, 'Compare with my old prices')).toContain('/pricing-setup?tab=compare');
    expect(linkOf(check, 'Pricing method')).toContain('/pricing-setup?tab=method');
  });

  it('nothing priced yet: step 3 says so, and step 2 says what the figures lack', async () => {
    list.systems.forEach((s) => (s.trials = []));
    list.ready = false;
    rates.missing = [{ code: 'setting_empty', key: 'labour_rate', text: 'The fabrication labour rate per sq ft is not set.' }];
    fixture.componentInstance.load();
    await settle(fixture);
    expect(el().querySelector('[data-setup="no-trial"]')!.textContent).toContain('No window can be priced yet');
    expect(el().querySelector('[data-setup="rates-missing"]')!.textContent).toContain('The fabrication labour rate per sq ft is not set.');
    expect(el().querySelector('[data-setup="ready"]')!.textContent).toBe('Not ready yet');
  });

  describe('the brand first (T194)', () => {
    const brandButtons = (): HTMLButtonElement[] => Array.from(el().querySelectorAll<HTMLButtonElement>('[data-setup="brands"] button'));
    const lines = (): string[] => Array.from(el().querySelectorAll('[data-choice]')).map((li) => li.getAttribute('data-choice')!);

    /** The api of T194: two brands, the second with a system the company took (id 21, not ready yet). */
    function withBrands(taken = false): void {
      list.brands = [
        {
          brand: 'NCL VEKA', note: 'System names and profile codes are from the NCL VEKA technical catalogue. Weights are generic.',
          packs: [
            { pack: 'NCL VEKA I-60 Casement', what: 'I-60 Casement: casement windows and hinged doors', kind: 'casement', profiles: 8, system_id: taken ? 21 : null, confirm: 8 },
            { pack: 'NCL VEKA I-60 Sliding 2 track', what: 'I-60 Sliding, 2 track', kind: 'sliding', profiles: 6, system_id: null, confirm: 6 },
          ],
        },
        { brand: 'Encraft', note: 'Weights are generic.', packs: [{ pack: 'Encraft EN62 casement', what: 'EN62 Casement, heavy duty', kind: 'casement', profiles: 8, system_id: null, confirm: 8 }] },
      ];
      if (taken) list.systems.push({ id: 21, name: 'NCL VEKA I-60 Casement', category: 'Casement', kind: 'casement', retired: false, ready: true, missing: [], hardware_set: null, trials: [] });
    }

    it('an api without brands: the tick list as before, no brand to pick', () => {
      expect(el().querySelector('[data-setup="brands"]')).toBeNull();
      expect(lines()).toEqual(['Generic 60 mm casement', 'Generic sliding 2 track', 'Casement', 'Sliding']);
    });

    it('the groups: each brand with its ready systems, then "Other / unbranded" with the generic systems and the systems of his own; a brand system is not listed twice', () => {
      withBrands(true);
      expect(groupsOf(list).map((g) => [g.brand, g.choices.map((c) => c.note)])).toEqual([
        ['NCL VEKA', ['NCL VEKA I-60 Casement', 'NCL VEKA I-60 Sliding 2 track']],
        ['Encraft', ['Encraft EN62 casement']],
        ['Other / unbranded', ['Generic 60 mm casement', 'Generic sliding 2 track', 'Casement', 'Sliding']],
      ]);
    });

    it('a company on the generic systems opens on "Other / unbranded": no extra click; a brand is one click, its systems carry the mark to confirm', async () => {
      withBrands();
      fixture.componentInstance.load();
      await settle(fixture);
      expect(brandButtons().map((b) => [b.textContent!.trim(), b.getAttribute('aria-pressed')])).toEqual([['NCL VEKA', 'false'], ['Encraft', 'false'], ['Other / unbranded (2)', 'true']]);
      expect(lines()).toEqual(['Generic 60 mm casement', 'Generic sliding 2 track', 'Casement', 'Sliding']);
      expect(el().querySelector('[data-mark="confirm"]')).toBeNull();

      brandButtons()[0].click();
      fixture.detectChanges();
      expect(lines()).toEqual(['NCL VEKA I-60 Casement', 'NCL VEKA I-60 Sliding 2 track']);
      expect(el().querySelector('[data-setup="brand-note"]')!.textContent).toContain('Weights are generic. No rate is given');
      expect(choice('NCL VEKA I-60 Casement').querySelector('[data-mark="confirm"]')!.textContent).toBe('8 weights to confirm from your invoice');
      expect(tick('NCL VEKA I-60 Casement').checked).toBe(false);

      // The tick is the call of before with the brand system's name; the brand stays picked when the page is read again.
      api.calls = [];
      tick('NCL VEKA I-60 Casement').click();
      await settle(fixture);
      expect(api.bodyOf('post', 'pricing-setup/packs')).toEqual({ pack: 'NCL VEKA I-60 Casement' });
      expect(lines()).toEqual(['NCL VEKA I-60 Casement', 'NCL VEKA I-60 Sliding 2 track']);
    });

    it('a company that took a brand system opens on that brand, ticked and Ready', async () => {
      withBrands(true);
      fixture.componentInstance.brand = null;
      fixture.componentInstance.load();
      await settle(fixture);
      expect(brandButtons().find((b) => b.getAttribute('aria-pressed') === 'true')!.textContent!.trim()).toBe('NCL VEKA (1)');
      expect(tick('NCL VEKA I-60 Casement').checked).toBe(true);
      expect(choice('NCL VEKA I-60 Casement').textContent).toContain('Ready');
    });

    it('a company with nothing in use picks its brand first', async () => {
      withBrands();
      list.systems = [];
      list.packs.forEach((p) => (p.system_id = null));
      fixture.componentInstance.brand = null;
      fixture.componentInstance.load();
      await settle(fixture);
      expect(lines()).toEqual([]);
      expect(el().querySelector('[data-setup="no-brand"]')).not.toBeNull();
      brandButtons()[2].click();
      fixture.detectChanges();
      expect(lines()).toEqual(['Generic 60 mm casement', 'Generic sliding 2 track']);
    });
  });
});
