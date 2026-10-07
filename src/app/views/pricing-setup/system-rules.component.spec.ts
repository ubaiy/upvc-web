import { ComponentFixture } from '@angular/core/testing';

import { SystemDetail } from './pricing-setup.models';
import { FakeApi, button, mount, ok, refused422, ruleOf, settle, systemDetail, toastOf, type } from './pricing-setup.testing';
import { SystemRulesComponent, confidenceOf, ruleGroups } from './system-rules.component';

describe('Pricing setup, the rules of a system (T182)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<SystemRulesComponent>;
  let saved: SystemDetail[];
  const el = (): HTMLElement => fixture.nativeElement;
  const row = (key: string): HTMLElement => el().querySelector(`tr[data-rule="${key}"]`)!;
  const value = (key: string): HTMLInputElement => row(key).querySelector('input[type="number"]')!;
  const note = (key: string): HTMLInputElement => row(key).querySelector('input[type="text"]')!;
  const save = (): HTMLButtonElement => el().querySelector('[data-act="save-rules"]')!;

  async function start(detail = systemDetail()): Promise<void> {
    fixture = await mount(SystemRulesComponent, api, { detail });
    saved = [];
    fixture.componentInstance.saved.subscribe((d) => saved.push(d));
  }

  async function showAll(): Promise<void> {
    const only = el().querySelector<HTMLInputElement>('[data-setup="only-set"]')!;
    if (only.checked) only.click();
    await settle(fixture);
  }

  beforeEach(() => {
    api = new FakeApi();
    api.answer = (c) => (c.url.startsWith('pricing-setup/systems/4') ? ok(systemDetail({ template_added: ['a', 'b'] })) : c.url === 'profile-system/4/rules/add' ? ok({}) : undefined);
  });

  it('says how far a value can be trusted', () => {
    expect(confidenceOf(ruleOf('a', 'A'))).toEqual({ text: 'Not set, default used', tone: '' });
    expect(confidenceOf(ruleOf('a', 'A', { default: null }))).toEqual({ text: 'Not set, no default', tone: 'badge-warning' });
    expect(confidenceOf(ruleOf('a', 'A', { is_set: true, value: 2, is_placeholder: true }))).toEqual({ text: 'Placeholder: check it', tone: 'badge-warning' });
    expect(confidenceOf(ruleOf('a', 'A', { is_set: true, value: 2, is_placeholder: false }))).toEqual({ text: 'Your figure', tone: 'badge-success' });
  });

  it('keeps the rules in the groups and the order the api names, a group the api did not name last', () => {
    const groups = ruleGroups(systemDetail({ rules: [...systemDetail().rules, ruleOf('new_rule', 'New rule', { group: 'later' })] }));
    expect(groups.map((g) => [g.title, g.rows.map((r) => r.rule.key)])).toEqual([
      ['General sizes', ['bead_deduction', 'use_supplier_tables']],
      ['Welding', ['weld_allowance_per_end']],
      ['later', ['new_rule']],
    ]);
  });

  it('shows the rules that hold a value first; every rule with unit, default, source and note when asked', async () => {
    await start();
    expect(Array.from(el().querySelectorAll('tr[data-rule]')).map((tr) => tr.getAttribute('data-rule'))).toEqual(['bead_deduction']);
    expect(el().textContent).toContain('1 of 3 rules hold a value');
    const cells = Array.from(row('bead_deduction').querySelectorAll('td')).map((td) => td.textContent!.replace(/\s+/g, ' ').trim());
    expect(cells[2]).toBe('mm');
    expect(cells[3]).toBe('10');
    expect(cells[4]).toMatch(/^Placeholder: check it ?Supplier pack$/);
    expect(value('bead_deduction').value).toBe('8');
    expect(note('bead_deduction').value).toBe('from the manual');

    await showAll();
    expect(el().querySelectorAll('tr[data-rule]').length).toBe(3);
    expect(row('use_supplier_tables').textContent).toContain('0 or 1');
    expect(save().disabled).toBeTrue();
  });

  it('a system with no rule set opens on every rule', async () => {
    await start(systemDetail({ rules: [ruleOf('weld_allowance_per_end', 'Weld allowance per end', { group: 'welding', default: null })] }));
    expect(row('weld_allowance_per_end').textContent).toContain('None');
    expect(row('weld_allowance_per_end').textContent).toContain('Not set, no default');
  });

  it('saves the changed values in one PUT (a number sets, an emptied box removes), the note in the same PUT, then reads the system', async () => {
    await start();
    await showAll();
    type(value('weld_allowance_per_end'), '2.5');
    type(note('weld_allowance_per_end'), ' measured on our own welder ');
    type(value('bead_deduction'), '');
    await settle(fixture);
    expect(el().textContent).toContain('2 rules changed, not saved yet.');

    save().click();
    await settle(fixture);
    expect(api.sent).toEqual(['PUT pricing-setup/systems/4/rules', 'GET pricing-setup/systems/4']);
    expect(api.calls[0].body).toEqual({ rules: { weld_allowance_per_end: 2.5, bead_deduction: null }, notes: { weld_allowance_per_end: 'measured on our own welder' } });
    expect(saved.length).toBe(1);
    expect(toastOf().showSuccess).toHaveBeenCalledWith('2 rules saved');
  });

  it('a changed note alone keeps the value: only the note is sent', async () => {
    await start();
    type(note('bead_deduction'), 'checked against the Zendow manual');
    await settle(fixture);
    save().click();
    await settle(fixture);
    expect(api.sent).toEqual(['PUT pricing-setup/systems/4/rules', 'GET pricing-setup/systems/4']);
    expect(api.calls[0].body).toEqual({ notes: { bead_deduction: 'checked against the Zendow manual' } });
    expect(toastOf().showSuccess).toHaveBeenCalledWith('Rule saved');
  });

  it('sends nothing for a note on a rule without a value, or a flag that is not 0 or 1', async () => {
    await start();
    await showAll();
    type(note('weld_allowance_per_end'), 'a note without a value');
    await settle(fixture);
    save().click();
    await settle(fixture);
    expect(row('weld_allowance_per_end').textContent).toContain('Give the rule a value to keep a note on it.');

    type(note('weld_allowance_per_end'), '');
    type(value('use_supplier_tables'), '2');
    await settle(fixture);
    save().click();
    await settle(fixture);
    expect(row('use_supplier_tables').textContent).toContain('Enter 0 (no) or 1 (yes).');
    expect(api.writes).toEqual([]);
  });

  it('a refusal is shown on the rule it names and the rest at the foot; the typed values stay', async () => {
    api.answer = (c) => (c.url.startsWith('pricing-setup/') ? refused422(['Bead deduction: the value must be 0 or more.', 'Nothing was saved.'], 'The rules were not saved.') : undefined);
    await start();
    type(value('bead_deduction'), '-4');
    await settle(fixture);
    save().click();
    await settle(fixture);
    expect(row('bead_deduction').querySelector('[role="alert"]')!.textContent).toBe('Bead deduction: the value must be 0 or more.');
    expect(Array.from(el().querySelectorAll('[data-setup="rules-error"]')).map((p) => p.textContent)).toEqual(['Nothing was saved.']);
    expect(value('bead_deduction').value).toBe('-4');
    expect(saved).toEqual([]);
  });

  it('"Copy its values" sends the pack alone and says how many rules came in as placeholders', async () => {
    await start();
    const copy = el().querySelector<HTMLButtonElement>('[data-act="template"]')!;
    expect(copy.disabled).toBeTrue();
    const pack = el().querySelector<HTMLSelectElement>('#rule-template')!;
    pack.value = 'dcn-zendow';
    pack.dispatchEvent(new Event('change'));
    await settle(fixture);
    button(el(), 'Copy its values').click();
    await settle(fixture);

    expect(api.sent).toEqual(['PUT pricing-setup/systems/4/rules']);
    expect(api.calls[0].body).toEqual({ template: 'dcn-zendow' });
    expect(el().querySelector('[data-setup="template-added"]')!.textContent).toContain('2 rules were added as placeholders.');
    expect(saved.length).toBe(1);
  });
});
