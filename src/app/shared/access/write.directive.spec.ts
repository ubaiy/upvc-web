import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';

import { ToastService } from '../services/toast.service';
import { AccessState, PLAN_3D_LINE, gateMenu, readOnlyReason, writeGate } from './access.models';
import { AccessService } from './access.service';
import { me, subscription } from './access.spec';
import { ACCESS_PARTS } from './write.directive';

/** The abilities of `App\Access\Roles` in the api (phase-51). */
const ROLES: Record<string, string[]> = {
  owner: [
    'quotations.view', 'quotations.write', 'prices.view_cost', 'orders.view', 'orders.write', 'production.view', 'production.write',
    'bills.write', 'payments.view', 'payments.write', 'catalogue.view', 'catalogue.write', 'settings.write', 'team.manage', 'billing.view',
  ],
  sales: ['quotations.view', 'quotations.write', 'orders.view', 'orders.write', 'production.view', 'production.write', 'payments.view', 'catalogue.view'],
  accounts: ['quotations.view', 'prices.view_cost', 'orders.view', 'bills.write', 'payments.view', 'payments.write', 'catalogue.view'],
  workshop: ['orders.view', 'production.view', 'production.write'],
};

const as = (role: string, sub = subscription({ features: { feature_3d: true } })): AccessState => ({ me: me(ROLES[role], role, role), subscription: sub });
const LOCKED = subscription({ status: 'locked', read_only: true, features: { feature_3d: true } });
const SUSPENDED = subscription({ status: 'suspended', read_only: true, features: { feature_3d: true } });

@Component({
  standalone: true,
  imports: [...ACCESS_PARTS],
  template: `
    <button class="new" appWrite="quotations.write" title="Start a quotation" (click)="pressed.push('new')">New quotation</button>
    <button class="pay" appWrite="payments.write" (click)="pressed.push('pay')">Record payment</button>
    <button class="price" appWrite="catalogue.write" (click)="pressed.push('price')">Edit price</button>
    <button class="stage" appWrite="production.write" (click)="pressed.push('stage')">Next stage</button>
    <button class="pdf" [appWrite]="null" (click)="pressed.push('pdf')">PDF</button>
    <button class="add3d" *appHas3d appWrite="quotations.write" (click)="pressed.push('3d')">Add 3D structure</button>
    <app-plan-lock label="Add 3D structure"></app-plan-lock>
  `,
})
class ScreenComponent {
  pressed: string[] = [];
}

