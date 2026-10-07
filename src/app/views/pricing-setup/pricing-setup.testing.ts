import { HttpErrorResponse } from '@angular/common/http';
import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';

import { AccessService } from 'src/app/shared/access/access.service';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';
import { AuthService } from 'src/app/shared/services/auth.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { Checklist, Comparison, Figures, SystemDetail, SystemRole, SystemRule } from './pricing-setup.models';

/** What the specs of Pricing setup share: an api that answers by route, and the answers of the contract. */

export interface Call {
  verb: 'get' | 'post' | 'put' | 'delete';
  url: string;
  body?: any;
}

/** The answer of one call, or nothing: the route is not the test's concern. */
export type Answer = (call: Call) => Observable<unknown> | undefined | void;

export const ok = (data: unknown): Observable<unknown> => of({ success: true, status: 1, data });

/** The older routes: HTTP 200 with `status: 0`. */
export const refused200 = (message: string, code = 'validation_failed'): Observable<unknown> => of({ success: false, status: 0, code, message });

export const http = (status: number, body: unknown = {}): Observable<never> => throwError(() => new HttpErrorResponse({ status, error: body }));

export const refused422 = (errors: unknown, message = 'The data is not valid.', code = 'validation_failed'): Observable<never> =>
  http(422, { success: false, status: 0, code, message, data: { errors } });

export class FakeApi {
  calls: Call[] = [];
  answer: Answer = () => undefined;
  me: unknown = null;

  get = (url: string) => this.take({ verb: 'get', url });
  post = (url: string, body?: unknown) => this.take({ verb: 'post', url, body });
  put = (url: string, body?: unknown) => this.take({ verb: 'put', url, body });
  delete = (url: string) => this.take({ verb: 'delete', url });

  private take(call: Call): Observable<unknown> {
    // What the shell asks at sign-in is not a call of the page.
    if (call.url === 'me') return ok(this.me);
    if (call.url === 'subscription') return ok({ status: 'trial', days_left: 14 });
    this.calls.push(call);
    return this.answer(call) ?? ok({});
  }

  /** The calls of the page itself, as "VERB url". */
  get sent(): string[] {
    return this.calls.map((c) => `${c.verb.toUpperCase()} ${c.url}`);
  }

  /** The calls that change something. */
  get writes(): Call[] {
    return this.calls.filter((c) => c.verb !== 'get');
  }

  bodyOf(verb: Call['verb'], url: string): any {
    return this.calls.find((c) => c.verb === verb && c.url === url)?.body;
  }
}

export function meOf(abilities: string[], starter: unknown = { code: 'own_rates', example_rates: false, note: null }): unknown {
  return {
    user: { id: 1, name: 'Asha', email: 'asha@shree.example' },
    company: { id: 6, name: 'Shree Windows', starter_catalogue: starter },
    role: 'owner',
    role_name: 'Owner',
    abilities,
    is_platform_admin: false,
  };
}

export const OWNER = ['prices.view_cost', 'settings.write'];

/** The page under test with the api that answers by route, signed in with the abilities given. */
export async function mount<T>(component: Type<T>, api: FakeApi, inputs: Partial<T> = {}, abilities: string[] = OWNER): Promise<ComponentFixture<T>> {
  api.me = api.me ?? meOf(abilities);
  const toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError', 'showInfo', 'showWarn']);
  TestBed.configureTestingModule({
    imports: [component, RouterTestingModule, NoopAnimationsModule],
    providers: [
      { provide: ApiHttpService, useValue: api },
      { provide: AuthService, useValue: { getToken: () => 'token-1' } },
      { provide: ToastService, useValue: toast },
    ],
  });
  await firstValueFrom(TestBed.inject(AccessService).load());
  const fixture = TestBed.createComponent(component);
  Object.assign(fixture.componentInstance as object, inputs);
  const onChanges = (fixture.componentInstance as any).ngOnChanges;
  // Inputs set by hand: Angular calls ngOnChanges only for a binding of a template.
  if (onChanges) onChanges.call(fixture.componentInstance, Object.fromEntries(Object.keys(inputs).map((key) => [key, { currentValue: (inputs as any)[key], firstChange: true }])));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

export function toastOf(): jasmine.SpyObj<ToastService> {
  return TestBed.inject(ToastService) as jasmine.SpyObj<ToastService>;
}

/** Types into a box the way a hand does. */
export function type(el: Element | null, value: string): void {
  const box = el as HTMLInputElement;
  box.value = value;
  box.dispatchEvent(new Event('input'));
  box.dispatchEvent(new Event('change'));
}

export function button(root: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim() === label)!;
}

