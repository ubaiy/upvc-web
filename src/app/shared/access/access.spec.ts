import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, Observable, firstValueFrom, of, throwError } from 'rxjs';

import { quiet } from '../interceptors/request-options';
import { ApiHttpService } from '../services/api-http.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { AbilityGuard } from './ability.guard';
import { AccessInterceptor, LOCKED_REFUSAL } from './access.interceptor';
import { AccessState, EMPTY_ACCESS, Me, SubscriptionInfo, allows, bannerFor, has3d, homeFor } from './access.models';
import { AccessService } from './access.service';
import { CanDirective } from './can.directive';

const SALES = ['quotations.view', 'quotations.write', 'orders.view', 'orders.write', 'production.view', 'production.write', 'payments.view', 'catalogue.view'];
const WORKSHOP = ['orders.view', 'production.view', 'production.write'];

export function me(abilities: string[], role = 'sales', roleName = 'Sales'): Me {
  return { user: { id: 7, name: 'Ravi', email: 'ravi@example.com' }, company: { id: 1, name: 'Hakimi Enterprise' }, role, role_name: roleName, abilities, is_platform_admin: false };
}

export function subscription(changes: Partial<SubscriptionInfo> = {}): SubscriptionInfo {
  return {
    company: { id: 1, name: 'Hakimi Enterprise' },
    status: 'active',
    read_only: false,
    plan: { code: 'growth', name: 'Growth', price: 2499, seats: 5, features: { feature_3d: false } },
    trial_ends_at: null,
    current_period_ends_at: null,
    ends_on: null,
    grace_ends_on: null,
    days_left: null,
    seats: { used: 3, allowed: 5 },
    features: { feature_3d: false },
    ...changes,
  };
}

describe('access: what the abilities of GET me open', () => {
  const state = (abilities: string[] | null): AccessState => ({ me: abilities ? me(abilities) : null, subscription: null });

  it('asks the abilities list, and hides nothing while it is not known', () => {
    expect(allows(state(SALES), 'quotations.write')).toBeTrue();
    expect(allows(state(SALES), 'prices.view_cost')).toBeFalse();
    expect(allows(state(SALES), 'team.manage')).toBeFalse();
    expect(allows(state(SALES), undefined)).withContext('a page that needs nothing').toBeTrue();
    expect(allows(state(null), 'team.manage')).withContext('not known: the api is the control').toBeTrue();
  });

  it('never decides by the name of the role', () => {
    const odd: AccessState = { me: me(['team.manage'], 'workshop', 'Workshop'), subscription: null };
    expect(allows(odd, 'team.manage')).toBeTrue();
    const owner: AccessState = { me: me([], 'owner', 'Owner'), subscription: null };
    expect(allows(owner, 'team.manage')).toBeFalse();
  });

  it('opens a workshop user on Orders and anyone with quotations on Home', () => {
    expect(homeFor(state(SALES))).toBe('/dashboard');
    expect(homeFor(state(WORKSHOP))).toBe('/orders');
    expect(homeFor(state([]))).toBe('/no-access');
  });

  it('3D follows the effective features of GET subscription', () => {
    expect(has3d({ me: null, subscription: subscription() })).toBeFalse();
    expect(has3d({ me: null, subscription: subscription({ features: { feature_3d: true } }) })).toBeTrue();
    expect(has3d(EMPTY_ACCESS)).withContext('not known').toBeTrue();
  });
});

describe('access: the banner of the plan', () => {
  it('says nothing for a paying company or a trial with more than 7 days', () => {
    expect(bannerFor(subscription())).toBeNull();
    expect(bannerFor(subscription({ status: 'trial', days_left: 8, ends_on: '2026-10-13' }))).toBeNull();
    expect(bannerFor(null)).toBeNull();
  });

  it('a trial ending within 7 days, payment due, locked and suspended', () => {
    expect(bannerFor(subscription({ status: 'trial', days_left: 7 }))?.text).toBe('Your free trial ends in 7 days.');
    expect(bannerFor(subscription({ status: 'trial', days_left: 1 }))?.text).toBe('Your free trial ends in 1 day.');
    expect(bannerFor(subscription({ status: 'trial', days_left: 0 }))?.text).toBe('Your free trial ends today.');
    const grace = bannerFor(subscription({ status: 'grace', days_left: 4, grace_ends_on: '2026-10-09' }));
    expect(grace).toEqual({ tone: 'warn', text: 'Payment is due. The account becomes read-only after 9 Oct 2026.' });
    expect(bannerFor(subscription({ status: 'locked', read_only: true }))?.tone).toBe('danger');
    expect(bannerFor(subscription({ status: 'locked', read_only: true }))?.text).toContain('read-only');
    expect(bannerFor(subscription({ status: 'suspended', read_only: true }))?.text).toContain('suspended');
  });
});

