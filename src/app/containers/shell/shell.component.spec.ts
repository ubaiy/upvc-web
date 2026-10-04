import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { AuthService } from '../../shared/services/auth.service';
import { LocalStoreService } from '../../shared/services/local-storage.service';
import { CommandPaletteComponent } from './command-palette.component';
import { findNavItem, NAV_ITEMS, pathMatches } from './nav';
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
    expect(places('catalogue')).toEqual(['Profiles', 'Colours', 'Glass', 'Hardware', 'Update rates']);
    expect(places('settings')).toEqual(['Company', 'Team', 'Pricing and tax', 'Documents', 'Your profile']);
  });
});

describe('ShellComponent', () => {
  let fixture: ComponentFixture<ShellComponent>;
  let router: Router;
  const user$ = new BehaviorSubject<any>({ name: 'Husain', last_name: 'Ezzi' });
  const workspace$ = new BehaviorSubject({ name: 'Hakimi Enterprise' });
  const auth = { user$, USER: 'User', logout: jasmine.createSpy('logout') };

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
        { provide: WorkspaceService, useValue: { workspace$, load: () => undefined } },
        { provide: LocalStoreService, useValue: { getItem: () => null } },
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

  it('falls back to the product name until the company has loaded', () => {
    workspace$.next({ name: '' });
    fixture.detectChanges();
    expect(text('.ws-name')).toBe('UPVC');
    workspace$.next({ name: 'Hakimi Enterprise' });
  });
});
