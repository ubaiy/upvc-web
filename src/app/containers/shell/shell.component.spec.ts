import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { AuthService } from '../../shared/services/auth.service';
import { RouteLoadingService } from '../../shared/services/route-loading.service';
import { LocalStoreService } from '../../shared/services/local-storage.service';
import { QuotationListService } from '../../views/quotation/quotation-list.service';
import { CommandPaletteComponent } from './command-palette.component';
import { AccessState, EMPTY_ACCESS } from '../../shared/access/access.models';
import { AccessService } from '../../shared/access/access.service';
import { findNavItem, NAV_ITEMS, navFor, pathMatches } from './nav';
import { ShellComponent } from './shell.component';
import { WorkspaceService } from './workspace.service';

@Component({ template: '' })
class BlankComponent {}

describe('shell navigation', () => {
  it('has the eight menu items, in the order of the job', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      'Home', 'Quotations', 'Orders', 'Customers', 'Bills', 'Outstanding', 'Catalogue', 'Settings',
    ]);
  });

  it('matches whole path segments only', () => {
    expect(pathMatches('/masters/profile', '/masters/profile')).toBeTrue();
    expect(pathMatches('/masters/profile/edit/3', '/masters/profile')).toBeTrue();
    expect(pathMatches('/masters/profile-color', '/masters/profile')).toBeFalse();
    expect(pathMatches('/quotation?page=2', '/quotation')).toBeTrue();
  });

  it('puts every screen under one of the items', () => {
    const cases: [string, string][] = [
      ['/dashboard', 'home'],
      ['/quotation/detail/4/add/0', 'quotations'],
      ['/production/14', 'quotations'],
      ['/customers/add', 'customers'],
      ['/bills', 'bills'],
      ['/orders/12', 'orders'],
      ['/payments/outstanding', 'outstanding'],
      ['/payments/bill/3', 'outstanding'],
      ['/masters/glass', 'catalogue'],
      ['/bulk-price-update', 'catalogue'],
      ['/profile', 'settings'],
      ['/type-margin', 'settings'],
      ['/payment-terms', 'settings'],
      ['/area', 'settings'],
      ['/crm/header', 'settings'],
    ];
    for (const [url, id] of cases) {
      expect(findNavItem(url)?.id).withContext(url).toBe(id);
    }
    expect(findNavItem('/ui')).toBeUndefined();
  });

  it('draws no section tabs: Catalogue and Settings are one page each and only name their places for the page finder', () => {
    expect(NAV_ITEMS.some((item) => 'tabs' in item)).toBeFalse();
    const places = (id: string) => NAV_ITEMS.find((item) => item.id === id)?.places?.map((place) => place.label);
    expect(places('catalogue')).toEqual(['Profiles', 'Colours', 'Glass', 'Hardware', 'Price file']);
    expect(places('settings')).toEqual(['Company', 'Team', 'Plan', 'Pricing and tax', 'Documents', 'Your profile']);
  });

  it('gives a user the items and places their abilities open (card T117)', () => {
    const menu = (abilities: string[]) => navFor((ability) => !ability || abilities.includes(ability));
    const workshop = menu(['orders.view', 'production.view', 'production.write']);
    expect(workshop.map((item) => item.label)).toEqual(['Orders', 'Settings']);
    expect(workshop[1].places?.map((place) => place.label)).toEqual(['Your profile']);

    const sales = menu(['quotations.view', 'quotations.write', 'orders.view', 'orders.write', 'production.view', 'production.write', 'payments.view', 'catalogue.view']);
    expect(sales.map((item) => item.label)).toEqual(['Home', 'Quotations', 'Orders', 'Customers', 'Bills', 'Outstanding', 'Catalogue', 'Settings']);
    expect(sales.find((item) => item.id === 'catalogue')?.places?.map((place) => place.label)).withContext('no price file for sales').toEqual(['Profiles', 'Colours', 'Glass', 'Hardware']);
    expect(sales.find((item) => item.id === 'settings')?.places?.map((place) => place.label)).toEqual(['Your profile']);

    expect(navFor(() => true)).toEqual(NAV_ITEMS);
  });
});

