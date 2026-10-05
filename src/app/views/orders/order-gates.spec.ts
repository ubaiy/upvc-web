import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { MenuModule } from 'primeng/menu';
import { BehaviorSubject, of } from 'rxjs';

import { AccessState, allows, gateMenu, readOnlyReason, writeGate } from '../../shared/access/access.models';
import { AccessService } from '../../shared/access/access.service';
import { me, subscription } from '../../shared/access/access.spec';
import { ACCESS_PARTS } from '../../shared/access/write.directive';
import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { ToastService } from '../../shared/services/toast.service';
import { UndoService } from '../../shared/services/undo.service';
import { ConfirmDialogComponent } from '../bills/confirm-dialog.component';
import { toAccount } from '../payments/payments.adapter';
import { PaymentsService } from '../payments/payments.service';
import { rawAccount } from '../payments/payments.testing';
import { DocumentPreviewComponent } from '../payments/shared/document-preview.component';
import { ReasonDialogComponent } from '../payments/shared/reason-dialog.component';
import { RecordPaymentComponent } from '../payments/shared/record-payment.component';
import { OrderCreateComponent } from './create/order-create.component';
import { toOrderPage } from './orders.adapter';
import { OrdersService } from './orders.service';
import { rawOrderPage } from './orders.testing';
import { OrderPageComponent } from './page/order-page.component';

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
const LOCKED = subscription({ status: 'locked', read_only: true });
const as = (role: string, sub = subscription()): AccessState => ({ me: me(ROLES[role], role, role), subscription: sub });

/** What the screens ask of AccessService, answered from one state. */
function accessOf(state: AccessState) {
  const state$ = new BehaviorSubject<AccessState>(state);
  return {
    state$,
    get state() {
      return state$.value;
    },
    can: (ability: string) => allows(state$.value, ability),
    gate: (ability: string) => writeGate(state$.value, ability),
    canWrite: (ability: string) => {
      const gate = writeGate(state$.value, ability);
      return !gate.hidden && !gate.locked;
    },
    menu: (items: any[], abilityOf: (item: any) => string | null) => gateMenu(state$.value, items, abilityOf),
  };
}

@Component({ selector: 'app-account-payments', template: '', exportAs: 'payments' })
class PaymentsStubComponent {
  @Input() orderId: number | null = null;
  @Output() changed = new EventEmitter<any>();
  focusPanel = jasmine.createSpy('focusPanel');
}

