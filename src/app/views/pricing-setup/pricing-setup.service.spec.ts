import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';

import { ApiHttpService } from 'src/app/shared/services/api-http.service';
import { SetupRefusal, refusalsFor, refusalsLeft, typedNumber } from './pricing-setup.models';
import { PricingSetupService, toFigures, toRefusal } from './pricing-setup.service';
import { FakeApi, http, ok, refused200, refused422 } from './pricing-setup.testing';

const failure = (call: Observable<unknown>): Promise<SetupRefusal> =>
  firstValueFrom(call).then(
    () => fail('the call was not refused') as never,
    (e) => e as SetupRefusal
  );

describe('PricingSetupService (T182)', () => {
  let api: FakeApi;
  let service: PricingSetupService;

  beforeEach(() => {
    api = new FakeApi();
    TestBed.configureTestingModule({ providers: [{ provide: ApiHttpService, useValue: api }] });
    service = TestBed.inject(PricingSetupService);
  });

  describe('each route and its body', () => {
    const routes: [string, (s: PricingSetupService) => Observable<unknown>, string, unknown?][] = [
      ['the check list', (s) => s.checklist(), 'GET pricing-setup'],
      ['one system', (s) => s.system(4), 'GET pricing-setup/systems/4'],
      ['a new system', (s) => s.addSystem({ name: 'Alpha 60', category: 'Casement', system_depth_mm: 60 }), 'POST profile-system/add', { name: 'Alpha 60', category: 'Casement', system_depth_mm: 60 }],
      ['a renamed system', (s) => s.updateSystem(4, { name: 'Alpha 70', category: 'Casement', system_depth_mm: 70, series: null }), 'POST profile-system/update/4', { name: 'Alpha 70', category: 'Casement', system_depth_mm: 70, series: null }],
      ['a copy', (s) => s.copySystem(4, 'Alpha 70'), 'POST pricing-setup/systems/4/copy', { name: 'Alpha 70' }],
      ['retire', (s) => s.retire(4, true), 'POST pricing-setup/systems/4/retire', { retired: true }],
      ['bring back', (s) => s.retire(4, false), 'POST pricing-setup/systems/4/retire', { retired: false }],
      ['roles', (s) => s.saveRoles(4, [{ role: 'frame', product_id: 31, kg_meter: 1.05, charge_basis: null }]), 'PUT pricing-setup/systems/4/roles', { roles: [{ role: 'frame', product_id: 31, kg_meter: 1.05, charge_basis: null }] }],
      ['rules', (s) => s.saveRules(4, { bead_deduction: 8, weld: null }), 'PUT pricing-setup/systems/4/rules', { rules: { bead_deduction: 8, weld: null } }],
      ['a pack of rules alone', (s) => s.saveRules(4, {}, 'dcn-zendow'), 'PUT pricing-setup/systems/4/rules', { template: 'dcn-zendow' }],
      ['the note of a rule', (s) => s.saveRuleNote(4, 'bead_deduction', 8, 'measured'), 'POST profile-system/4/rules/add', { rule_key: 'bead_deduction', value_mm: 8, notes: 'measured' }],
      ['one profile', (s) => s.product(31), 'GET product/31'],
      ['the profiles', (s) => s.products(), 'GET product/get-product-list'],
      ['a new profile', (s) => s.addProduct({ profile_code: 'A60-FR' }), 'POST product/add', { profile_code: 'A60-FR' }],
      ['a changed profile', (s) => s.updateProduct(31, { profile_name: 'Frame' }), 'POST product/update/31', { profile_name: 'Frame' }],
      ['a removed profile', (s) => s.deleteProduct(31), 'POST product/delete/31', undefined],
      ['the figures', (s) => s.figures(), 'GET pricing-setup/settings'],
      ['saved figures', (s) => s.saveFigures({ settings: { labour_rate: 55 } }), 'PUT pricing-setup/settings', { settings: { labour_rate: 55 } }],
      ['the method', (s) => s.setMethod('bom_v1'), 'PUT pricing-setup/method', { method: 'bom_v1' }],
      ['the hardware sets', (s) => s.hardwareSets(), 'GET hardware-sets'],
      ['one hardware set', (s) => s.hardwareSet(3), 'GET hardware-sets/3'],
      ['a pack copied in', (s) => s.addHardwareSet({ pack: 'RS-CAS-1' }), 'POST hardware-sets', { pack: 'RS-CAS-1' }],
      ['a changed set', (s) => s.updateHardwareSet(3, { is_default: true }), 'PUT hardware-sets/3', { is_default: true }],
      ['a deleted set', (s) => s.deleteHardwareSet(3), 'DELETE hardware-sets/3'],
      ['a new line', (s) => s.addHardwareRule(3, { item_name: 'Handle' }), 'POST hardware-sets/3/rules', { item_name: 'Handle' }],
      ['a changed line', (s) => s.updateHardwareRule(12, { qty_factor: 2 }), 'PUT hardware-sets/rules/12', { qty_factor: 2 }],
      ['a removed line', (s) => s.deleteHardwareRule(12), 'DELETE hardware-sets/rules/12'],
      ['the hardware items', (s) => s.hardwareItems(), 'GET costhead/list'],
    ];

    for (const [what, call, route, body] of routes) {
      it(`${what}: ${route}`, async () => {
        api.answer = () => ok({});
        await firstValueFrom(call(service));
        expect(api.sent).toEqual([route]);
        expect(api.calls[0].body).toEqual(body);
      });
    }
  });

  it('hands back `data` of a yes', async () => {
    api.answer = () => ok({ system: { id: 4 } });
    expect(await firstValueFrom(service.system(4))).toEqual({ system: { id: 4 } } as any);
  });

  it('a refusal with HTTP 200 and status 0 (the older routes) is a refusal, in the api\'s words', async () => {
    api.answer = () => refused200('profile_code is already used by another profile');
    const e = await failure(service.addProduct({ profile_code: 'A60-FR' }));
    expect(e instanceof SetupRefusal).toBeTrue();
    expect(e.message).toBe('profile_code is already used by another profile');
    expect(e.status).toBe(200);
    expect(e.code).toBe('validation_failed');
  });

  it('a 200 without words takes the sentence of the screen', async () => {
    api.answer = () => refused200('');
    expect((await failure(service.addSystem({ name: 'x', category: 'Casement', system_depth_mm: 60 }))).message).toBe('The profile system was not added.');
    expect((await failure(service.deleteProduct(3))).message).toBe('The profile was not removed.');
  });

  it('a 422 carries each sentence of data.errors, a list or a list by field', async () => {
    api.answer = () => refused422(['Opening sash: the weight per metre must be above 0.', 'Glazing bead: a profile bought per metre needs its rate.'], 'The profiles were not saved.');
    let e = await failure(service.saveRoles(4, []));
    expect(e.message).toBe('The profiles were not saved.');
    expect(e.errors).toEqual(['Opening sash: the weight per metre must be above 0.', 'Glazing bead: a profile bought per metre needs its rate.']);
    expect(e.status).toBe(422);

    api.answer = () => refused422({ labour_rate: ['The labour rate must be 0 or more.'], overhead_pct: 'The overhead must be at most 100.' }, '');
    e = await failure(service.saveFigures({}));
    expect(e.errors).toEqual(['The labour rate must be 0 or more.', 'The overhead must be at most 100.']);
    expect(e.message).toBe('The labour rate must be 0 or more.');
  });

  it('422 not_ready of the method keeps the code and every missing sentence', async () => {
    api.answer = () => refused422(['The profile rate per kg is not set.', 'No profile system is ready.'], 'The bill of materials is not ready.', 'not_ready');
    const e = await failure(service.setMethod('bom_v1'));
    expect(e.code).toBe('not_ready');
    expect(e.errors.length).toBe(2);
  });

  it('says a failure in words of the screen: no connection, 403, 404, 429, and never the text of a 500', () => {
    expect(toRefusal(new HttpErrorResponse({ status: 0 }), 'x').message).toContain('could not reach the server');
    expect(toRefusal(new HttpErrorResponse({ status: 403, error: {} }), 'x').message).toContain('Your role cannot do this');
    expect(toRefusal(new HttpErrorResponse({ status: 403, error: { message: 'Only the owner.' } }), 'x').message).toBe('Only the owner.');
    expect(toRefusal(new HttpErrorResponse({ status: 404, error: { message: 'No query results for model' } }), 'x').message).toBe('This was not found. It may have been removed.');
    expect(toRefusal(new HttpErrorResponse({ status: 429 }), 'x').message).toContain('Too many requests');
    expect(toRefusal(new HttpErrorResponse({ status: 500, error: { message: 'SQLSTATE[HY000]' } }), 'The rules were not saved.').message).toBe('The rules were not saved.');
    expect(toRefusal(new Error('boom'), 'x').message).toBe('boom');
    const own = new SetupRefusal('kept');
    expect(toRefusal(own, 'x')).toBe(own);
  });

  it('a failed removal of a line is a refusal too', async () => {
    api.answer = () => http(404);
    expect((await failure(service.deleteHardwareRule(12))).message).toBe('This was not found. It may have been removed.');
  });

  it('puts every list of the check list, the sets and the figures in place, whatever the api left out', async () => {
    api.answer = () => ok({ method: 'legacy_v1', ready: false });
    const list = await firstValueFrom(service.checklist());
    expect([list.methods, list.missing, list.notes, list.unpriced_profiles, list.systems, list.roles]).toEqual([[], [], [], [], [], []]);
    expect(list.example).toBeNull();

    api.answer = () => ok({});
    expect(await firstValueFrom(service.hardwareSets())).toEqual({ sets: [], packs: [], categories: [] });
    expect(toFigures({} as any)).toEqual({ settings: {}, set_by_company: [], defaults: {}, labels: {}, missing: [], glass: [], colours: [] });

    api.answer = () => ok('no list');
    expect(await firstValueFrom(service.products())).toEqual([]);
  });

  it('offers the hardware items of the catalogue, not the glass', async () => {
    api.answer = () =>
      ok([
        { id: 1, name: 'Handle', cost: '28.32', unit: 'Unit', costhead: 'Hardware' },
        { id: 2, name: '5mm plain glass', cost: 72, unit: 'Sq M', costhead: 'Glazzing' },
      ]);
    expect(await firstValueFrom(service.hardwareItems())).toEqual([{ id: 1, name: 'Handle', cost: 28.32, unit: 'Unit', costhead: 'Hardware' }]);
  });

  it('gives a refusal to the row it names and leaves the rest for the foot of the form', () => {
    const errors = ['Opening sash: the weight per metre must be above 0.', "The rule 'bead_deduction' must be a number.", 'Nothing was saved.'];
    expect(refusalsFor(errors, 'Opening sash')).toEqual([errors[0]]);
    expect(refusalsFor(errors, 'bead_deduction')).toEqual([errors[1]]);
    expect(refusalsFor(errors, '')).toEqual([]);
    expect(refusalsLeft(errors, ['Opening sash', 'bead_deduction'])).toEqual(['Nothing was saved.']);
    expect([typedNumber(''), typedNumber(' 2.5 '), typedNumber(0)]).toEqual([null, 2.5, 0]);
    expect(Number.isNaN(typedNumber('abc') as number)).toBeTrue();
  });
});
