import { ComponentFixture } from '@angular/core/testing';

import { ChecklistTabComponent, fixLabel, placeOf } from './checklist-tab.component';
import { ExamplePack } from './pricing-setup.models';
import { FakeApi, OWNER, button, checklist, http, linkOf, meOf, mount, ok, settle } from './pricing-setup.testing';

const EXAMPLE: ExamplePack = {
  pack: 'classic_example',
  name: 'Classic example pack',
  note: 'Every figure below is another fabricator’s or a rule of thumb.',
  confidence: { low: 'A rule of thumb.', high: 'From the supplier manual.' },
  to_confirm: [
    { what: 'setting', key: 'profile_rate_kg', label: 'Profile rate, white', value: 210, unit: 'INR per kg', confidence: 'low', flagged: true, source: 'Market rate 2024', stored: true },
    { what: 'rule', key: 'bead_deduction', label: 'Bead deduction', value: 8, unit: 'mm', confidence: 'high', flagged: false, source: 'Supplier manual', stored: true, system: 'Alpha 60 casement' },
    { what: 'setting', key: 'installation_rate', label: 'Installation labour', value: null, confidence: 'low', flagged: false, stored: false },
  ],
};

describe('Pricing setup, the check list (T182)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<ChecklistTabComponent>;
  const el = (): HTMLElement => fixture.nativeElement;

  beforeEach(() => {
    api = new FakeApi();
  });

  it('says where each missing thing is fixed', () => {
    expect(placeOf({ code: 'setting_missing', key: 'labour_rate', text: '' })).toEqual({ tab: 'figures', key: 'labour_rate' });
    expect(placeOf({ code: 'setting_missing', key: 'labour_rate', text: '' }, 4)).toEqual({ tab: 'figures', key: 'labour_rate' });
    expect(placeOf({ code: 'no_hardware_set', category: 'casement', text: '' }, 4)).toEqual({ tab: 'hardware' });
    expect(placeOf({ code: 'no_system', text: '' })).toEqual({ tab: 'systems' });
    expect(placeOf({ code: 'no_system_ready', text: '' }, 4)).toEqual({ tab: 'systems' });
    expect(placeOf({ code: 'role_missing', role: 'steel', text: '' })).toEqual({ tab: 'systems' });
    expect(placeOf({ code: 'role_missing', role: 'steel', text: '' }, 4)).toEqual({ tab: 'systems', system: 4, role: 'steel' });
    expect(placeOf({ code: 'trial_failed', text: '' }, 4)).toEqual({ tab: 'systems', system: 4 });

    expect(fixLabel({ code: 'setting_missing', key: 'labour_rate', text: '' })).toBe('Set it in Rates and figures');
    expect(fixLabel({ code: 'no_hardware_set', text: '' }, 4)).toBe('Open Hardware sets');
    expect(fixLabel({ code: 'no_system', text: '' })).toBe('Add a profile system');
    expect(fixLabel({ code: 'no_system_ready', text: '' })).toBe('Open Profile systems');
    expect(fixLabel({ code: 'role_missing', role: 'steel', text: '' }, 4)).toBe('Give the profile');
    expect(fixLabel({ code: 'trial_failed', text: '' }, 4)).toBe('Open the system');
  });

  it('shows the live method, what is missing in the api\'s words, and a link on each line', async () => {
    api.answer = (c) => (c.url === 'pricing-setup' ? ok(checklist()) : undefined);
    fixture = await mount(ChecklistTabComponent, api);

    expect(el().querySelector('[data-setup="method"]')!.textContent).toBe('Area formula (the price as it was)');
    expect(el().querySelector('[data-setup="ready"]')!.textContent).toBe('Not ready');
    expect(el().querySelector('[data-setup="missing"]')!.textContent).toContain('The fabrication labour rate per sq ft is not set.');
    expect(linkOf(el(), 'Set it in Rates and figures')).toContain('/pricing-setup?tab=figures&key=labour_rate');

    const system = el().querySelector('[data-system="Alpha 60 casement"]')!;
    expect(system.textContent).toContain('No profile is given for the role Reinforcement steel.');
    expect(linkOf(system, 'Give the profile')).toContain('/pricing-setup?tab=systems&system=4&role=steel');
    expect(linkOf(system, 'Open Hardware sets')).toContain('/pricing-setup?tab=hardware');
    expect(linkOf(system, 'Alpha 60 casement')).toContain('/pricing-setup?tab=systems&system=4');
    // One line per system in use, with the count of what it misses, closed; a retired system is not listed (T187).
    expect(system.querySelector('summary')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Alpha 60 casement: 2 things missing');
    expect((system as HTMLDetailsElement).open).toBe(false);
    expect(el().querySelector('[data-system="Old 50 sliding"]')).toBeNull();
    expect(el().querySelector('[data-setup="example"]')).toBeNull();
    expect(el().querySelector('[data-setup="example-values"]')).toBeNull();
  });

  it('names each profile the area formula has no rate for, with the way to it', async () => {
    const unpriced = [{ code: 'profile_no_rate', text: "Profile A60-FR (Outer frame of 'Alpha 60 casement') has no rate for the current method (area formula).", product_id: 31, profile_code: 'A60-FR', system_id: 4, role: 'frame' }];
    api.answer = (c) => (c.url === 'pricing-setup' ? ok(checklist({ unpriced_profiles: unpriced })) : undefined);
    fixture = await mount(ChecklistTabComponent, api);
    const block = el().querySelector('[data-setup="unpriced"]')!;
    expect(block.textContent).toContain('a window on one of these is refused');
    expect(block.textContent).toContain("Profile A60-FR (Outer frame of 'Alpha 60 casement') has no rate for the current method (area formula).");
    expect(linkOf(block, 'Open the profile')).toContain('/pricing-setup?tab=systems&system=4&role=frame');
  });

  it('a ready company: the count of systems in use, and the trial windows with the cost the api gave', async () => {
    const list = checklist({ ready: true, missing: [] });
    list.systems[0] = {
      ...list.systems[0],
      ready: true,
      missing: [],
      hardware_set: { id: 3, code: 'RS-CAS-1', name: 'Casement pack' },
      trials: [
        { window: 'Casement 1200 x 1200', width: 1200, height: 1200, priced: true, glass: '5mm plain glass', cost: 8450.5 },
        { window: 'Door 900 x 2100', width: 900, height: 2100, priced: false, reason: 'No door sash profile.' },
      ],
    };
    api.answer = (c) => (c.url === 'pricing-setup' ? ok(list) : undefined);
    fixture = await mount(ChecklistTabComponent, api);

    expect(el().querySelector('[data-setup="ready"]')!.textContent).toBe('Ready');
    expect(el().querySelector('[data-setup="all-set"]')!.textContent!.replace(/\s+/g, ' ')).toContain('1 of 1 profile system in use is ready');
    const system = el().querySelector('[data-system="Alpha 60 casement"]')!.textContent!;
    expect(system).toContain('Hardware set: RS-CAS-1');
    expect(system).toContain('Trial: Casement 1200 x 1200 with 5mm plain glass costs ₹8,450.50');
    expect(system).toContain('Trial: Door 900 x 2100 is not priced: No door sash profile.');
  });

  it('no system yet: the empty state leads to Profile systems', async () => {
    api.answer = (c) => (c.url === 'pricing-setup' ? ok(checklist({ systems: [], missing: [{ code: 'no_system', text: 'No profile system yet.' }] })) : undefined);
    fixture = await mount(ChecklistTabComponent, api);
    expect(el().textContent).toContain('No profile system yet');
    expect(linkOf(el().querySelector('[data-setup="missing"]')!, 'Add a profile system')).toContain('/pricing-setup?tab=systems');
  });

  it('on the example pack: the banner, each example value with its source and how sure, and "These are my rates now"', async () => {
    api.me = meOf(OWNER, { code: 'classic_example', example_rates: true, note: 'Example rates.' });
    api.answer = (c) => (c.url === 'pricing-setup' ? ok(checklist({ example: EXAMPLE })) : undefined);
    fixture = await mount(ChecklistTabComponent, api);

    const banner = el().querySelector('[data-setup="example"]')!;
    expect(banner.textContent).toContain('These are example values.');
    expect(banner.textContent).toContain('Every figure below is another fabricator’s or a rule of thumb. (Classic example pack)');
    expect(button(el(), 'These are my rates now')).toBeTruthy();

    const table = el().querySelector('[data-setup="example-values"]')!;
    expect(table.textContent).toContain('1 of 3 are marked "check first"');
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent!.replace(/\s+/g, ' ').trim()));
    expect(rows[0]).toEqual(['Profile rate, white', '210 INR per kg', jasmine.stringMatching(/^Check first ?A rule of thumb\.$/) as any, 'Market rate 2024']);
    expect(rows[1]).toEqual([jasmine.stringMatching(/^Bead deduction ?Alpha 60 casement$/) as any, '8 mm', jasmine.stringMatching(/^high ?From the supplier manual\.$/) as any, 'Supplier manual']);
    expect(rows[2][0]).toMatch(/^Installation labour ?Offered only, not stored$/);
    expect(rows[2][1]).toBe('No price');
  });

  it('"These are my rates now": nothing is sent before the yes; after it the check list is read again and the example block is gone', async () => {
    let example: ExamplePack | null = EXAMPLE;
    api.me = meOf(OWNER, { code: 'classic_example', example_rates: true, note: 'Example rates.' });
    api.answer = (c) => {
      if (c.url === 'pricing-setup') return ok(checklist({ example }));
      if (c.url === 'company/starter-catalogue/confirm') return ok({ changed: true, starter_catalogue: { code: 'own_rates', example_rates: false, note: null } });
      return undefined;
    };
    fixture = await mount(ChecklistTabComponent, api);

    button(el(), 'These are my rates now').click();
    fixture.detectChanges();
    expect(el().querySelector('app-confirm-dialog')!.textContent).toContain('Are the rates in the catalogue your own now?');
    expect(api.writes).toEqual([]);

    example = null;
    api.me = meOf(OWNER);
    button(el(), 'Yes, these are my rates').click();
    await settle(fixture);

    expect(api.writes.map((c) => c.url)).toEqual(['company/starter-catalogue/confirm']);
    expect(api.sent.filter((s) => s === 'GET pricing-setup').length).toBe(2);
    expect(el().querySelector('[data-setup="example"]')).toBeNull();
    expect(el().querySelector('[data-setup="example-values"]')).toBeNull();
  });

  it('a role that cannot change settings sees the banner without the button', async () => {
    api.me = meOf(['prices.view_cost'], { code: 'classic_example', example_rates: true, note: 'Example rates.' });
    api.answer = (c) => (c.url === 'pricing-setup' ? ok(checklist({ example: EXAMPLE })) : undefined);
    fixture = await mount(ChecklistTabComponent, api, {}, ['prices.view_cost']);
    expect(el().querySelector('[data-setup="example"]')).not.toBeNull();
    const own = button(el(), 'These are my rates now');
    expect(!own || own.hidden || getComputedStyle(own).display === 'none').toBeTrue();
  });

  it('a failed load says so and can be tried again', async () => {
    let fails = true;
    api.answer = (c) => (c.url === 'pricing-setup' ? (fails ? http(500, { message: 'SQLSTATE' }) : ok(checklist())) : undefined);
    fixture = await mount(ChecklistTabComponent, api);
    expect(el().textContent).toContain('We could not load the check list. The check list could not be loaded.');
    expect(el().textContent).not.toContain('SQLSTATE');

    fails = false;
    button(el(), 'Try again').click();
    await settle(fixture);
    expect(el().querySelector('[data-setup="ready"]')).not.toBeNull();
  });
});
