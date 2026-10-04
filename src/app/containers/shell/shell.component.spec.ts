import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { AuthService } from '../../shared/services/auth.service';
import { LocalStoreService } from '../../shared/services/local-storage.service';
import { CommandPaletteComponent } from './command-palette.component';
import { findNavItem, findNavTab, NAV_ITEMS, pathMatches } from './nav';
import { ShellComponent } from './shell.component';
import { WorkspaceService } from './workspace.service';

@Component({ template: '' })
class BlankComponent {}

describe('shell navigation', () => {
  it('has exactly six menu items', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      'Home', 'Quotations', 'Customers', 'Bills', 'Catalogue', 'Settings',
    ]);
  });

  it('matches whole path segments only', () => {
    expect(pathMatches('/masters/profile', '/masters/profile')).toBeTrue();
    expect(pathMatches('/masters/profile/edit/3', '/masters/profile')).toBeTrue();
    expect(pathMatches('/masters/profile-color', '/masters/profile')).toBeFalse();
    expect(pathMatches('/quotation?page=2', '/quotation')).toBeTrue();
  });

  it('puts every old screen under one of the six items', () => {
    const cases: [string, string][] = [
      ['/dashboard', 'home'],
      ['/quotation/detail/4/add/0', 'quotations'],
      ['/customers/add', 'customers'],
      ['/bills', 'bills'],
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

  it('lights the right section tab, including the old add and edit paths', () => {
    const catalogue = findNavItem('/masters/Glazzing/7');
    expect(findNavTab('/masters/Glazzing/7', catalogue)?.label).toBe('Glass');
    expect(findNavTab('/masters/profile-color', catalogue)?.label).toBe('Colours');
    expect(findNavTab('/masters/profile', catalogue)?.label).toBe('Profiles');
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

  it('shows the company name, the six items and the signed-in user', () => {
    expect(text('.ws-name')).toBe('Hakimi Enterprise');
    const labels = [...fixture.nativeElement.querySelectorAll('a.item .t')].map((el: Element) => el.textContent?.trim());
    expect(labels).toEqual(['Home', 'Quotations', 'Customers', 'Bills', 'Catalogue', 'Settings']);
    expect(text('.who')).toBe('HE');
    expect(text('.account .item .t')).toBe('Husain Ezzi');
  });

  it('marks the current item and draws section tabs for Catalogue', async () => {
    await router.navigateByUrl('/masters/profile-color');
    await settle();
    expect(text('a.item[aria-current="page"] .t')).toBe('Catalogue');
    expect(text('.tabs .tab[aria-current="page"]')).toBe('Colours');

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
    items[1].click();
    expect(auth.logout).toHaveBeenCalled();
  });

  it('falls back to the product name until the company has loaded', () => {
    workspace$.next({ name: '' });
    fixture.detectChanges();
    expect(text('.ws-name')).toBe('UPVC');
    workspace$.next({ name: 'Hakimi Enterprise' });
  });
});
