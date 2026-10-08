import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { HardwareTabComponent, bandOf, quantityRule } from './hardware-tab.component';
import { HardwareRule, HardwareSet } from './pricing-setup.models';
import { FakeApi, button, checklist, mount, ok, refused422, settle, toastOf, type } from './pricing-setup.testing';

function setOf(over: Partial<HardwareSet> = {}): HardwareSet {
  return { id: 3, code: 'MY-CAS-1', name: 'My casement set', brand: null, category: 'casement', profile_system_id: 4, rebate_offset_mm: null, is_default: false, is_verified: false, source: 'Entered by the company', rules_count: 1, unmatched: [], unpriced: [], ...over };
}

function lineOf(over: Partial<HardwareRule> = {}): HardwareRule {
  return {
    id: 12,
    hardware_set_id: 3,
    priority: null,
    kind: 'hardware',
    role: 'handle',
    scope: 'sash',
    applies_opening: 'side_hung',
    applies_leaf: null,
    band_on: null,
    band_min_mm: null,
    band_max_mm: null,
    weight_min_kg: null,
    weight_max_kg: null,
    costhead_id: 7,
    item_name: 'Handle, white',
    qty_formula: 'fixed',
    qty_factor: '2.0000',
    qty_min: null,
    step_mm: null,
    measure: null,
    source_note: null,
    costhead: { id: 7, name: 'Handle, white', cost: 28.32, unit: 'Unit' },
    ...over,
  };
}

const PACKS = [
  { code: 'RS-CAS-1', what: 'Casement windows: espagnolette, hinges, consumables', imported: false },
  { code: 'RS-SLD-1', what: 'Sliding windows: rollers, lock, rail', imported: true },
];