describe('AccessService', () => {
  let get: jasmine.Spy;
  let token: string | null;
  let service: AccessService;

  beforeEach(() => {
    token = 'token-1';
    get = jasmine.createSpy('get').and.callFake((url: string) =>
      url === 'me' ? of({ success: true, data: me(SALES) }) : of({ success: true, data: subscription() })
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiHttpService, useValue: { get } },
        { provide: AuthService, useValue: { getToken: () => token } },
      ],
    });
    service = TestBed.inject(AccessService);
  });

  it('asks GET me and GET subscription once for a sign-in', async () => {
    const first = await firstValueFrom(service.load());
    expect(first.me?.role).toBe('sales');
    expect(first.subscription?.plan?.code).toBe('growth');
    await firstValueFrom(service.load());
    expect(get.calls.allArgs().map((args) => args[0])).toEqual(['me', 'subscription']);
    expect(service.can('quotations.write')).toBeTrue();
    expect(service.can('catalogue.write')).toBeFalse();
    expect(service.has3d).toBeFalse();
  });

  it('asks again for the next person who signs in on this browser', async () => {
    await firstValueFrom(service.load());
    token = 'token-2';
    get.and.callFake((url: string) => (url === 'me' ? of({ success: true, data: me(WORKSHOP, 'workshop', 'Workshop') }) : of({ success: true, data: subscription() })));
    const next = await firstValueFrom(service.load());
    expect(next.me?.role).toBe('workshop');
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('hides nothing when GET me could not be read, and asks again on the next page', async () => {
    get.and.callFake((url: string) => (url === 'me' ? throwError(() => new Error('offline')) : of({ success: true, data: subscription() })));
    const known = await firstValueFrom(service.load());
    expect(known.me).toBeNull();
    expect(service.can('team.manage')).toBeTrue();
    await firstValueFrom(service.load());
    expect(get.calls.allArgs().filter((args) => args[0] === 'me').length).toBe(2);
  });

  it('reads the plan again on demand (after a 402, after the team changed)', async () => {
    await firstValueFrom(service.load());
    get.and.returnValue(of({ success: true, data: subscription({ status: 'locked', read_only: true }) }));
    service.refreshSubscription();
    expect(service.readOnly).toBeTrue();
    expect(service.state.me?.role).withContext('the user is kept').toBe('sales');
  });
});

@Component({ template: '' })
class BlankComponent {}

describe('AbilityGuard', () => {
  let guard: AbilityGuard;
  let router: Router;
  let known: AccessState;
  let signedIn: boolean;

  const ask = async (url: string, ability?: string): Promise<boolean | string> => {
    const answer = guard.canActivate({ data: ability ? { ability } : {} } as any, { url } as any);
    const value = answer instanceof Observable ? await firstValueFrom(answer) : answer;
    return value instanceof UrlTree ? router.serializeUrl(value) : value;
  };

  beforeEach(() => {
    signedIn = true;
    known = { me: me(SALES), subscription: null };
    TestBed.configureTestingModule({
      declarations: [BlankComponent],
      imports: [RouterTestingModule.withRoutes([{ path: '**', component: BlankComponent }])],
      providers: [
        { provide: AuthService, useValue: { getToken: () => (signedIn ? 'token' : null) } },
        { provide: AccessService, useValue: { load: () => of(known) } },
      ],
    });
    guard = TestBed.inject(AbilityGuard);
    router = TestBed.inject(Router);
  });

  it('lets a user into a page their abilities open', async () => {
    expect(await ask('/quotation', 'quotations.view')).toBeTrue();
    expect(await ask('/profile')).withContext('a page that needs no ability').toBeTrue();
  });

  it('leads a user away from a page the role does not have, to one plain line', async () => {
    expect(await ask('/bulk-price-update', 'catalogue.write')).toBe('/no-access');
    expect(await ask('/type-margin', 'prices.view_cost')).toBe('/no-access');
  });

  it('opens a workshop user on Orders when they ask for Home', async () => {
    known = { me: me(WORKSHOP, 'workshop', 'Workshop'), subscription: null };
    expect(await ask('/dashboard', 'quotations.view')).toBe('/orders');
    expect(await ask('/customers', 'quotations.view')).toBe('/no-access');
    expect(await ask('/orders', 'orders.view')).toBeTrue();
  });

  it('lets everything through while the abilities are not known, and leaves a visitor to the sign-in guard', async () => {
    known = EMPTY_ACCESS;
    expect(await ask('/masters/profile', 'catalogue.view')).toBeTrue();
    signedIn = false;
    known = { me: me([]), subscription: null };
    expect(await ask('/quotation', 'quotations.view')).toBeTrue();
  });
});