const shown = (node: Element | null | undefined): boolean => !!node && !node.hasAttribute('hidden');
const off = (node: Element | null | undefined): boolean => node?.getAttribute('aria-disabled') === 'true';
const byText = (root: HTMLElement, label: string): HTMLButtonElement | undefined =>
  (Array.from(root.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes(label));

describe('Order page: who may press what (card T143)', () => {
  let fixture: ComponentFixture<OrderPageComponent>;
  let service: jasmine.SpyObj<OrdersService>;
  let toast: jasmine.SpyObj<ToastService>;

  async function open(state: AccessState): Promise<HTMLElement> {
    service = jasmine.createSpyObj('OrdersService', ['show', 'setStage', 'update', 'cancel', 'challan']);
    service.show.and.returnValue(of({ ok: true as const, data: toOrderPage(rawOrderPage()), message: '' }));
    service.setStage.and.returnValue(of({ ok: true as const, data: toOrderPage(rawOrderPage()), message: '' }));
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError', 'showInfo']);
    TestBed.configureTestingModule({
      declarations: [OrderPageComponent, PaymentsStubComponent, ReasonDialogComponent, DocumentPreviewComponent],
      imports: [...ACCESS_PARTS, RouterTestingModule, NoopAnimationsModule, FormsModule, MenuModule, SharedComponentsModule, ConfirmDialogComponent],
      providers: [
        { provide: OrdersService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: UndoService, useValue: jasmine.createSpyObj('UndoService', ['offer']) },
        { provide: AccessService, useValue: accessOf(state) },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '1' })) } },
      ],
    });
    fixture = TestBed.createComponent(OrderPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  const next = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.btn.next');
  const more = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[aria-label="More actions for this order"]');
  const fields = (el: HTMLElement) => ['vehicle', 'transporter', 'order-notes', 'workshop-note'].map((id) => el.querySelector<HTMLInputElement>('#' + id)!);

  function menuLabels(el: HTMLElement): string[] {
    more(el)!.click();
    fixture.detectChanges();
    return fixture.componentInstance.menuItems.filter((item) => !item.separator).map((item) => `${item.label}${item.disabled ? ' (off)' : ''}`);
  }

  for (const role of ['owner', 'sales']) {
    it(`${role}: the next stage, More with "Cancel order", and the fields can be typed in`, async () => {
      const el = await open(as(role));
      expect(shown(next(el))).toBeTrue();
      expect(off(next(el))).toBeFalse();
      expect(fields(el).every((box) => !box.disabled)).toBeTrue();
      expect(menuLabels(el)).toContain('Cancel order');
    });
  }

  it('workshop: moves the stage, but cannot change or cancel the order', async () => {
    const el = await open(as('workshop'));
    expect(shown(next(el))).toBeTrue();
    expect(fields(el).every((box) => box.disabled)).toBeTrue();
    expect(el.textContent).not.toContain('Save delivery details');
    const labels = more(el) ? menuLabels(el) : [];
    expect(labels).not.toContain('Cancel order');
    next(el)!.click();
    expect(service.setStage).toHaveBeenCalled();
  });

  it('accounts: reads the order; no next stage, nothing to save', async () => {
    const el = await open(as('accounts'));
    expect(shown(next(el))).toBeFalse();
    expect(more(el)).toBeNull();
    expect(fields(el).every((box) => box.disabled)).toBeTrue();
    // A press that is not made by hand (Enter in the form presses its button) goes nowhere.
    next(el)!.click();
    fixture.componentInstance.saveTransport();
    expect(service.setStage).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });

  it('a locked company: every button is off with the reason, and a press only says it', async () => {
    const el = await open(as('owner', LOCKED));
    const reason = readOnlyReason(LOCKED);
    expect(shown(next(el))).toBeTrue();
    expect(off(next(el))).toBeTrue();
    expect(next(el)!.getAttribute('title')).toBe(reason);
    expect(fields(el).every((box) => box.disabled)).toBeTrue();
    next(el)!.click();
    expect(service.setStage).not.toHaveBeenCalled();
    expect(toast.showError).toHaveBeenCalledWith(reason);
    expect(menuLabels(el).every((label) => label.endsWith('(off)'))).toBeTrue();
    // The challan is a read: it stays.
    expect(off(byText(el, 'Download PDF'))).toBeFalse();
  });
});

describe('Create order: who may press it (card T143)', () => {
  let fixture: ComponentFixture<OrderCreateComponent>;
  let service: jasmine.SpyObj<OrdersService>;
  let toast: jasmine.SpyObj<ToastService>;

  const QUOTATION = {
    id: 14,
    number: 'Q-0003',
    quatation_name: 'Al-Rashid Villa Windows',
    status: 'accepted',
    customer: { id: 2, name: 'Ahmed Al-Rashid' },
    totals: { total: 35456, total_quantity: 3, advance: { percent: 50, amount: 17728 }, payment_term: { id: 1, name: '50% Advance, 50% on Delivery' } },
  };

  async function open(state: AccessState): Promise<HTMLButtonElement> {
    service = jasmine.createSpyObj('OrdersService', ['quotation', 'forQuotation', 'create']);
    service.quotation.and.returnValue(of({ ok: true as const, data: QUOTATION, message: '' }) as any);
    service.forQuotation.and.returnValue(of({ ok: true as const, data: [], message: '' }));
    service.create.and.returnValue(of({ ok: true as const, data: toOrderPage(rawOrderPage()), message: '' }));
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    TestBed.configureTestingModule({
      declarations: [OrderCreateComponent],
      imports: [...ACCESS_PARTS, RouterTestingModule, FormsModule, SharedComponentsModule],
      providers: [
        { provide: OrdersService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: AccessService, useValue: accessOf(state) },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ quotation: '14' })) } },
      ],
    });
    fixture = TestBed.createComponent(OrderCreateComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return byText(fixture.nativeElement, 'Create order')!;
  }

  it('sales: "Create order" is there and on', async () => {
    const button = await open(as('sales'));
    expect(shown(button)).toBeTrue();
    expect(off(button)).toBeFalse();
  });

  for (const role of ['accounts', 'workshop']) {
    it(`${role}: no "Create order", and a press sends nothing`, async () => {
      const button = await open(as(role));
      expect(shown(button)).toBeFalse();
      button.click();
      expect(service.create).not.toHaveBeenCalled();
    });
  }

  it('a locked company: off with the reason, a press sends nothing', async () => {
    const button = await open(as('owner', LOCKED));
    expect(shown(button)).toBeTrue();
    expect(off(button)).toBeTrue();
    button.click();
    expect(service.create).not.toHaveBeenCalled();
    expect(toast.showError).toHaveBeenCalledWith(readOnlyReason(LOCKED));
  });
});

