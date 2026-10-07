import { ComponentFixture } from '@angular/core/testing';

import { SystemDetail } from './pricing-setup.models';
import { FakeApi, button, linkOf, mount, ok, refused422, roleOf, settle, systemDetail, toastOf, type } from './pricing-setup.testing';
import { SystemDetailComponent } from './system-detail.component';

const FRAME_ROW = {
  id: 31,
  category: 'Casement',
  profile_code: 'A60-FR',
  profile_name: 'Alpha 60 outer frame',
  kg_meter: 1.05,
  rate_meter: 0,
  rate_bar: 0,
  kg_meter_color: 1.05,
  rate_meter_color: 0,
  rate_bar_color: 0,
  profile_system_id: 4,
  role: 'frame',
  face_width_mm: 62,
  profile_depth_mm: 60,
  rebate_mm: null,
  sightline_mm: null,
};

describe('Pricing setup, one profile system (T182)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<SystemDetailComponent>;
  let detail: SystemDetail;
  const el = (): HTMLElement => fixture.nativeElement;
  const row = (role: string): HTMLElement => el().querySelector(`tr[data-role="${role}"]`)!;
  const form = (): HTMLElement => el().querySelector('[data-setup="role-form"]')!;
  const errors = (): string[] => Array.from(el().querySelectorAll('[data-setup="role-form-error"]')).map((p) => p.textContent!.trim());

  /** The api of one system: every change answers the system again. */
  function routes(over: (c: { verb: string; url: string; body?: any }) => ReturnType<FakeApi['answer']> = () => undefined): void {
    api.answer = (c) => {
      const own = over(c);
      if (own) return own;
      if (c.url === 'pricing-setup/systems/4') return ok(detail);
      if (c.url === 'pricing-setup/systems/4/roles') return ok(detail);
      if (c.url === 'pricing-setup/profiles') return ok({ profile: { ...FRAME_ROW, ...c.body, id: 77 } });
      if (c.url === 'product/31') return ok(FRAME_ROW);
      if (c.url === 'pricing-setup/profiles/31') return ok({ profile: { ...FRAME_ROW, ...c.body } });
      if (c.url === 'product/get-product-list') return ok([{ ...FRAME_ROW, id: 40, profile_code: 'OLD-BD', profile_name: 'Old bead', kg_meter: 0.3, role: null, profile_system_id: null }, FRAME_ROW]);
      return undefined;
    };
  }

  async function open(role: string): Promise<void> {
    row(role).querySelector<HTMLButtonElement>('[data-act="role"]')!.click();
    await settle(fixture);
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
    routes();
    fixture = await mount(SystemDetailComponent, api, { id: 4, role: 'bead' });
  });

  it('shows the system, what it misses with a link, and each role with its profile, weight, basis and rate', () => {
    expect(el().querySelector('[data-setup="system-name"]')!.textContent).toBe('Alpha 60 casement');
    expect(el().textContent!.replace(/\s+/g, ' ')).toContain('Casement, 60 mm deep, series A60. 1 of 2 roles have a profile.');
    const missing = el().querySelector('[data-setup="system-missing"]')!;
    expect(missing.textContent).toContain('No profile is given for the role Glazing bead.');
    expect(linkOf(missing, 'Open Hardware sets')).toContain('/pricing-setup?tab=hardware');
    expect(linkOf(missing, 'Open Rates and figures')).toContain('/pricing-setup?tab=figures');

    const frame = Array.from(row('frame').querySelectorAll('td')).map((td) => td.textContent!.replace(/\s+/g, ' ').trim());
    expect(frame[1]).toMatch(/^A60-FR ?Alpha 60 outer frame$/);
    expect(frame.slice(2, 5)).toEqual(['1.05 kg/m', 'The company’s way', '']);
    expect(row('frame').querySelector('[data-act="role"]')!.textContent!.trim()).toBe('Change');
    expect(row('bead').textContent).toContain('No profile');
    expect(row('bead').querySelector('[data-act="role"]')!.textContent!.trim()).toBe('Add profile');
    // The role the check list pointed at is marked.
    expect(row('bead').classList).toContain('is-asked');
  });

  it('a new profile: the profile first (POST pricing-setup/profiles, no rate of the area formula), then its role, weight, basis and rate (PUT roles)', async () => {
    await open('bead');
    type(form().querySelector('#role-code'), ' A60-BD ');
    type(form().querySelector('#role-name'), 'Alpha 60 bead');
    type(form().querySelector('#role-kg'), '0.28');
    const basis = form().querySelector<HTMLSelectElement>('#role-basis')!;
    basis.value = 'per_m';
    basis.dispatchEvent(new Event('change'));
    type(form().querySelector('#role-rate'), '42');
    type(form().querySelector('#role-face'), '18');
    await settle(fixture);

    detail = systemDetail({ roles: [detail.roles[0], roleOf('bead', 'Glazing bead', { profile: { id: 77, profile_code: 'A60-BD', profile_name: 'Alpha 60 bead', kg_meter: 0.28, charge_basis: 'per_m', rate_meter: 42 } })] });
    button(form(), 'Save the profile').click();
    await settle(fixture);

    expect(api.writes.map((c) => `${c.verb} ${c.url}`)).toEqual(['post pricing-setup/profiles', 'put pricing-setup/systems/4/roles']);
    expect(api.writes[0].body).toEqual({
      category: 'Casement',
      profile_code: 'A60-BD',
      profile_name: 'Alpha 60 bead',
      kg_meter: 0.28,
      rate_meter: 42,
      face_width_mm: 18,
      profile_depth_mm: null,
      rebate_mm: null,
      sightline_mm: null,
    });
    expect(api.writes[1].body).toEqual({ roles: [{ role: 'bead', product_id: 77, kg_meter: 0.28, charge_basis: 'per_m', rate_meter: 42 }] });
    expect(el().querySelector('[data-setup="role-form"]')).toBeNull();
    expect(row('bead').textContent).toContain('A60-BD');
    expect(row('bead').textContent).toContain('₹42.00');
    expect(toastOf().showSuccess).toHaveBeenCalledWith('Glazing bead: saved');
  });

  it('nothing is sent while the form is not complete: code, name, weight, and the rate of a profile bought per metre', async () => {
    await open('bead');
    button(form(), 'Save the profile').click();
    await settle(fixture);
    expect(form().textContent).toContain('Enter the code.');
    expect(form().textContent).toContain('Enter the name.');
    expect(form().textContent).toContain('Enter the weight per metre, above 0 and up to 100.');

    type(form().querySelector('#role-code'), 'A60-BD');
    type(form().querySelector('#role-name'), 'Alpha 60 bead');
    type(form().querySelector('#role-kg'), '0.28');
    const basis = form().querySelector<HTMLSelectElement>('#role-basis')!;
    basis.value = 'per_m';
    basis.dispatchEvent(new Event('change'));
    await settle(fixture);
    button(form(), 'Save the profile').click();
    await settle(fixture);
    expect(form().textContent).toContain('A profile bought per metre needs its rate.');
    expect(api.writes).toEqual([]);
  });

  it('a refusal (422) is shown in the form in the api\'s words, and no role is sent', async () => {
    routes((c) => (c.url === 'pricing-setup/profiles' ? refused422(['profile_code is already used by another profile']) : undefined));
    await open('bead');
    type(form().querySelector('#role-code'), 'A60-FR');
    type(form().querySelector('#role-name'), 'Alpha 60 bead');
    type(form().querySelector('#role-kg'), '0.28');
    await settle(fixture);
    button(form(), 'Save the profile').click();
    await settle(fixture);

    expect(errors()).toEqual(['profile_code is already used by another profile']);
    expect(api.writes.map((c) => c.url)).toEqual(['pricing-setup/profiles']);
    expect(form()).not.toBeNull();
  });

  it('a refusal of the role (422) shows each sentence, and a second save does not add the profile twice', async () => {
    let refuse = true;
    routes((c) => (c.url === 'pricing-setup/systems/4/roles' && refuse ? refused422(['Glazing bead: the weight per metre must be at most 100.'], 'The profiles were not saved.') : undefined));
    await open('bead');
    type(form().querySelector('#role-code'), 'A60-BD');
    type(form().querySelector('#role-name'), 'Alpha 60 bead');
    type(form().querySelector('#role-kg'), '0.28');
    await settle(fixture);
    button(form(), 'Save the profile').click();
    await settle(fixture);
    expect(errors()).toEqual(['Glazing bead: the weight per metre must be at most 100.']);

    refuse = false;
    button(form(), 'Save the profile').click();
    await settle(fixture);
    expect(api.writes.map((c) => c.url)).toEqual(['pricing-setup/profiles', 'pricing-setup/systems/4/roles', 'pricing-setup/systems/4/roles']);
    expect(api.writes[2].body.roles[0].product_id).toBe(77);
  });

  it('a profile already in the catalogue: only the role is sent, with the weight shown', async () => {
    await open('bead');
    const pick = form().querySelector<HTMLInputElement>('input[type="radio"][value="pick"]')!;
    pick.click();
    await settle(fixture);
    const select = form().querySelector<HTMLSelectElement>('#role-pick')!;
    // Only the profile that holds no role is offered.
    expect(Array.from(select.options).map((o) => o.textContent!.trim())).toEqual(['Choose a profile', 'OLD-BD, Old bead']);
    select.selectedIndex = 1;
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    button(form(), 'Save the profile').click();
    await settle(fixture);

    expect(api.writes.map((c) => c.url)).toEqual(['pricing-setup/systems/4/roles']);
    expect(api.writes[0].body).toEqual({ roles: [{ role: 'bead', product_id: 40, kg_meter: 0.3, charge_basis: null }] });
  });

  it('a change of weight alone leaves the catalogue row; a change of name saves it first with every field it had', async () => {
    await open('frame');
    expect(api.sent).toContain('GET product/31');
    expect((form().querySelector('#role-face') as HTMLInputElement).value).toBe('62');
    type(form().querySelector('#role-kg'), '1.1');
    await settle(fixture);
    button(form(), 'Save the profile').click();
    await settle(fixture);
    expect(api.writes.map((c) => c.url)).toEqual(['pricing-setup/systems/4/roles']);
    expect(api.writes[0].body).toEqual({ roles: [{ role: 'frame', product_id: 31, kg_meter: 1.1, charge_basis: null }] });

    api.calls = [];
    await open('frame');
    type(form().querySelector('#role-name'), 'Alpha 60 frame, new die');
    await settle(fixture);
    button(form(), 'Save the profile').click();
    await settle(fixture);
    expect(api.writes.map((c) => `${c.verb} ${c.url}`)).toEqual(['put pricing-setup/profiles/31', 'put pricing-setup/systems/4/roles']);
    // Only the name, the code and the sizes: a profile of the catalogue keeps its rates.
    expect(api.writes[0].body).toEqual(jasmine.objectContaining({ profile_code: 'A60-FR', profile_name: 'Alpha 60 frame, new die' }));
    expect(Object.keys(api.writes[0].body).sort()).toEqual(['face_width_mm', 'profile_code', 'profile_depth_mm', 'profile_name', 'rebate_mm', 'sightline_mm']);
  });

  it('the bar length is sent with the role when it is typed, null when it is emptied, and not at all when it is left', async () => {
    detail = systemDetail({ roles: [{ ...detail.roles[0], profile: { ...detail.roles[0].profile!, bar_length_mm: 5800 } }, detail.roles[1]] });
    fixture.componentInstance.load();
    await settle(fixture);

    await open('frame');
    const bar = (): HTMLInputElement => form().querySelector('#role-bar')!;
    expect(bar().value).toBe('5800');
    type(bar(), '120');
    await settle(fixture);
    button(form(), 'Save the profile').click();
    await settle(fixture);
    expect(form().textContent).toContain('A whole number of mm from 500 to 20000');
    expect(api.writes).toEqual([]);

    type(bar(), '6000');
    await settle(fixture);
    button(form(), 'Save the profile').click();
    await settle(fixture);
    expect(api.writes[0].body).toEqual({ roles: [{ role: 'frame', product_id: 31, kg_meter: 1.05, charge_basis: null, bar_length_mm: 6000 }] });

    api.calls = [];
    await open('frame');
    type(bar(), '');
    await settle(fixture);
    button(form(), 'Save the profile').click();
    await settle(fixture);
    expect(api.writes[0].body.roles[0].bar_length_mm).toBeNull();

    api.calls = [];
    await open('frame');
    button(form(), 'Save the profile').click();
    await settle(fixture);
    expect('bar_length_mm' in api.writes[0].body.roles[0]).toBeFalse();
  });

  it('"Take it out of this role" empties the role and keeps the profile', async () => {
    await open('frame');
    button(form(), 'Take it out of this role').click();
    await settle(fixture);
    expect(api.writes.map((c) => `${c.verb} ${c.url}`)).toEqual(['put pricing-setup/systems/4/roles']);
    expect(api.writes[0].body).toEqual({ roles: [{ role: 'frame', product_id: null }] });
    expect(toastOf().showSuccess).toHaveBeenCalledWith('Outer frame: the role is empty now');
  });

  it('"Delete the profile" asks first; after the yes the role is emptied, then the profile removed; a refusal stays in the dialog', async () => {
    routes((c) => (c.verb === 'delete' && c.url === 'pricing-setup/profiles/31' ? refused422(['This profile is used by quotation Q-0012 and cannot be removed.'], 'This profile is used by quotation Q-0012 and cannot be removed.', 'in_use') : undefined));
    await open('frame');
    button(form(), 'Delete the profile').click();
    await settle(fixture);
    const dialog = el().querySelector('app-confirm-dialog')!;
    expect(dialog.textContent).toContain('Delete A60-FR?');
    expect(api.writes).toEqual([]);

    Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Delete the profile')!.click();
    await settle(fixture);
    expect(api.writes.map((c) => c.url)).toEqual(['pricing-setup/systems/4/roles', 'pricing-setup/profiles/31']);
    expect(el().querySelector('app-confirm-dialog')!.textContent).toContain('This profile is used by quotation Q-0012 and cannot be removed.');
  });
});