describe('ShellComponent', () => {
  let fixture: ComponentFixture<ShellComponent>;
  let router: Router;
  const user$ = new BehaviorSubject<any>({ name: 'Husain', last_name: 'Ezzi' });
  const workspace$ = new BehaviorSubject({ name: 'Hakimi Enterprise' });
  const auth = { user$, USER: 'User', logout: jasmine.createSpy('logout') };
  const state$ = new BehaviorSubject<AccessState>(EMPTY_ACCESS);
  const access = { state$, load: () => of(state$.value), can: () => true };

  const text = (selector: string) => fixture.nativeElement.querySelector(selector)?.textContent.trim();
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    auth.logout.calls.reset();
    await TestBed.configureTestingModule({
      declarations: [ShellComponent, CommandPaletteComponent, BlankComponent],
      imports: [
        SharedComponentsModule,
        RouterTestingModule.withRoutes([{ path: '**', component: BlankComponent }]),
      ],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: AccessService, useValue: access },
        { provide: WorkspaceService, useValue: { workspace$, load: () => undefined } },
        { provide: LocalStoreService, useValue: { getItem: () => null } },
        // The search dialog looks records up; its own spec covers that.
        { provide: ApiHttpService, useValue: { get: () => of({ success: true, data: [] }) } },
        { provide: QuotationListService, useValue: { page: () => of({ rows: [], total: 0, lastPage: 1 }) } },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
  });

  it('shows the company name, the menu items and the signed-in user', () => {
    expect(text('.ws-name')).toBe('Hakimi Enterprise');
    const labels = [...fixture.nativeElement.querySelectorAll('a.item .t')].map((el: Element) => el.textContent?.trim());
    expect(labels).toEqual(['Home', 'Quotations', 'Orders', 'Customers', 'Bills', 'Outstanding', 'Catalogue', 'Settings']);
    expect(text('.who')).toBe('HE');
    expect(text('.account .item .t')).toBe('Husain Ezzi');
  });

  it('marks the current item and leaves the tab strip to the page', async () => {
    await router.navigateByUrl('/masters/profile-color');
    await settle();
    expect(text('a.item[aria-current="page"] .t')).toBe('Catalogue');
    expect(fixture.nativeElement.querySelector('.tabs')).toBeNull();

    await router.navigateByUrl('/quotation');
    await settle();
    expect(text('a.item[aria-current="page"] .t')).toBe('Quotations');
    expect(fixture.nativeElement.querySelector('.tabs')).toBeNull();
  });

  it('gives the old designer the full width', async () => {
    await router.navigateByUrl('/quotation/detail/3/add/0');
    await settle();
    expect(fixture.nativeElement.querySelector('.page').classList).toContain('page-wide');
  });

  it('opens the page finder on Ctrl K and closes it on Escape', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-command-palette')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-command-palette')).toBeNull();
  });

  it('signs out from the account menu', () => {
    fixture.nativeElement.querySelector('.account button.item').click();
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.account-menu .menu-item');
    expect(items.length).toBe(2);
    expect(items[0].getAttribute('href')).toContain('/profile?tab=you');
    items[1].click();
    expect(auth.logout).toHaveBeenCalled();
  });

  it('phone bar: four items and "More", which holds the rest, search, the profile and sign out', async () => {
    const bar = fixture.nativeElement.querySelector('nav.bar');
    const labels = () => [...bar.querySelectorAll('.bar-item span')].map((el: Element) => el.textContent?.trim());
    expect(labels()).toEqual(['Home', 'Quotations', 'Orders', 'Customers', 'More']);
    expect(bar.querySelector('.sheet')).toBeNull();

    const more = bar.querySelector('button.bar-item');
    more.click();
    fixture.detectChanges();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const sheet = [...bar.querySelectorAll('.sheet .menu-item')].map((el: Element) => el.textContent?.trim().replace(/\s+/g, ' '));
    expect(sheet).toEqual(['Bills', 'Outstanding', 'Catalogue', 'Settings', 'Search', 'Your profile Husain Ezzi', 'Sign out']);

    await router.navigateByUrl('/masters/glass');
    await settle();
    expect(bar.querySelector('.sheet')).withContext('closes on navigation').toBeNull();
    expect(more.classList).withContext('More is lit for a page it holds').toContain('is-current');
    expect(bar.querySelector('a.bar-item[aria-current="page"]')).toBeNull();
  });

  it('every control of the sidebar and the phone bar has a name', () => {
    const controls = [...fixture.nativeElement.querySelectorAll('nav a, nav button')] as HTMLElement[];
    expect(controls.length).toBeGreaterThan(10);
    for (const control of controls) {
      const name = (control.getAttribute('aria-label') || control.textContent || '').trim();
      expect(name).withContext(control.outerHTML.slice(0, 80)).not.toBe('');
    }
  });

  it('draws the menu of the role, and the line of the plan with the way to the Plan page for the owner only', () => {
    const sub: any = { status: 'grace', read_only: false, days_left: 4, grace_ends_on: '2026-10-09', features: {} };
    state$.next({ me: { abilities: ['orders.view', 'production.view'], role_name: 'Workshop' } as any, subscription: sub });
    fixture.detectChanges();
    const labels = () => [...fixture.nativeElement.querySelectorAll('nav.side a.item .t')].map((el: Element) => el.textContent?.trim());
    expect(labels()).toEqual(['Orders', 'Settings']);
    expect(fixture.nativeElement.querySelector('a.ws').getAttribute('href')).withContext('the company name leads to the first screen of the role').toBe('/orders');
    expect(text('.plan-banner')).toContain('Payment is due. The account becomes read-only after 9 Oct 2026.');
    expect(text('.plan-banner')).toContain('Ask the owner of the account.');
    expect(fixture.nativeElement.querySelector('.plan-banner a')).toBeNull();

    state$.next({ me: { abilities: ['quotations.view', 'billing.view'] } as any, subscription: { ...sub, status: 'locked', read_only: true } });
    fixture.detectChanges();
    expect(labels()).toEqual(['Home', 'Quotations', 'Customers', 'Bills', 'Settings']);
    expect(fixture.nativeElement.querySelector('.plan-banner').classList).toContain('danger');
    expect(fixture.nativeElement.querySelector('.plan-banner a').getAttribute('href')).toContain('/profile?tab=plan');

    state$.next(EMPTY_ACCESS);
    fixture.detectChanges();
    expect(labels().length).toBe(8);
    expect(fixture.nativeElement.querySelector('.plan-banner')).toBeNull();
  });

  it('draws the next page as a skeleton in place of the page being left while its resolver is waited for (card T138)', () => {
    const routeLoading = TestBed.inject(RouteLoadingService);
    const pages = () => Array.from(fixture.nativeElement.querySelectorAll('.main .page')) as HTMLElement[];
    expect(routeLoading.shellOnScreen).toBeTrue();
    expect(pages().length).toBe(1);
    expect(fixture.nativeElement.querySelector('app-page-skeleton')).toBeNull();

    routeLoading.state$.next('page');
    fixture.detectChanges();
    expect(pages().length).toBe(2);
    expect(pages()[0].querySelector('app-page-skeleton')).not.toBeNull();
    expect(pages()[1].style.display).withContext('the page being left').toBe('none');
    expect(pages()[1].querySelector('router-outlet')).withContext('the outlet stays').not.toBeNull();

    routeLoading.state$.next('none');
    fixture.detectChanges();
    expect(pages().length).toBe(1);
    expect(pages()[0].style.display).toBe('');

    fixture.destroy();
    expect(routeLoading.shellOnScreen).toBeFalse();
  });

  it('falls back to the product name until the company has loaded', () => {
    workspace$.next({ name: '' });
    fixture.detectChanges();
    expect(text('.ws-name')).toBe('UPVC');
    workspace$.next({ name: 'Hakimi Enterprise' });
  });
});