describe('Record payment dialog: who may save (card T143)', () => {
  let fixture: ComponentFixture<RecordPaymentComponent>;
  let service: jasmine.SpyObj<PaymentsService>;
  let toast: jasmine.SpyObj<ToastService>;

  async function open(state: AccessState): Promise<HTMLButtonElement> {
    service = jasmine.createSpyObj('PaymentsService', ['add']);
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    TestBed.configureTestingModule({
      declarations: [RecordPaymentComponent],
      imports: [...ACCESS_PARTS, FormsModule, SharedComponentsModule],
      providers: [
        { provide: PaymentsService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: AccessService, useValue: accessOf(state) },
      ],
    });
    fixture = TestBed.createComponent(RecordPaymentComponent);
    fixture.componentInstance.account = toAccount(rawAccount())!;
    fixture.componentInstance.kind = 'receipt';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('button[type="submit"]');
  }

  it('accounts: the save button is there and on', async () => {
    const save = await open(as('accounts'));
    expect(shown(save)).toBeTrue();
    expect(off(save)).toBeFalse();
  });

  it('sales (no payments.write): no save button, a press sends nothing', async () => {
    const save = await open(as('sales'));
    expect(shown(save)).toBeFalse();
    save.click();
    expect(service.add).not.toHaveBeenCalled();
  });

  it('a locked company: off with the reason, a press sends nothing', async () => {
    const save = await open(as('accounts', LOCKED));
    expect(off(save)).toBeTrue();
    save.click();
    expect(service.add).not.toHaveBeenCalled();
    expect(toast.showError).toHaveBeenCalledWith(readOnlyReason(LOCKED));
  });
});

@Component({
  template: `
    <app-confirm-dialog title="Close it?" confirmLabel="Close order" ability="production.write" (confirmed)="done.push('confirm')"></app-confirm-dialog>
    <app-reason-dialog title="Cancel it?" confirmLabel="Cancel order" ability="orders.write" (confirmed)="done.push('reason')"></app-reason-dialog>
    <app-confirm-dialog class="plain" title="Leave?" confirmLabel="Leave" (confirmed)="done.push('plain')"></app-confirm-dialog>
  `,
})
class DialogsHostComponent {
  done: string[] = [];
}

describe('The "are you sure" dialogs: the confirm button follows the ability (card T143)', () => {
  let toast: jasmine.SpyObj<ToastService>;

  function open(state: AccessState) {
    toast = jasmine.createSpyObj('ToastService', ['showError']);
    TestBed.configureTestingModule({
      declarations: [DialogsHostComponent, ReasonDialogComponent],
      imports: [...ACCESS_PARTS, FormsModule, SharedComponentsModule, ConfirmDialogComponent],
      providers: [
        { provide: ToastService, useValue: toast },
        { provide: AccessService, useValue: accessOf(state) },
      ],
    });
    const fixture = TestBed.createComponent(DialogsHostComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return { fixture, close: byText(el, 'Close order')!, cancel: byText(el, 'Cancel order')!, leave: byText(el, 'Leave')! };
  }

  it('owner: both confirm', () => {
    const { fixture, close } = open(as('owner'));
    close.click();
    expect(fixture.componentInstance.done).toEqual(['confirm']);
  });

  it('a locked company: the confirm buttons are off and say why; a dialog without an ability is untouched', () => {
    const { fixture, close, cancel, leave } = open(as('owner', LOCKED));
    expect(off(close)).toBeTrue();
    expect(off(cancel)).toBeTrue();
    close.click();
    cancel.click();
    expect(fixture.componentInstance.done).toEqual([]);
    expect(toast.showError).toHaveBeenCalledTimes(2);
    expect(off(leave)).toBeFalse();
    leave.click();
    expect(fixture.componentInstance.done).toEqual(['plain']);
  });

  it('workshop: may close an order (production.write) but not cancel it (orders.write)', () => {
    const { close, cancel } = open(as('workshop'));
    expect(shown(close)).toBeTrue();
    expect(shown(cancel)).toBeFalse();
  });
});
