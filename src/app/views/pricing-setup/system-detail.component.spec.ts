import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ProfileDialogComponent } from '../masters/profile-dialog.component';
import { SystemDetail } from './pricing-setup.models';
import { FakeApi, button, linkOf, mount, ok, refused200, refused422, roleOf, settle, systemDetail, toastOf } from './pricing-setup.testing';
import { SystemDetailComponent } from './system-detail.component';

const FRAME_ROW = {
  id: 31,
  category: 'Casement',
  profile_code: 'A60-FR',
  profile_name: 'Alpha 60 outer frame',
  kg_meter: 1.05,
  rate_meter: 0,
  rate_bar: 0,
  kg_meter_color: null,
  rate_meter_color: null,
  rate_bar_color: null,
  profile_system_id: 4,
  role: 'frame',
  charge_basis: null,
  bar_length_mm: 5800,
  face_width_mm: 62,
  profile_depth_mm: 60,
  rebate_mm: null,
  sightline_mm: null,
};

describe('Pricing setup, one profile system (T182, one place for a profile T187)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<SystemDetailComponent>;
  let detail: SystemDetail;
  const el = (): HTMLElement => fixture.nativeElement;
  const row = (role: string): HTMLElement => el().querySelector(`tr[data-role="${role}"]`)!;
  const errors = (): string[] => Array.from(el().querySelectorAll('[data-setup="role-error"]')).map((p) => p.textContent!.trim());
  const dialog = (): ProfileDialogComponent => fixture.debugElement.query(By.directive(ProfileDialogComponent)).componentInstance;

  /** The api of one system: every change answers the system again. */
  function routes(over: (c: { verb: string; url: string; body?: any }) => ReturnType<FakeApi['answer']> = () => undefined): void {
    api.answer = (c) => {
      const own = over(c);
      if (own) return own;
      if (c.url === 'pricing-setup/systems/4') return ok(detail);
      if (c.url === 'pricing-setup/systems/4/roles') return ok(detail);
      if (c.url === 'product/31') return ok(FRAME_ROW);
      if (c.url === 'product/add') return ok({ ...c.body, id: 77 });
      if (c.url === 'product/update/31') return ok({ ...FRAME_ROW, ...c.body });
      if (c.url === 'product/get-product-list') return ok([{ ...FRAME_ROW, id: 40, profile_code: 'OLD-BD', profile_name: 'Old bead', kg_meter: 0.3, role: null, profile_system_id: null }, FRAME_ROW]);
      return undefined;
    };
  }

  beforeEach(async () => {
    api = new FakeApi();
    detail = systemDetail({
      missing: [
        { code: 'role_missing', role: 'bead', text: 'No profile is given for the role Glazing bead.' },
        { code: 'no_hardware_set', category: 'casement', text: 'No default hardware set for casement windows.' },
      ],
      settings_ready: false,
    });
    detail.roles.push(roleOf('mullion', 'Mullion'), roleOf('transom', 'Transom', { without_it: 'The mullion profile is used for a transom.' }), roleOf('door_sash_in', 'Door sash, opening in'));
    routes();
    fixture = await mount(SystemDetailComponent, api, { id: 4, role: 'bead' });
  });

  it('shows the system, what it misses with a link, the main parts, and the others folded under "More parts"', () => {
    expect(el().querySelector('[data-setup="system-name"]')!.textContent).toBe('Alpha 60 casement');
    expect(el().textContent!.replace(/\s+/g, ' ')).toContain('Casement, 60 mm deep, series A60. 1 of 5 parts have a profile.');
    const missing = el().querySelector('[data-setup="system-missing"]')!;
    expect(missing.textContent).toContain('No profile is given for the role Glazing bead.');
    expect(linkOf(missing, 'Open Hardware sets')).toContain('/pricing-setup?tab=hardware');
    expect(linkOf(missing, 'Open Rates and figures')).toContain('/pricing-setup?tab=figures');

    const parts = (table: string): string[] => Array.from(el().querySelectorAll(`[data-setup="${table}"] tr[data-role]`)).map((tr) => tr.getAttribute('data-role')!);
    expect(parts('roles')).toEqual(['frame', 'bead', 'mullion']);
    expect(parts('roles-more')).toEqual(['transom', 'door_sash_in']);
    const more = el().querySelector<HTMLDetailsElement>('[data-setup="more-parts"]')!;
    expect(more.open).toBe(false);
    expect(more.querySelector('summary')!.textContent).toContain('More parts (0 of 2 have a profile)');
    expect(row('frame').textContent!.replace(/\s+/g, ' ')).toContain('A60-FRAlpha 60 outer frame1.05 kg/mThe company’s way');
    // The part the check list pointed at is marked.
    expect(row('bead').classList).toContain('is-asked');
  });

  it('"More parts" stands open when the check list pointed at one of them', async () => {
    fixture.componentInstance.role = 'transom';
    await settle(fixture);
    expect(el().querySelector<HTMLDetailsElement>('[data-setup="more-parts"]')!.open).toBe(true);
  });

  it('no profile is typed here: an empty part picks a profile of the catalogue that is a part of no system (PUT roles)', async () => {
    expect(el().querySelector('[data-setup="role-form"]')).toBeNull();
    const pick = row('bead').querySelector<HTMLSelectElement>('[data-act="pick"]')!;
    expect(Array.from(pick.options).map((o) => o.textContent!.trim())).toEqual(['Pick a catalogue profile', 'OLD-BD, Old bead']);
    pick.value = '40';
    pick.dispatchEvent(new Event('change'));
    await settle(fixture);

    expect(api.bodyOf('put', 'pricing-setup/systems/4/roles')).toEqual({ roles: [{ role: 'bead', product_id: 40 }] });
    expect(toastOf().showSuccess).toHaveBeenCalledWith('Glazing bead: saved');
  });

  it('"Take out" empties the part and keeps the profile; a refusal is shown in the api\'s words', async () => {
    button(row('frame'), 'Take out').click();
    await settle(fixture);
    expect(api.bodyOf('put', 'pricing-setup/systems/4/roles')).toEqual({ roles: [{ role: 'frame', product_id: null }] });

    routes((c) => (c.verb === 'put' ? refused422(['Profile OLD-BD already plays Glazing bead in "Beta 70".']) : undefined));
    fixture.componentInstance.give(detail.roles[1], 40);
    await settle(fixture);
    expect(errors()).toEqual(['Profile OLD-BD already plays Glazing bead in "Beta 70".']);
  });

  it('"New profile" opens the form of the Catalogue as that part of this system; it is saved by product/add and the system is read again', async () => {
    button(row('bead'), 'New profile').click();
    await settle(fixture);
    const form = dialog();
    expect(form.visible).toBe(true);
    expect(form.form.value).toEqual(jasmine.objectContaining({ category: 'Casement', role: 'bead', profile_system_id: 4 }));

    form.form.patchValue({ profile_code: 'A60-BD', profile_name: 'Alpha 60 bead', kg_meter: '0.27', charge_basis: 'per_m', own_rate_meter: '38', bar_length_mm: '5800' });
    api.calls = [];
    form.submit();
    await settle(fixture);

    // No rate per kg is set in this company: from a system the profile is saved all the same, without a rate of the area formula.
    expect(api.bodyOf('post', 'product/add')).toEqual(
      jasmine.objectContaining({ category: 'Casement', profile_code: 'A60-BD', profile_name: 'Alpha 60 bead', kg_meter: 0.27, rate_bar: 0, role: 'bead', profile_system_id: 4, charge_basis: 'per_m', rate_meter: 38, bar_length_mm: 5800 })
    );
    expect(api.sent).toContain('GET pricing-setup/systems/4');
  });

  it('"Change" opens the same form with the profile as the catalogue holds it; saved unchanged it sends what it read (product/update)', async () => {
    button(row('frame'), 'Change').click();
    await settle(fixture);
    const form = dialog();
    expect(form.profile).toEqual(jasmine.objectContaining({ id: 31, profile_code: 'A60-FR' }));
    expect(form.form.value).toEqual(jasmine.objectContaining({ profile_system_id: 4, role: 'frame', charge_basis: '', bar_length_mm: 5800 }));

    form.submit();
    await settle(fixture);
    // Empty colour figures go as the form shows them (the weight, 0): the api keeps them empty.
    expect(api.bodyOf('post', 'product/update/31')).toEqual(
      jasmine.objectContaining({ profile_code: 'A60-FR', kg_meter: 1.05, kg_meter_color: 1.05, rate_meter: 0, rate_meter_color: 0, role: 'frame', profile_system_id: 4, charge_basis: null, bar_length_mm: 5800, face_width_mm: 62 })
    );
  });

  it('a refusal of the Catalogue route (HTTP 200, status 0) stays in the form in the api\'s words', async () => {
    routes((c) => (c.url === 'product/add' ? refused200("Glazing bead of 'Alpha 60 casement' is held by profile X: take it out of the system first.") : undefined));
    button(row('bead'), 'New profile').click();
    await settle(fixture);
    dialog().form.patchValue({ profile_code: 'A60-BD', profile_name: 'Alpha 60 bead', kg_meter: '0.27' });
    dialog().submit();
    await settle(fixture);
    expect(dialog().error).toBe("Glazing bead of 'Alpha 60 casement' is held by profile X: take it out of the system first.");
    expect(dialog().visible).toBe(true);
  });

  it('the cutting rules are one line until "Customise" is pressed', async () => {
    const line = el().querySelector('[data-setup="rules-line"]')!;
    expect(line.textContent!.replace(/\s+/g, ' ')).toContain('Standard cutting rules in use: 1 rules. 1 are a supplier pack’s values (placeholders: check them against your supplier’s manual).');
    expect(el().querySelector('app-setup-rules')).toBeNull();

    button(el(), 'Customise').click();
    await settle(fixture);
    expect(el().querySelector('app-setup-rules')).not.toBeNull();
    expect(button(el(), 'Hide the rules')).toBeDefined();
  });
});