describe('Pricing setup, the hardware sets (T182)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<HardwareTabComponent>;
  let navigate: jasmine.Spy;
  const el = (): HTMLElement => fixture.nativeElement;

  function routes(over: (c: { verb: string; url: string; body?: any }) => ReturnType<FakeApi['answer']> = () => undefined): void {
    api.answer = (c) => {
      const own = over(c);
      if (own) return own;
      if (c.verb === 'get' && c.url === 'hardware-sets') return ok({ sets: [setOf(), setOf({ id: 5, code: 'RS-SLD-1', name: 'Sliding pack', category: 'sliding', profile_system_id: null, is_default: true, rules_count: 9, unpriced: ['Roller'] })], packs: PACKS, categories: ['casement', 'sliding', 'door'] });
      if (c.url === 'pricing-setup') return ok(checklist());
      if (c.url === 'hardware-sets/3') return ok({ set: setOf(), rules: [lineOf()] });
      if (c.url === 'costhead/list') return ok([{ id: 7, name: 'Handle, white', cost: 28.32, unit: 'Unit', costhead: 'Hardware' }, { id: 8, name: 'Friction stay', cost: 0, unit: 'Unit', costhead: 'Hardware' }]);
      if (c.verb === 'post' && c.url === 'hardware-sets') return ok({ set: setOf({ id: 21, ...c.body }), rules: [], created: true });
      if (c.url === 'hardware-sets/3/rules') return ok({ set: setOf({ rules_count: 2 }), rules: [lineOf(), lineOf({ id: 13, item_name: c.body.item_name, costhead: null, costhead_id: null })] });
      if (c.url === 'hardware-sets/rules/12') return ok({ set: setOf({ rules_count: 0 }), rules: [] });
      return undefined;
    };
  }

  async function start(setId: number | null = null): Promise<void> {
    fixture = await mount(HardwareTabComponent, api, { setId });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    api.calls = [];
  }

  beforeEach(() => {
    api = new FakeApi();
    routes();
  });

  it('says how many of an item a line gives, and when a line of a pack applies', () => {
    expect(quantityRule({ qty_formula: 'fixed', qty_factor: '2.0000', step_mm: null })).toBe('2');
    expect(quantityRule({ qty_formula: 'per_m', qty_factor: 1.5, step_mm: null })).toBe('1.5 per metre');
    expect(quantityRule({ qty_formula: 'per_sq_m', qty_factor: 1, step_mm: null })).toBe('1 per sq m');
    expect(quantityRule({ qty_formula: 'steps', qty_factor: 1, step_mm: 600 })).toBe('1 for each 600 mm');
    expect(quantityRule({ qty_formula: 'per_cam', qty_factor: 1, step_mm: null })).toBe('1 for each cam');
    expect(bandOf(lineOf())).toBe('');
    expect(bandOf(lineOf({ band_on: 'rebate_height', band_min_mm: 1001, band_max_mm: 1200, weight_min_kg: 30.1, weight_max_kg: 55 }))).toBe('rebate height 1001 to 1200 mm, 30.1 to 55 kg');
  });

  it('lists the sets with what each is for, names the kinds without a default set, and offers the ready packs', async () => {
    await start();
    expect(el().querySelector('[data-setup="no-default"]')!.textContent).toContain('No default hardware set for casement, door windows.');
    const mine = Array.from(el().querySelector('tr[data-set="MY-CAS-1"]')!.querySelectorAll('td')).map((td) => td.textContent!.replace(/\s+/g, ' ').trim());
    expect(mine.slice(1, 5)).toEqual(['Casement', 'Alpha 60 casement', '1', 'Not the default']);
    const pack = el().querySelector('tr[data-set="RS-SLD-1"]')!.textContent!;
    expect(pack).toContain('Any system');
    expect(pack).toContain('Default');
    expect(pack).toContain('1 item has no price');

    expect(el().querySelector('tr[data-pack="RS-SLD-1"]')!.textContent).toContain('In your sets');
    expect(el().querySelector('tr[data-pack="RS-SLD-1"] button')).toBeNull();
    expect(el().querySelector('tr[data-pack="RS-CAS-1"] button')!.textContent!.trim()).toBe('Copy into my sets');
  });

  it('"Copy into my sets": POST hardware-sets with the pack, then the list is read again', async () => {
    await start();
    el().querySelector<HTMLButtonElement>('tr[data-pack="RS-CAS-1"] button')!.click();
    await settle(fixture);
    expect(api.sent[0]).toBe('POST hardware-sets');
    expect(api.calls[0].body).toEqual({ pack: 'RS-CAS-1' });
    expect(api.sent).toContain('GET hardware-sets');
    expect(toastOf().showSuccess).toHaveBeenCalledWith('RS-CAS-1 copied into your sets');
  });

  it('a pack the api refuses says why on the page', async () => {
    routes((c) => (c.verb === 'post' && c.url === 'hardware-sets' ? refused422(['The pack RS-CAS-1 is not known.'], 'The hardware set was not added.') : undefined));
    await start();
    el().querySelector<HTMLButtonElement>('tr[data-pack="RS-CAS-1"] button')!.click();
    await settle(fixture);
    expect(el().querySelector('.refusal')!.textContent).toBe('The pack RS-CAS-1 is not known.');
  });

  it('a set of the company\'s own: code, name, kind, system and the default mark in one POST, then its page', async () => {
    await start();
    el().querySelector<HTMLButtonElement>('[data-setup="new-set"]')!.click();
    await settle(fixture);
    const form = el().querySelector<HTMLElement>('[data-setup="set-form"]')!;
    type(form.querySelector('#set-code'), 'my set');
    type(form.querySelector('#set-name'), 'Door set');
    await settle(fixture);
    button(form, 'Add the set').click();
    await settle(fixture);
    expect(form.textContent).toContain('Letters, digits, dot, dash or underscore, without spaces.');
    expect(api.writes).toEqual([]);

    type(form.querySelector('#set-code'), 'MY-DR-1');
    const kind = form.querySelector<HTMLSelectElement>('#set-category')!;
    kind.value = 'door';
    kind.dispatchEvent(new Event('change'));
    const system = form.querySelector<HTMLSelectElement>('#set-system')!;
    system.value = '4';
    system.dispatchEvent(new Event('change'));
    form.querySelector<HTMLInputElement>('input[name="isDefault"]')!.click();
    await settle(fixture);
    button(form, 'Add the set').click();
    await settle(fixture);

    expect(api.writes.map((c) => `${c.verb} ${c.url}`)).toEqual(['post hardware-sets']);
    expect(api.writes[0].body).toEqual({ name: 'Door set', brand: null, profile_system_id: 4, rebate_offset_mm: null, is_default: true, code: 'MY-DR-1', category: 'door' });
    expect(navigate).toHaveBeenCalledWith(['/pricing-setup'], { queryParams: { tab: 'hardware', set: 21 } });
  });

  it('one set: what it is for with the system as it is named, and each line with its quantity and the rate of its catalogue item', async () => {
    await start(3);
    expect(el().querySelector('[data-setup="set-name"]')!.textContent).toBe('My casement set');
    expect(el().textContent!.replace(/\s+/g, ' ')).toContain('MY-CAS-1, for casement windows, Alpha 60 casement. Source: Entered by the company.');
    expect(el().querySelector('[data-setup="set-default"]')!.textContent).toBe('Not the default');
    const cells = Array.from(el().querySelector('tr[data-line="Handle, white"]')!.querySelectorAll('td')).map((td) => td.textContent!.replace(/\s+/g, ' ').trim());
    expect(cells.slice(0, 4)).toEqual(['Handle, white', 'Handle', 'Sash, side hung', '2']);
    expect(cells[5]).toMatch(/^₹28\.32 ?per Unit$/);
  });

  it('"Change" of a set: PUT hardware-sets/{id} with the default mark, without code or kind', async () => {
    routes((c) => (c.verb === 'put' && c.url === 'hardware-sets/3' ? ok({ set: setOf({ is_default: true }), rules: [lineOf()] }) : undefined));
    await start(3);
    el().querySelector<HTMLButtonElement>('[data-act="edit-set"]')!.click();
    await settle(fixture);
    const form = el().querySelector<HTMLElement>('[data-setup="set-form"]')!;
    expect(form.querySelector('#set-code')).toBeNull();
    form.querySelector<HTMLInputElement>('input[name="isDefault"]')!.click();
    type(form.querySelector('#set-rebate'), '12');
    await settle(fixture);
    button(form, 'Save').click();
    await settle(fixture);
    expect(api.writes.map((c) => `${c.verb} ${c.url}`)).toEqual(['put hardware-sets/3']);
    expect(api.writes[0].body).toEqual({ name: 'My casement set', brand: null, profile_system_id: 4, rebate_offset_mm: 12, is_default: true });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('"Delete" of a set asks first; after the yes DELETE hardware-sets/{id} and back to the list', async () => {
    routes((c) => (c.verb === 'delete' && c.url === 'hardware-sets/3' ? ok({ deleted: { id: 3, code: 'MY-CAS-1', name: 'My casement set' }, sets: [] }) : undefined));
    await start(3);
    el().querySelector<HTMLButtonElement>('[data-act="delete-set"]')!.click();
    await settle(fixture);
    const dialog = el().querySelector('app-confirm-dialog')!;
    expect(dialog.textContent).toContain('Delete My casement set?');
    expect(dialog.textContent).toContain('The set and its lines are removed.');
    expect(api.writes).toEqual([]);

    Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Delete the set')!.click();
    await settle(fixture);
    expect(api.sent).toEqual(['DELETE hardware-sets/3']);
    expect(navigate).toHaveBeenCalledWith(['/pricing-setup'], { queryParams: { tab: 'hardware' } });
    expect(toastOf().showSuccess).toHaveBeenCalledWith('My casement set deleted');
  });

  it('a set the api will not delete: its sentences stay in the dialog and the set stays', async () => {
    routes((c) =>
      c.verb === 'delete' && c.url === 'hardware-sets/3'
        ? refused422(["Hardware set 'My casement set' is the default set for casement windows: mark another set as the default first.", "Hardware set 'My casement set' is tied to the profile system 'Alpha 60 casement', which is in use: untie it or retire the system first."], 'The hardware set was not deleted.')
        : undefined
    );
    await start(3);
    el().querySelector<HTMLButtonElement>('[data-act="delete-set"]')!.click();
    await settle(fixture);
    Array.from(el().querySelectorAll<HTMLButtonElement>('app-confirm-dialog button')).find((b) => b.textContent!.trim() === 'Delete the set')!.click();
    await settle(fixture);
    const said = el().querySelector('app-confirm-dialog')!.textContent!;
    expect(said).toContain('mark another set as the default first.');
    expect(said).toContain('untie it or retire the system first.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a new line: the catalogue item gives its name; POST hardware-sets/{id}/rules with what was chosen', async () => {
    await start(3);
    el().querySelector<HTMLButtonElement>('[data-setup="new-line"]')!.click();
    await settle(fixture);
    const form = el().querySelector<HTMLElement>('[data-setup="line-form"]')!;
    button(form, 'Add the line').click();
    await settle(fixture);
    expect(form.textContent).toContain('Enter the item.');
    expect(form.textContent).toContain('One word in small letters');
    expect(api.writes).toEqual([]);

    const item = form.querySelector<HTMLSelectElement>('#line-costhead')!;
    expect(Array.from(item.options).map((o) => o.textContent!.trim())).toEqual(['No item yet: no price', 'Handle, white, ₹28.32 per Unit', 'Friction stay, ₹0.00 per Unit']);
    item.value = '8';
    item.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect((form.querySelector('#line-item') as HTMLInputElement).value).toBe('Friction stay');
    type(form.querySelector('#line-role'), 'stay');
    const opening = form.querySelector<HTMLSelectElement>('#line-opening')!;
    expect(Array.from(opening.options).map((o) => o.textContent!.trim())).toEqual(['Any', 'Side hung', 'Top hung', 'Bottom hung', 'Tilt turn']);
    opening.value = 'top_hung';
    opening.dispatchEvent(new Event('change'));
    type(form.querySelector('#line-factor'), '2');
    await settle(fixture);
    button(form, 'Add the line').click();
    await settle(fixture);

    expect(api.writes.map((c) => `${c.verb} ${c.url}`)).toEqual(['post hardware-sets/3/rules']);
    expect(api.writes[0].body).toEqual({ item_name: 'Friction stay', kind: 'hardware', role: 'stay', scope: 'sash', applies_opening: 'top_hung', qty_formula: 'fixed', qty_factor: 2, costhead_id: 8 });
    expect(el().querySelector('tr[data-line="Friction stay"]')!.textContent).toContain('No catalogue item');
    expect(toastOf().showSuccess).toHaveBeenCalledWith('Line added');
  });

  it('"Remove" of a line asks first; after the yes DELETE hardware-sets/rules/{id}', async () => {
    await start(3);
    el().querySelector<HTMLButtonElement>('[data-act="remove-line"]')!.click();
    await settle(fixture);
    const dialog = el().querySelector('app-confirm-dialog')!;
    expect(dialog.textContent).toContain('Remove Handle, white from the set?');
    expect(api.writes).toEqual([]);
    Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Remove the line')!.click();
    await settle(fixture);
    expect(api.sent).toEqual(['DELETE hardware-sets/rules/12']);
    expect(el().textContent).toContain('This set has no line yet');
  });
});
