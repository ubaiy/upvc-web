import { ComponentFixture } from '@angular/core/testing';

import { MethodTabComponent, savedLinesText } from './method-tab.component';
import { FakeApi, checklist, linkOf, mount, ok, refused422, settle } from './pricing-setup.testing';

describe('Pricing setup, the pricing method (T182)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<MethodTabComponent>;
  const el = (): HTMLElement => fixture.nativeElement;
  const row = (key: string): HTMLElement => el().querySelector(`tr[data-method="${key}"]`)!;
  const switchOf = (key: string): HTMLButtonElement | null => row(key).querySelector('[data-act="switch"]');
  const dialog = (): HTMLElement | null => el().querySelector('app-confirm-dialog');
  const dialogButton = (label: string): HTMLButtonElement => Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent!.trim() === label)!;

  beforeEach(() => {
    api = new FakeApi();
  });

  it('says what happened to the saved lines', () => {
    const methods = checklist().methods;
    expect(savedLinesText({ method: 'bom_v1', changed: true, saved_lines: { legacy_v1: 41, bom_v1: 0 }, notes: [] }, methods)).toBe(
      'Lines already saved keep their price: 41 by “Area formula (the price as it was)”.'
    );
    expect(savedLinesText({ method: 'bom_v1', changed: true, saved_lines: {}, notes: [] }, methods)).toBe('No saved line was touched.');
  });

  it('not ready: the live method is marked, the switch is off, and each missing thing has its link', async () => {
    api.answer = (c) => (c.url === 'pricing-setup' ? ok(checklist()) : undefined);
    fixture = await mount(MethodTabComponent, api);

    expect(row('legacy_v1').querySelector('[data-setup="live"]')!.textContent).toBe('Live');
    expect(switchOf('legacy_v1')).toBeNull();
    expect(switchOf('bom_v1')!.disabled).toBeTrue();
    expect(row('bom_v1').textContent).toContain('It cannot be switched on yet: the check list is not complete.');
    expect(el().querySelector('[data-setup="method-ready"]')!.textContent).toBe('Not ready');
    expect(linkOf(el(), 'Set it in Rates and figures')).toContain('/pricing-setup?tab=figures&key=labour_rate');

    switchOf('bom_v1')!.click();
    await settle(fixture);
    expect(dialog()).toBeNull();
    expect(api.writes).toEqual([]);
  });

  it('ready: the switch asks first and sends nothing; "Not now" leaves the method as it was', async () => {
    api.answer = (c) => (c.url === 'pricing-setup' ? ok(checklist({ ready: true, missing: [] })) : undefined);
    fixture = await mount(MethodTabComponent, api);

    switchOf('bom_v1')!.click();
    await settle(fixture);
    expect(dialog()!.textContent).toContain('Switch to “Bill of materials (from your own profiles, rules and hardware sets)”?');
    expect(dialog()!.textContent).toContain('Prices will change.');
    expect(dialog()!.textContent).toContain('Lines already saved keep the price and the figures they were saved with.');
    expect(api.writes).toEqual([]);

    dialogButton('Not now').click();
    await settle(fixture);
    expect(dialog()).toBeNull();
    expect(api.writes).toEqual([]);
    expect(row('legacy_v1').querySelector('[data-setup="live"]')).not.toBeNull();
  });

  it('after the yes: PUT pricing-setup/method, the new method is live and the saved lines are accounted for', async () => {
    api.answer = (c) => {
      if (c.url === 'pricing-setup') return ok(checklist({ ready: true, missing: [] }));
      if (c.url === 'pricing-setup/method') return ok({ method: 'bom_v1', changed: true, saved_lines: { legacy_v1: 41 }, notes: [] });
      return undefined;
    };
    fixture = await mount(MethodTabComponent, api);
    switchOf('bom_v1')!.click();
    await settle(fixture);
    dialogButton('Yes, switch').click();
    await settle(fixture);

    expect(api.writes.map((c) => `${c.verb} ${c.url}`)).toEqual(['put pricing-setup/method']);
    expect(api.writes[0].body).toEqual({ method: 'bom_v1' });
    expect(dialog()).toBeNull();
    expect(row('bom_v1').querySelector('[data-setup="live"]')).not.toBeNull();
    // Back is always allowed.
    expect(switchOf('legacy_v1')!.disabled).toBeFalse();
    expect(el().querySelector('[data-setup="method-done"]')!.textContent).toContain(
      'The live method is now “Bill of materials (from your own profiles, rules and hardware sets)”. Lines already saved keep their price: 41 by “Area formula (the price as it was)”.'
    );
  });

  it('the api says not ready (422): each missing sentence is shown and the method stays', async () => {
    api.answer = (c) => {
      if (c.url === 'pricing-setup') return ok(checklist({ ready: true, missing: [] }));
      if (c.url === 'pricing-setup/method') return refused422(['The profile rate per kg is not set.', 'No profile system is ready.'], 'The bill of materials is not ready.', 'not_ready');
      return undefined;
    };
    fixture = await mount(MethodTabComponent, api);
    switchOf('bom_v1')!.click();
    await settle(fixture);
    dialogButton('Yes, switch').click();
    await settle(fixture);

    const said = el().querySelector('[data-setup="method-error"]')!.textContent!;
    expect(said).toContain('The profile rate per kg is not set.');
    expect(said).toContain('No profile system is ready.');
    expect(dialog()).toBeNull();
    expect(row('legacy_v1').querySelector('[data-setup="live"]')).not.toBeNull();
    expect(el().querySelector('[data-setup="method-done"]')).toBeNull();
  });

  it('on the bill of materials already: the way back to the area formula is offered even when the check list is not complete', async () => {
    api.answer = (c) => (c.url === 'pricing-setup' ? ok(checklist({ method: 'bom_v1' })) : undefined);
    fixture = await mount(MethodTabComponent, api);
    expect(row('bom_v1').querySelector('[data-setup="live"]')).not.toBeNull();
    expect(row('bom_v1').textContent).not.toContain('It cannot be switched on yet');
    expect(switchOf('legacy_v1')!.disabled).toBeFalse();
  });
});