/** "/pricing-setup?tab=figures&key=labour_rate" of each link whose words are given. */
export function linkOf(root: Element, words: string): string {
  const a = Array.from(root.querySelectorAll('a')).find((link) => link.textContent!.trim() === words);
  return decodeURIComponent(a?.getAttribute('href') ?? '');
}

export function checklist(over: Partial<Checklist> = {}): Checklist {
  return {
    method: 'legacy_v1',
    methods: [
      { key: 'legacy_v1', label: 'Area formula (the price as it was)' },
      { key: 'bom_v1', label: 'Bill of materials (from your own profiles, rules and hardware sets)' },
    ],
    ready: false,
    missing: [{ code: 'setting_missing', key: 'labour_rate', text: 'The fabrication labour rate per sq ft is not set.' }],
    notes: [],
    unpriced_profiles: [],
    systems: [
      {
        id: 4,
        name: 'Alpha 60 casement',
        category: 'Casement',
        kind: 'casement',
        retired: false,
        ready: false,
        missing: [
          { code: 'role_missing', role: 'steel', text: 'No profile is given for the role Reinforcement steel.' },
          { code: 'no_hardware_set', category: 'casement', text: 'No default hardware set for casement windows.' },
        ],
        hardware_set: null,
        trials: [],
      },
      { id: 9, name: 'Old 50 sliding', category: 'Sliding', kind: 'sliding', retired: true, ready: false, missing: [], hardware_set: null, trials: [] },
    ],
    example: null,
    roles: [],
    charged_by_hardware_set: {},
    packs: [],
    brands: [],
    ...over,
  };
}

export function roleOf(role: string, label: string, over: Partial<SystemRole> = {}): SystemRole {
  return { role, label, what: '', required: false, without_it: null, profile: null, ...over };
}

export function ruleOf(key: string, label: string, over: Partial<SystemRule> = {}): SystemRule {
  return { key, label, unit: 'mm', group: 'general', default: 0, value: null, is_set: false, is_placeholder: null, source: null, notes: null, ...over };
}

export function systemDetail(over: Partial<SystemDetail> = {}): SystemDetail {
  return {
    system: { id: 4, name: 'Alpha 60 casement', series: 'A60', category: 'Casement', system_depth_mm: 60, notes: null, is_verified: false, retired_at: null },
    kind: 'casement',
    retired: false,
    ready: false,
    missing: [],
    settings_ready: true,
    hardware_set: null,
    trials: [],
    roles: [
      roleOf('frame', 'Outer frame', { required: true, profile: { id: 31, profile_code: 'A60-FR', profile_name: 'Alpha 60 outer frame', kg_meter: 1.05, charge_basis: null, rate_meter: null } }),
      roleOf('bead', 'Glazing bead', { required: true }),
    ],
    rule_groups: { general: 'General sizes', welding: 'Welding' },
    rules: [
      ruleOf('weld_allowance_per_end', 'Weld allowance per end', { group: 'welding', default: 3 }),
      ruleOf('bead_deduction', 'Bead deduction', { default: 10, value: 8, is_set: true, is_placeholder: true, source: 'Supplier pack', notes: 'from the manual' }),
      ruleOf('use_supplier_tables', 'Use the supplier tables', { unit: 'flag', default: 0 }),
    ],
    rule_templates: [{ code: 'dcn-zendow', name: 'Deceuninck Zendow' }],
    ...over,
  };
}

