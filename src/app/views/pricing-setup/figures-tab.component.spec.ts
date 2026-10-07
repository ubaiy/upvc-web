import { ComponentFixture } from '@angular/core/testing';

import { FiguresTabComponent, figureGroups, figuresBody } from './figures-tab.component';
import { FakeApi, figures, mount, ok, refused422, settle, toastOf, type } from './pricing-setup.testing';

describe('Pricing setup, rates and figures (T182)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<FiguresTabComponent>;
  const el = (): HTMLElement => fixture.nativeElement;
  const box = (key: string): HTMLInputElement => el().querySelector('#figure-' + key.replace(/_/g, '-'))!;
  const field = (key: string): HTMLElement => box(key).closest('.field')!;
  const save = (): HTMLButtonElement => el().querySelector('[data-act="save-figures"]')!;

  beforeEach(() => {
    api = new FakeApi();
    api.answer = (c) => (c.url === 'pricing-setup/settings' ? ok(figures()) : undefined);
  });

  it('puts the api\'s settings in the groups of the form, with unit, default and whose figure it is', () => {
    const groups = figureGroups(figures());
    expect(groups.map((g) => [g.id, g.fields.map((f) => f.key)])).toEqual([
      ['rates', ['profile_rate_kg', 'labour_rate']],
      ['basis', ['profile_rate_basis', 'labour_mode']],
      ['wastage', ['profile_wastage_pct']],
      ['glass', ['glass_round_up_mm']],
      // A figure the web does not know yet is still shown.
      ['other', ['new_figure']],
    ]);
    const by = Object.fromEntries(groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(by['profile_rate_kg']).toEqual(jasmine.objectContaining({ label: 'Profile rate, white', unit: 'per kg', money: true, value: '', fallback: null, own: false }));
    expect(by['labour_rate']).toEqual(jasmine.objectContaining({ unit: 'per sq ft', money: true, value: '55', own: true }));
    expect(by['profile_wastage_pct']).toEqual(jasmine.objectContaining({ unit: '%', money: false, value: '6', fallback: '6' }));
    expect(by['profile_rate_basis']).toEqual(jasmine.objectContaining({ choices: ['per_kg', 'per_m'], unit: '', value: 'per_kg' }));
    expect(by['new_figure']).toEqual(jasmine.objectContaining({ label: 'New figure', unit: '', value: '2' }));
  });

  it('sends only what was changed; an emptied box is null', () => {
    const groups = figureGroups(figures());
    const glass = [{ id: 2, value: '', held: '' }, { id: 3, value: '5', held: '' }];
    const colours = [{ id: 1, value: '', held: '210' }];
    expect(figuresBody(groups, [glass[0]], [{ id: 1, value: '210', held: '210' }])).toEqual({});

    const fields = groups.flatMap((g) => g.fields);
    fields.find((f) => f.key === 'profile_rate_kg')!.value = '96.5';
    fields.find((f) => f.key === 'labour_rate')!.value = '';
    fields.find((f) => f.key === 'profile_rate_basis')!.value = 'per_m';
    // A number box hands Angular a number.
    fields.find((f) => f.key === 'profile_wastage_pct')!.value = 6 as unknown as string;
    expect(figuresBody(groups, glass, colours)).toEqual({
      settings: { profile_rate_kg: 96.5, labour_rate: null, profile_rate_basis: 'per_m' },
      glass: [{ id: 3, glass_mm: 5 }],
      colours: [{ id: 1, rate_kg: null }],
    });
  });

  it('shows each figure, the api\'s sentence on the one that is missing, and the glass and colour tables', async () => {
    fixture = await mount(FiguresTabComponent, api, { asked: 'profile_rate_kg' });
    // Two sentences of the api, one after the other, with a space between.
    expect(el().querySelector('[data-setup="figures-missing"]')!.textContent).toContain('The profile rate per kg is not set. The steel rate per kg is not set.');
    expect(Array.from(el().querySelectorAll('fieldset')).map((f) => f.getAttribute('data-figures'))).toEqual(['rates', 'basis', 'wastage', 'glass', 'other']);

    expect(box('profile_rate_kg').value).toBe('');
    expect(box('profile_rate_kg').placeholder).toBe('Not set');
    expect(field('profile_rate_kg').textContent).toContain('The profile rate per kg is not set.');
    expect(field('profile_rate_kg').classList).toContain('is-asked');
    expect(field('profile_rate_kg').textContent).toContain('₹');
    expect(field('profile_rate_kg').textContent).toContain('per kg');
    expect(box('labour_rate').value).toBe('55');
    expect(field('labour_rate').textContent).toContain('Your figure.');
    expect(field('profile_wastage_pct').textContent).toContain('The default (6).');
    expect((box('labour_mode') as unknown as HTMLSelectElement).disabled).toBeTrue();
    expect(field('labour_mode').textContent).toContain('The only way the api prices today.');

    expect(el().querySelector('[data-setup="glass"] tbody tr')!.textContent).toContain('5mm plain glass');
    expect(el().querySelector('[data-setup="glass"] tbody tr')!.textContent).toContain('₹72.00 per Sq M');
    expect(el().querySelector<HTMLInputElement>('[data-setup="colours"] input')!.value).toBe('210');
    expect(save().disabled).toBeTrue();
  });

  it('saves the changed figures in one PUT and shows what the api answered', async () => {
    fixture = await mount(FiguresTabComponent, api);
    type(box('profile_rate_kg'), '96.5');
    type(box('profile_wastage_pct'), '');
    type(el().querySelector('[data-setup="glass"] input'), '5');
    type(el().querySelector('[data-setup="colours"] input'), '');
    await settle(fixture);
    expect(el().textContent).toContain('You have unsaved changes.');

    api.answer = (c) => (c.url === 'pricing-setup/settings' ? ok(figures({ settings: { ...figures().settings, profile_rate_kg: 96.5 }, set_by_company: ['labour_rate', 'profile_rate_kg'], missing: [] })) : undefined);
    save().click();
    await settle(fixture);

    expect(api.writes.map((c) => `${c.verb} ${c.url}`)).toEqual(['put pricing-setup/settings']);
    expect(api.writes[0].body).toEqual({
      settings: { profile_rate_kg: 96.5, profile_wastage_pct: null },
      glass: [{ id: 2, glass_mm: 5 }],
      colours: [{ id: 1, rate_kg: null }],
    });
    expect(el().querySelector('[data-setup="figures-missing"]')).toBeNull();
    expect(field('profile_rate_kg').textContent).toContain('Your figure.');
    expect(save().disabled).toBeTrue();
    expect(toastOf().showSuccess).toHaveBeenCalledWith('Figures saved');
  });

  it('sends nothing for a percentage above 100 or a negative amount', async () => {
    fixture = await mount(FiguresTabComponent, api);
    type(box('profile_wastage_pct'), '140');
    type(box('labour_rate'), '-1');
    await settle(fixture);
    save().click();
    await settle(fixture);
    expect(field('profile_wastage_pct').textContent).toContain('Enter a percentage from 0 to 100.');
    expect(field('labour_rate').textContent).toContain('Enter a number of 0 or more.');
    expect(api.writes).toEqual([]);
  });

  it('a refusal is shown on the figure it names, the rest at the foot, and what was typed stays', async () => {
    fixture = await mount(FiguresTabComponent, api);
    type(box('labour_rate'), '99999999');
    await settle(fixture);
    api.answer = (c) => (c.url === 'pricing-setup/settings' ? refused422(['Fabrication labour: the rate is too high.', 'Nothing was saved.'], 'The figures were not saved.') : undefined);
    save().click();
    await settle(fixture);
    expect(field('labour_rate').querySelector('[role="alert"]')!.textContent).toBe('Fabrication labour: the rate is too high.');
    expect(Array.from(el().querySelectorAll('[data-setup="figures-error"]')).map((p) => p.textContent)).toEqual(['Nothing was saved.']);
    expect(box('labour_rate').value).toBe('99999999');
  });
});