describe('AccessInterceptor (402 and 403 in one place)', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let toast: jasmine.SpyObj<ToastService>;
  let access: jasmine.SpyObj<AccessService>;

  beforeEach(() => {
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['showError']);
    access = jasmine.createSpyObj<AccessService>('AccessService', ['refreshSubscription']);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: ToastService, useValue: toast },
        { provide: AccessService, useValue: access },
        { provide: HTTP_INTERCEPTORS, useClass: AccessInterceptor, multi: true },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  const fail = (status: number, body: any, options: any = {}) => {
    let failed: any = null;
    http.post('/api/v1/customer/add', {}, options).subscribe({ error: (err) => (failed = err) });
    backend.expectOne('/api/v1/customer/add').flush(body, { status, statusText: 'Refused' });
    return failed;
  };

  it('402: says the api\'s line once, reads the plan again, and still fails the call', () => {
    const message = 'Your subscription has ended and the account is read-only. Nothing is lost: you can still view and download everything. Renew the plan to continue.';
    const failed = fail(402, { success: false, code: 'subscription_locked', message, status: 'locked', plan: 'growth' });
    expect(toast.showError).toHaveBeenCalledOnceWith(message);
    expect(access.refreshSubscription).toHaveBeenCalledTimes(1);
    expect(failed.status).toBe(402);
  });

  it('402 is handled the same for a quiet request and for one with no body', () => {
    fail(402, null, quiet());
    expect(toast.showError).toHaveBeenCalledOnceWith(LOCKED_REFUSAL);
    expect(access.refreshSubscription).toHaveBeenCalledTimes(1);
  });

  it('403 forbidden_for_role: one plain line, also for a quiet request', () => {
    const message = 'Your role (Sales) does not allow this. Ask the owner of the account.';
    const failed = fail(403, { success: false, code: 'forbidden_for_role', message, role: 'sales', ability: 'catalogue.write' }, quiet());
    expect(toast.showError).toHaveBeenCalledOnceWith(message);
    expect(access.refreshSubscription).not.toHaveBeenCalled();
    expect(failed.status).toBe(403);
  });

  it('leaves every other failure to the screen and the shared toast', () => {
    fail(403, { success: false, code: 'platform_admin_only', message: 'This is for the platform admin only.' });
    fail(409, { success: false, code: 'seat_limit', message: 'Your plan allows 3 users and all are in use.' });
    fail(500, { message: 'Server Error' });
    expect(toast.showError).not.toHaveBeenCalled();
    expect(access.refreshSubscription).not.toHaveBeenCalled();
  });
});

@Component({
  standalone: true,
  imports: [CanDirective],
  template: `<button *appCan="'quotations.write'" class="new">New quotation</button><span *appCan="'prices.view_cost'" class="cost">Cost</span>`,
})
class ButtonsComponent {}

describe('appCan', () => {
  it('draws a button only for a user whose abilities have it, and follows a change', () => {
    const state$ = new BehaviorSubject<AccessState>({ me: me(SALES), subscription: null });
    TestBed.configureTestingModule({ imports: [ButtonsComponent], providers: [{ provide: AccessService, useValue: { state$ } }] });
    const fixture = TestBed.createComponent(ButtonsComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.new')).not.toBeNull();
    expect(el.querySelector('.cost')).withContext('sales has no prices.view_cost').toBeNull();

    state$.next({ me: me(['prices.view_cost'], 'accounts', 'Accounts'), subscription: null });
    fixture.detectChanges();
    expect(el.querySelector('.new')).toBeNull();
    expect(el.querySelector('.cost')).not.toBeNull();
  });
});