export function figures(over: Partial<Figures> = {}): Figures {
  return {
    settings: { profile_rate_kg: null, labour_rate: 55, profile_rate_basis: 'per_kg', labour_mode: 'per_sq_ft', profile_wastage_pct: 6, glass_round_up_mm: 0, new_figure: 2 },
    set_by_company: ['labour_rate'],
    defaults: { profile_wastage_pct: 6, glass_round_up_mm: 0, profile_rate_basis: 'per_kg', labour_mode: 'per_sq_ft' },
    labels: {
      profile_rate_kg: { label: 'Profile rate, white', unit: 'INR per kg' },
      labour_rate: { label: 'Fabrication labour', unit: 'INR per sq ft' },
      profile_rate_basis: { label: 'Profiles are bought', unit: 'per_kg | per_m' },
      labour_mode: { label: 'Labour is charged', unit: 'per_sq_ft' },
      profile_wastage_pct: { label: 'Profile wastage', unit: 'percent' },
      glass_round_up_mm: { label: 'Glass size rounded up to a step of', unit: 'mm' },
    },
    missing: [
      { code: 'setting_missing', key: 'profile_rate_kg', text: 'The profile rate per kg is not set.' },
      { code: 'setting_missing', key: 'steel_rate_kg', text: 'The steel rate per kg is not set.' },
    ],
    glass: [{ id: 2, name: '5mm plain glass', rate: 72, unit: 'Sq M', glass_mm: null }],
    colours: [{ id: 1, name: 'Default', rate_kg: 210 }],
    profiles: [],
    ...over,
  };
}

/** GET pricing-setup/compare (T186): a window both methods price, and two only the old method prices. */
export function comparison(over: Partial<Comparison> = {}): Comparison {
  const bom = {
    profiles: [
      { role: 'frame', code: 'B-frame', name: 'Beta 70 frame', metres: 4.6894, kg: 6.096, amount: 984.78 },
      { role: 'sash+mesh_sash', code: 'B-sash', name: 'Beta 70 sash', metres: 3.2, kg: 4.64, amount: 620 },
      { role: 'reinforcement', code: 'B-steel', name: 'Beta 70 steel', metres: 4.1412, kg: 2.485, amount: 223.62 },
    ],
    glass: [{ name: 'Clear float 5 mm', qty: 10.6562, unit: 'sq ft', amount: 479.53 }],
    hardware_set: { id: 1, code: 'RS-CAS-1', name: 'Casement, espagnolette + hinges or friction stays' },
    hardware: { items: 9, amount: 512.4 },
    figures: { profile_rate_kg: 140, steel_rate_kg: 90, profile_wastage_pct: 6, steel_wastage_pct: 5, glass_wastage_pct: 0, overhead_pct: 10, labour_rate: 25, installation_rate: 40 },
    totals: { material: 2820.33, labour: 322.92, overhead: 314.33, installation: 516.67, cost: 3974.25 },
    warnings: ['The profile system lists no interlock for this number of sliding sashes.'],
  };
  return {
    method: 'legacy_v1',
    scope: { limit: 20, quotation_id: null, as_system_id: null },
    totals: { windows: 3, compared: 2, not_priced: 1, old: 18440, new: 17210.36, difference: -1229.64 },
    windows: [
      {
        line_id: 311, quotation_id: 57, quotation_number: 'Q-0057', label: 'W1', description: 'Casement Openable window', width: 1200, height: 1500, quantity: 2,
        stored: { method: 'legacy_v1', total: 9000 },
        old: { method: 'legacy_v1', priced: true, total: 9000, reason: null },
        new: { method: 'bom_v1', priced: true, total: 7948.5, reason: null, bom },
        compared_as: null,
        difference: -1051.5,
      },
      {
        line_id: 310, quotation_id: 57, quotation_number: 'Q-0057', label: null, description: 'Casement Fixed window', width: 1000, height: 1200, quantity: 1,
        stored: { method: 'legacy_v1', total: 5200 },
        old: { method: 'legacy_v1', priced: true, total: 5200, reason: null },
        new: { method: 'bom_v1', priced: false, total: null, reason: 'profile CAS-F belongs to no profile system, so there are no cutting rules for it.', place: { tab: 'systems' } },
        compared_as: null,
        difference: null,
      },
      {
        line_id: 309, quotation_id: 56, quotation_number: 'Q-0056', label: 'D1', description: 'Casement Openable door', width: 900, height: 2100, quantity: 1,
        stored: { method: 'legacy_v1', total: 9440 },
        old: { method: 'legacy_v1', priced: true, total: 9440, reason: null },
        new: { method: 'bom_v1', priced: false, total: null, reason: 'the labour rate is not set (fabrication labour per sq ft).', place: { tab: 'figures', key: 'labour_rate' } },
        compared_as: null,
        difference: null,
      },
    ],
    ...over,
  };
}
