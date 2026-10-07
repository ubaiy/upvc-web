import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { FakeApi, button, checklist, mount, ok, refused200, refused422, settle, systemDetail, toastOf, type } from './pricing-setup.testing';
import { SystemsTabComponent } from './systems-tab.component';

describe('Pricing setup, the profile systems (T182)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<SystemsTabComponent>;
  let navigate: jasmine.Spy;
  const el = (): HTMLElement => fixture.nativeElement;
  const row = (name: string): HTMLElement => el().querySelector(`tr[data-system="${name}"]`)!;
  const form = (): HTMLElement => el().querySelector('[data-setup="system-form"]')!;
  const dialog = (): HTMLElement | null => el().querySelector('app-confirm-dialog');

  function routes(over: (c: { verb: string; url: string; body?: any }) => ReturnType<FakeApi['answer']> = () => undefined): void {
    api.answer = (c) => {
      const own = over(c);
      if (own) return own;
      if (c.url === 'pricing-setup') return ok(checklist());
      if (c.url === 'product/get-product-list') return ok([{ id: 31, profile_system_id: 4, role: 'frame' }, { id: 32, profile_system_id: 4, role: 'sash' }, { id: 33, profile_system_id: 4, role: null }, { id: 34, profile_system_id: null, role: null }]);
      if (c.url === 'pricing-setup/systems/4') return ok(systemDetail({ system: { ...systemDetail().system, notes: 'Bought from Alpha' } }));
      if (c.url === 'pricing-setup/systems') return ok(systemDetail({ system: { ...systemDetail().system, ...c.body, id: 12 } }));
      if (c.url.startsWith('pricing-setup/systems/')) return ok(systemDetail());
      return undefined;
    };
  }

  async function start(): Promise<void> {
    fixture = await mount(SystemsTabComponent, api);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    api.calls = [];
  }

  beforeEach(() => {
    api = new FakeApi();
    routes();
  });

  it('lists the systems in use with the type, the profiles that hold a role and the state; the retired ones on request', async () => {
    await start();
    expect(Array.from(el().querySelectorAll('tr[data-system]')).map((tr) => tr.getAttribute('data-system'))).toEqual(['Alpha 60 casement']);
    const cells = Array.from(row('Alpha 60 casement').querySelectorAll('td')).map((td) => td.textContent!.replace(/\s+/g, ' ').trim());
    expect(cells[0]).toMatch(/^Alpha 60 casement ?2 things missing$/);
    expect(cells.slice(1, 4)).toEqual(['Casement', '2', 'Not ready']);

    const toggle = el().querySelector<HTMLButtonElement>('[data-setup="toggle-retired"]')!;
    expect(toggle.textContent!.trim()).toBe('Show retired (1)');
    toggle.click();
    await settle(fixture);
    expect(row('Old 50 sliding').textContent).toContain('Retired');
    expect(row('Old 50 sliding').querySelector('[data-act="retire"]')!.textContent!.trim()).toBe('Bring back');
  });

  it('takes the api\'s own count of profiles with a role where it gives one', async () => {
    const list = checklist();
    list.systems[0] = { ...list.systems[0], profiles: 5, profiles_with_role: 4 };
    routes((c) => (c.url === 'pricing-setup' ? ok(list) : undefined));
    await start();
    expect(row('Alpha 60 casement').querySelectorAll('td')[2].textContent!.trim()).toBe('4');
  });

  it('the list stands without the count when the catalogue does not answer', async () => {
    routes((c) => (c.url === 'product/get-product-list' ? refused200('No.') : undefined));
    await start();
    expect(row('Alpha 60 casement').querySelectorAll('td')[2].textContent!.trim()).toBe('0');
  });

  it('a new system: POST pricing-setup/systems with what was typed, then its own page', async () => {
    await start();
    el().querySelector<HTMLButtonElement>('[data-setup="new-system"]')!.click();
    await settle(fixture);
    button(form(), 'Add the system').click();
    await settle(fixture);
    expect(form().textContent).toContain('Enter a name.');
    expect(api.writes).toEqual([]);

    type(form().querySelector('#sys-name'), ' Beta 70 sliding ');
    const category = form().querySelector<HTMLSelectElement>('#sys-category')!;
    category.value = 'Sliding';
    category.dispatchEvent(new Event('change'));
    type(form().querySelector('#sys-depth'), '70');
    type(form().querySelector('#sys-series'), 'B70');
    await settle(fixture);
    button(form(), 'Add the system').click();
    await settle(fixture);

    expect(api.writes.map((c) => `${c.verb} ${c.url}`)).toEqual(['post pricing-setup/systems']);
    expect(api.writes[0].body).toEqual({ name: 'Beta 70 sliding', category: 'Sliding', system_depth_mm: 70, series: 'B70', notes: null });
    expect(navigate).toHaveBeenCalledWith(['/pricing-setup'], { queryParams: { tab: 'systems', system: 12 } });
    expect(toastOf().showSuccess).toHaveBeenCalledWith('Profile system added');
  });

  it('a refusal (422) is shown in the form and the form stays', async () => {
    routes((c) => (c.url === 'pricing-setup/systems' ? refused422(['A profile system with this name already exists.'], 'A profile system with this name already exists.') : undefined));
    await start();
    el().querySelector<HTMLButtonElement>('[data-setup="new-system"]')!.click();
    await settle(fixture);
    type(form().querySelector('#sys-name'), 'Alpha 60 casement');
    await settle(fixture);
    button(form(), 'Add the system').click();
    await settle(fixture);
    expect(el().querySelector('[data-setup="system-form-error"]')!.textContent).toBe('A profile system with this name already exists.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('rename: the form opens with what the api holds, saves with PUT pricing-setup/systems/{id} and reads the list again', async () => {
    await start();
    row('Alpha 60 casement').querySelector<HTMLButtonElement>('[data-act="rename"]')!.click();
    await settle(fixture);
    expect(api.sent).toEqual(['GET pricing-setup/systems/4']);
    expect((form().querySelector('#sys-name') as HTMLInputElement).value).toBe('Alpha 60 casement');
    expect((form().querySelector('#sys-depth') as HTMLInputElement).value).toBe('60');
    expect((form().querySelector('#sys-series') as HTMLInputElement).value).toBe('A60');
    expect((form().querySelector('#sys-notes') as HTMLInputElement).value).toBe('Bought from Alpha');

    type(form().querySelector('#sys-name'), 'Alpha 60 casement, white');
    await settle(fixture);
    button(form(), 'Save').click();
    await settle(fixture);
    expect(api.writes.map((c) => `${c.verb} ${c.url}`)).toEqual(['put pricing-setup/systems/4']);
    expect(api.writes[0].body).toEqual({ name: 'Alpha 60 casement, white', category: 'Casement', system_depth_mm: 60, series: 'A60', notes: 'Bought from Alpha' });
    expect(api.sent.slice(-2)).toEqual(['GET pricing-setup', 'GET product/get-product-list']);
    expect(navigate).not.toHaveBeenCalled();
    expect(el().querySelector('[data-setup="system-form"]')).toBeNull();
    expect(toastOf().showSuccess).toHaveBeenCalledWith('Profile system saved');
  });

  it('copy: only the name is asked; POST pricing-setup/systems/{id}/copy, then the page of the copy with what came over', async () => {
    routes((c) =>
      c.url === 'pricing-setup/systems/4/copy'
        ? ok({ ...systemDetail({ system: { ...systemDetail().system, id: 12, name: c.body.name } }), copied: { from: 4, profiles: 2, rules: 31, codes: { 'A60-FR': 'A60-FR-C1' } } })
        : undefined
    );
    await start();
    row('Alpha 60 casement').querySelector<HTMLButtonElement>('[data-act="copy"]')!.click();
    await settle(fixture);
    expect((form().querySelector('#sys-name') as HTMLInputElement).value).toBe('Copy of Alpha 60 casement');
    expect(form().textContent).toContain('each under a new code');
    expect(form().querySelector('#sys-depth')).toBeNull();
    expect(form().querySelector('#sys-category')).toBeNull();

    api.calls = [];
    type(form().querySelector('#sys-name'), 'Alpha 70 casement');
    await settle(fixture);
    button(form(), 'Copy the system').click();
    await settle(fixture);
    expect(api.sent).toEqual(['POST pricing-setup/systems/4/copy']);
    expect(api.calls[0].body).toEqual({ name: 'Alpha 70 casement' });
    expect(navigate).toHaveBeenCalledWith(['/pricing-setup'], { queryParams: { tab: 'systems', system: 12 } });
    expect(toastOf().showSuccess).toHaveBeenCalledWith('System copied with 2 profiles and 31 rules.');
  });

  it('a copy the api refuses (422) says why in the form', async () => {
    routes((c) => (c.url === 'pricing-setup/systems/4/copy' ? refused422(["A profile system named 'alpha 70' exists already: give the copy another name."], "A profile system named 'alpha 70' exists already: give the copy another name.") : undefined));
    await start();
    row('Alpha 60 casement').querySelector<HTMLButtonElement>('[data-act="copy"]')!.click();
    await settle(fixture);
    button(form(), 'Copy the system').click();
    await settle(fixture);
    expect(el().querySelector('[data-setup="system-form-error"]')!.textContent).toBe("A profile system named 'alpha 70' exists already: give the copy another name.");
    expect(navigate).not.toHaveBeenCalled();
  });

  it('retire asks first and says nothing is deleted; after the yes POST retire and the list is read again', async () => {
    await start();
    row('Alpha 60 casement').querySelector<HTMLButtonElement>('[data-act="retire"]')!.click();
    await settle(fixture);
    expect(dialog()!.textContent).toContain('Retire Alpha 60 casement?');
    expect(dialog()!.textContent).toContain('Nothing is deleted.');
    expect(api.writes).toEqual([]);

    Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Retire it')!.click();
    await settle(fixture);
    expect(api.writes.map((c) => `${c.verb} ${c.url}`)).toEqual(['post pricing-setup/systems/4/retire']);
    expect(api.writes[0].body).toEqual({ retired: true });
    expect(api.sent).toContain('GET pricing-setup');
    expect(dialog()).toBeNull();
    expect(toastOf().showSuccess).toHaveBeenCalledWith('Profile system retired');
  });

  it('a retired system is brought back with retired: false', async () => {
    await start();
    el().querySelector<HTMLButtonElement>('[data-setup="toggle-retired"]')!.click();
    await settle(fixture);
    row('Old 50 sliding').querySelector<HTMLButtonElement>('[data-act="retire"]')!.click();
    await settle(fixture);
    Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Bring it back')!.click();
    await settle(fixture);
    expect(api.writes[0].url).toBe('pricing-setup/systems/9/retire');
    expect(api.writes[0].body).toEqual({ retired: false });
  });
});