describe('appWrite: write buttons by ability and by plan (card T136)', () => {
  let state$: BehaviorSubject<AccessState>;
  let toast: jasmine.SpyObj<ToastService>;

  function screen(state: AccessState) {
    state$ = new BehaviorSubject<AccessState>(state);
    toast = jasmine.createSpyObj('ToastService', ['showError']);
    TestBed.configureTestingModule({
      imports: [ScreenComponent, RouterTestingModule],
      providers: [
        { provide: AccessService, useValue: { state$, get state() { return state$.value; } } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const shown = (cls: string) => {
      const node = el.querySelector<HTMLElement>('.' + cls);
      return !!node && !node.hasAttribute('hidden');
    };
    return { fixture, el, shown, button: (cls: string) => el.querySelector<HTMLButtonElement>('.' + cls)! };
  }

  const visible: Record<string, Record<string, boolean>> = {
    owner: { new: true, pay: true, price: true, stage: true, pdf: true },
    sales: { new: true, pay: false, price: false, stage: true, pdf: true },
    accounts: { new: false, pay: true, price: false, stage: false, pdf: true },
    workshop: { new: false, pay: false, price: false, stage: true, pdf: true },
  };

  for (const role of Object.keys(visible)) {
    it(`${role}: only the buttons the role may use are shown, and each works`, () => {
      const { shown, button, fixture } = screen(as(role));
      for (const cls of Object.keys(visible[role])) {
        expect(shown(cls)).withContext(`${role} / ${cls}`).toBe(visible[role][cls]);
        if (visible[role][cls]) {
          button(cls).click();
        }
      }
      expect(fixture.componentInstance.pressed).toEqual(Object.keys(visible[role]).filter((cls) => visible[role][cls]));
      expect(toast.showError).not.toHaveBeenCalled();
    });
  }

  it('before the abilities are known nothing is hidden or locked', () => {
    const { shown, button } = screen({ me: null, subscription: null });
    expect(['new', 'pay', 'price', 'stage', 'pdf'].every(shown)).toBeTrue();
    expect(button('new').getAttribute('aria-disabled')).toBeNull();
  });

  it('a locked account: every write button stays, is off with the one reason, and a press changes nothing; the PDF still works', () => {
    const { button, fixture, shown } = screen(as('owner', LOCKED));
    const reason = readOnlyReason(LOCKED);
    for (const cls of ['new', 'pay', 'price', 'stage', 'add3d']) {
      expect(shown(cls)).toBeTrue();
      expect(button(cls).getAttribute('aria-disabled')).withContext(cls).toBe('true');
      expect(button(cls).getAttribute('title')).withContext(cls).toBe(reason);
      button(cls).click();
    }
    expect(button('pdf').getAttribute('aria-disabled')).toBeNull();
    button('pdf').click();
    expect(fixture.componentInstance.pressed).toEqual(['pdf']);
    expect(toast.showError).toHaveBeenCalledWith(reason);
  });

  it('a suspended account says its own line; when the account is active again the button is itself, with its own title', () => {
    const { button, fixture } = screen(as('owner', SUSPENDED));
    expect(button('new').getAttribute('title')).toBe(readOnlyReason(SUSPENDED));
    state$.next(as('owner'));
    fixture.detectChanges();
    expect(button('new').getAttribute('aria-disabled')).toBeNull();
    expect(button('new').getAttribute('title')).toBe('Start a quotation');
    button('new').click();
    expect(fixture.componentInstance.pressed).toEqual(['new']);
  });

  it('a locked account does not show a role what it never had', () => {
    const { shown } = screen(as('accounts', LOCKED));
    expect(shown('new')).toBeFalse();
    expect(shown('pay')).toBeTrue();
  });
});

describe('3D by plan (card T136)', () => {
  function screen(state: AccessState) {
    const state$ = new BehaviorSubject<AccessState>(state);
    TestBed.configureTestingModule({
      imports: [ScreenComponent, RouterTestingModule],
      providers: [
        { provide: AccessService, useValue: { state$, get state() { return state$.value; } } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['showError']) },
      ],
    });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, state$, fixture };
  }
  const NO_3D = subscription({ features: { feature_3d: false } });

  it('a plan with 3D: the button, and no lock', () => {
    const { el } = screen(as('owner'));
    expect(el.querySelector('.add3d')).not.toBeNull();
    expect(el.querySelector('[data-lock="3d"]')).toBeNull();
  });

  it('a plan without 3D: the owner sees a lock with "Available on the Business plan" that leads to the Plan page', () => {
    const { el } = screen(as('owner', NO_3D));
    expect(el.querySelector('.add3d')).toBeNull();
    const lock = el.querySelector<HTMLAnchorElement>('a[data-lock="3d"]')!;
    expect(lock.textContent).toContain('Add 3D structure');
    expect(lock.textContent).toContain(PLAN_3D_LINE);
    expect(PLAN_3D_LINE).toBe('Available on the Business plan');
    expect(lock.getAttribute('href')).toContain('/profile?tab=plan');
  });

  it('a plan without 3D: a user who cannot open the Plan page gets the same words, no link', () => {
    const { el } = screen(as('sales', NO_3D));
    expect(el.querySelector('a[data-lock="3d"]')).toBeNull();
    const lock = el.querySelector<HTMLElement>('span[data-lock="3d"]')!;
    expect(lock.textContent).toContain(PLAN_3D_LINE);
    expect(lock.getAttribute('title')).toContain('Ask the owner');
  });

  it('follows the plan: 3D switched on shows the button without a reload; a plan not known shows it too', () => {
    const { el, state$, fixture } = screen(as('owner', NO_3D));
    state$.next(as('owner'));
    fixture.detectChanges();
    expect(el.querySelector('.add3d')).not.toBeNull();
    expect(el.querySelector('[data-lock="3d"]')).toBeNull();
    state$.next({ me: null, subscription: null });
    fixture.detectChanges();
    expect(el.querySelector('.add3d')).not.toBeNull();
  });
});

describe('the menus of each screen, by role and in a locked account (card T136)', () => {
  type Item = { label?: string; separator?: boolean; disabled?: boolean; title?: string };
  const labels = (items: Item[]) => items.map((item) => (item.separator ? '-' : item.disabled ? `${item.label} (off)` : item.label));

  // The same rule each screen passes to AccessService.menu.
  const screens: Record<string, { items: Item[]; ability: (item: Item) => string | null }> = {
    'quotation list row': {
      items: [{ label: 'Open' }, { label: 'Edit details' }, { label: 'Duplicate' }, { separator: true }, { label: 'Delete' }],
      ability: (item) => (item.label === 'Open' ? null : 'quotations.write'),
    },
    'quotation page': {
      items: [{ label: 'Edit details' }, { label: 'Duplicate' }, { label: 'Production' }, { label: 'Send again' }, { separator: true }, { label: 'Delete' }],
      ability: (item) => (item.label === 'Edit' || item.label === 'Production' ? null : 'quotations.write'),
    },
    'customer row': {
      items: [{ label: 'Edit' }, { label: 'New quotation' }, { separator: true }, { label: 'Delete' }],
      ability: (item) => (item.label === 'Edit' ? null : 'quotations.write'),
    },
    'bill row': {
      items: [{ label: 'Record payment' }, { label: 'Payments' }, { label: 'Download PDF' }, { separator: true }, { label: 'Cancel bill' }],
      ability: (item) => (item.label === 'Record payment' ? 'payments.write' : item.label === 'Cancel bill' ? 'bills.write' : null),
    },
    'payment row': {
      items: [{ label: 'Download PDF' }, { label: 'Share' }, { separator: true }, { label: 'Cancel this entry' }],
      ability: (item) => (item.label === 'Cancel this entry' ? 'payments.write' : null),
    },
  };
  const menu = (name: string, state: AccessState) => labels(gateMenu(state, screens[name].items, screens[name].ability));

  it('owner: every entry', () => {
    for (const name of Object.keys(screens)) {
      expect(menu(name, as('owner'))).toEqual(labels(screens[name].items));
    }
  });

  it('sales: changes quotations and customers, takes no payment and cancels no bill', () => {
    expect(menu('quotation list row', as('sales'))).toEqual(['Open', 'Edit details', 'Duplicate', '-', 'Delete']);
    expect(menu('bill row', as('sales'))).toEqual(['Payments', 'Download PDF']);
    expect(menu('payment row', as('sales'))).toEqual(['Download PDF', 'Share']);
  });

  it('accounts: reads quotations and customers, enters payments, cancels bills; no separator is left alone', () => {
    expect(menu('quotation list row', as('accounts'))).toEqual(['Open']);
    expect(menu('quotation page', as('accounts'))).toEqual(['Production']);
    expect(menu('customer row', as('accounts'))).toEqual(['Edit']);
    expect(menu('bill row', as('accounts'))).toEqual(['Record payment', 'Payments', 'Download PDF', '-', 'Cancel bill']);
    expect(menu('payment row', as('accounts'))).toEqual(['Download PDF', 'Share', '-', 'Cancel this entry']);
  });

  it('a locked account: the entries that change something are off and say why; the reading ones work', () => {
    const state = as('owner', LOCKED);
    expect(menu('bill row', state)).toEqual(['Record payment (off)', 'Payments', 'Download PDF', '-', 'Cancel bill (off)']);
    expect(menu('quotation list row', state)).toEqual(['Open', 'Edit details (off)', 'Duplicate (off)', '-', 'Delete (off)']);
    const off = gateMenu(state, screens['bill row'].items, screens['bill row'].ability)[0];
    expect(off.title).toBe(readOnlyReason(LOCKED));
  });

  it('writeGate: hidden for the role, locked for the plan, free otherwise', () => {
    expect(writeGate(as('workshop'), 'quotations.write')).toEqual({ hidden: true, locked: false, reason: '' });
    expect(writeGate(as('workshop', LOCKED), 'production.write')).toEqual({ hidden: false, locked: true, reason: readOnlyReason(LOCKED) });
    expect(writeGate(as('sales'), 'orders.write')).toEqual({ hidden: false, locked: false, reason: '' });
  });
});
