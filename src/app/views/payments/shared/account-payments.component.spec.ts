import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { MenuModule } from 'primeng/menu';
import { Subject, of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../../shared/components/shared-components.module';
import { ToastService } from '../../../shared/services/toast.service';
import { Result } from '../api-result';
import { toPaymentList, toSavedPayment } from '../payments.adapter';
import { PaymentList } from '../payments.model';
import { PaymentsService } from '../payments.service';
import { rawAccount, rawPayment, rawPaymentList } from '../payments.testing';
import { AccountPaymentsComponent } from './account-payments.component';
import { DocumentPreviewComponent } from './document-preview.component';
import { ReasonDialogComponent } from './reason-dialog.component';
import { RecordPaymentComponent } from './record-payment.component';

@Component({
  template: `<app-account-payments
    [orderId]="orderId"
    [customerId]="customerId"
    [primaryAction]="primary"
    [openRecord]="openRecord"
    (changed)="changed = changed + 1"
    (loaded)="loaded = loaded + 1"
  ></app-account-payments>`,
})
class HostComponent {
  orderId: number | null = 1;
  customerId: number | null = null;
  primary = false;
  openRecord = false;
  changed = 0;
  loaded = 0;
}

const listOf = (raw: any): Result<PaymentList> => ({ ok: true, data: toPaymentList(raw), message: '' });

describe('AccountPaymentsComponent (payments of a job)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let service: jasmine.SpyObj<PaymentsService>;
  let toast: jasmine.SpyObj<ToastService>;

  const el = (): HTMLElement => fixture.nativeElement;
  const panel = (): AccountPaymentsComponent => fixture.debugElement.children[0].componentInstance;
  const text = (): string => (el().textContent || '').replace(/\s+/g, ' ');
  const button = (label: string): HTMLButtonElement | undefined =>
    (Array.from(el().querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes(label));

  /** Reading a Blob is real async work: wait for it, then draw. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 100; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (!panel().busy) {
        break;
      }
    }
    fixture.detectChanges();
  }

  function create(list: any, setup: (h: HostComponent) => void = () => {}): void {
    service.list.and.returnValue(list);
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    setup(host);
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = jasmine.createSpyObj('PaymentsService', ['list', 'add', 'cancel', 'receipt']);
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError', 'showInfo']);
    TestBed.configureTestingModule({
      declarations: [HostComponent, AccountPaymentsComponent, RecordPaymentComponent, ReasonDialogComponent, DocumentPreviewComponent],
      imports: [RouterTestingModule, NoopAnimationsModule, FormsModule, MenuModule, SharedComponentsModule],
      providers: [
        { provide: PaymentsService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  it('shows skeleton rows while the payments load', () => {
    create(new Subject());
    expect(el().querySelectorAll('.sk-row').length).toBe(3);
    expect(el().querySelector('[role="status"]')?.textContent).toContain('Loading payments');
    expect(service.list).toHaveBeenCalledWith({ orderId: 1, billId: null, customerId: null });
  });

  it('shows an inline error with "Try again"', () => {
    create(throwError(() => ({ status: 0 })));
    expect(text()).toContain('We could not load the payments. Check your connection.');
    service.list.and.returnValue(of(listOf(rawPaymentList())));
    button('Try again')!.click();
    fixture.detectChanges();
    expect(el().querySelectorAll('tbody tr').length).toBe(2);
  });

  it('shows total, received and balance as the api returns them, through the INR pipe', () => {
    create(of(listOf(rawPaymentList())));
    const stats = Array.from(el().querySelectorAll('app-stat')).map((s) => s.textContent!.replace(/\s+/g, ' ').trim());
    expect(stats[0]).toBe('Total₹35,456.00');
    expect(stats[1]).toContain('Received₹16,228.00');
    expect(stats[1]).toContain('₹17,728.00 received, ₹1,500.00 refunded');
    expect(stats[2]).toContain('Balance to pay₹19,228.00');
    expect(el().querySelector('.advance')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Advance (50%)₹17,728.00Received');
    expect(host.loaded).toBe(1);
  });

  it('lists receipts and refunds; a refund is negative and a cancelled entry is marked', () => {
    create(of(listOf(rawPaymentList({ payments: [rawPayment({ id: 9, number: 'RCT/26-27/0009', status: 'cancelled' }), ...rawPaymentList().payments] }))));
    const rows = Array.from(el().querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' '));
    expect(rows[0]).toContain('RCT/26-27/0009');
    expect(rows[0]).toContain('Cancelled');
    expect(rows[1]).toContain('Refund');
    expect(rows[1]).toContain('−₹1,500.00');
    expect(rows[2]).toContain('₹17,728.00');
    expect(rows[2]).toContain('UPI');
  });

  it('teaches in the empty state and offers the first payment', () => {
    create(of(listOf({ payments: [], totals: {}, account: rawAccount({ received: 0, net_received: 0, balance: 35456, payment_count: 0 }) })));
    expect(text()).toContain('No payment yet');
    expect(text()).toContain('Each payment gets a numbered receipt');
    expect(button('Record the first payment')).toBeDefined();
    expect(button('Refund')).toBeUndefined();
  });

  it('makes "Record payment" the primary button only where the page says so', () => {
    create(of(listOf(rawPaymentList())));
    expect(el().querySelector('.btn-primary')).toBeNull();
    expect(button('Record payment')!.classList).toContain('btn-secondary');
    fixture.destroy();
    create(of(listOf(rawPaymentList())), (h) => (h.primary = true));
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
  });

  it('records a payment: the dialog opens with the account, then the list reloads and the page is told', () => {
    create(of(listOf(rawPaymentList())));
    button('Record payment')!.click();
    fixture.detectChanges();
    const dialog = fixture.debugElement.query((d) => d.componentInstance instanceof RecordPaymentComponent);
    expect(dialog.componentInstance.account.balance).toBe(19228);
    expect(dialog.componentInstance.kind).toBe('receipt');

    service.list.calls.reset();
    dialog.componentInstance.saved.emit(toSavedPayment({ ...rawPayment({ id: 4, number: 'RCT/26-27/0004', amount: 5000 }), account: rawAccount({ balance: 14228 }) }));
    fixture.detectChanges();
    expect(el().querySelector('app-record-payment')).toBeNull();
    expect(toast.showSuccess).toHaveBeenCalledWith('RCT/26-27/0004 saved');
    expect(service.list).toHaveBeenCalledTimes(1);
    expect(host.changed).toBe(1);
    expect(text()).toContain('Receipt RCT/26-27/0004 for ₹5,000.00 is saved.');
  });

  it('opens a refund as an explicit action', () => {
    create(of(listOf(rawPaymentList())));
    button('Refund')!.click();
    fixture.detectChanges();
    const dialog = fixture.debugElement.query((d) => d.componentInstance instanceof RecordPaymentComponent);
    expect(dialog.componentInstance.kind).toBe('refund');
  });

  it('opens "Record payment" by itself when the link asked for it', () => {
    create(of(listOf(rawPaymentList())), (h) => (h.openRecord = true));
    fixture.detectChanges();
    expect(el().querySelector('app-record-payment')).not.toBeNull();
  });

  it('offers no payment on a paid job or a cancelled order, but still a refund', () => {
    create(of(listOf(rawPaymentList({ account: rawAccount({ balance: 0, status: 'paid', net_received: 35456, received: 35456 }) }))));
    expect(button('Record payment')).toBeUndefined();
    expect(text()).toContain('Paid in full');
    expect(button('Refund')).toBeDefined();
  });

  it('says "Refund due" when more is held than the job is worth', () => {
    create(of(listOf(rawPaymentList({ account: rawAccount({ balance: 0, overpaid: 2500, status: 'paid' }) }))));
    expect(text()).toContain('Refund due: ₹2,500.00');
  });

  it('previews the receipt from the api page, and downloads its PDF', async () => {
    create(of(listOf(rawPaymentList())));
    service.receipt.and.callFake((_id: number, format: string) =>
      of({ blob: new Blob([format === 'html' ? '<p>RECEIPT</p>' : '%PDF'], { type: format === 'html' ? 'text/html' : 'application/pdf' }), fileName: null }) as any
    );
    (el().querySelectorAll('tbody tr')[1].querySelector('.row-buttons button') as HTMLButtonElement).click();
    await settle();
    expect(service.receipt).toHaveBeenCalledWith(1, 'html');
    const preview = el().querySelector('app-document-preview')!;
    expect(preview.textContent).toContain('Receipt RCT/26-27/0001 · preview');
    expect(preview.querySelector('iframe')?.getAttribute('sandbox')).toBe('');

    const anchor = spyOn(HTMLAnchorElement.prototype, 'click');
    (Array.from(preview.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes('Download PDF'))!.click();
    await settle();
    expect(service.receipt).toHaveBeenCalledWith(1, 'pdf', true);
    expect(anchor).toHaveBeenCalled();
  });

  it('says why a receipt could not be opened, with "Try again"', () => {
    create(of(listOf(rawPaymentList())));
    service.receipt.and.returnValue(throwError(() => new Error('Invalid payment id')));
    panel().openPreview(panel().payments[1]);
    fixture.detectChanges();
    expect(text()).toContain('Receipt RCT/26-27/0001 could not be opened. Invalid payment id');
    expect(button('Try again')).toBeDefined();
  });

  it('shows why an entry was cancelled, on its row', () => {
    create(of(listOf(rawPaymentList({ payments: [rawPayment({ status: 'cancelled', cancel_reason: 'Entered against the wrong order' })] }))));
    expect(el().querySelector('tbody tr .reason')?.textContent).toContain('Reason: Entered against the wrong order');
  });

  it('drops the "is saved" line when another step starts', () => {
    create(of(listOf(rawPaymentList())));
    panel().lastSaved = panel().payments[0];
    fixture.detectChanges();
    expect(text()).toContain('is saved.');
    panel().record('refund');
    fixture.detectChanges();
    expect(text()).not.toContain('is saved.');
  });

  it('cancels a wrong entry with a reason; a refusal stays in the dialog', () => {
    create(of(listOf(rawPaymentList())));
    spyOn(panel().rowMenu!, 'toggle');
    panel().openMenu(new MouseEvent('click'), panel().payments[1]);
    expect(panel().rowMenu!.toggle).toHaveBeenCalled();
    expect(panel().menuItems.filter((i) => i.label).map((i) => i.label)).toEqual(['Download PDF', 'Share', 'Cancel this entry']);
    panel().menuItems.find((i) => i.label === 'Cancel this entry')!.command!({} as any);
    fixture.detectChanges();
    const dialog = fixture.debugElement.query((d) => d.componentInstance instanceof ReasonDialogComponent);
    expect(el().querySelector('app-reason-dialog')?.textContent).toContain('Cancel RCT/26-27/0001?');

    service.cancel.and.returnValue(of({ ok: false as const, message: 'Part of this receipt was refunded; cancel the refund first' }));
    dialog.componentInstance.confirmed.emit('Typed twice');
    fixture.detectChanges();
    expect(service.cancel).toHaveBeenCalledWith(1, 'Typed twice');
    expect(el().querySelector('app-reason-dialog')?.textContent).toContain('cancel the refund first');

    service.cancel.and.returnValue(of({ ok: true as const, data: toSavedPayment({ ...rawPayment({ status: 'cancelled' }), account: rawAccount() }), message: '' }));
    dialog.componentInstance.confirmed.emit('Typed twice');
    fixture.detectChanges();
    expect(el().querySelector('app-reason-dialog')).toBeNull();
    expect(toast.showSuccess).toHaveBeenCalledWith('RCT/26-27/0001 cancelled');
    expect(host.changed).toBe(1);
  });

  it('lists every payment of a customer without the job figures or "Record payment"', () => {
    create(of(listOf(rawPaymentList({ account: null }))), (h) => {
      h.orderId = null;
      h.customerId = 2;
    });
    expect(service.list).toHaveBeenCalledWith({ orderId: null, billId: null, customerId: 2 });
    expect(el().querySelector('app-stat')).toBeNull();
    expect(button('Record payment')).toBeUndefined();
    expect(el().querySelector('thead')?.textContent).toContain('Customer');
    expect(el().querySelector('tbody a')?.getAttribute('href')).toBe('/orders/1');
    expect(text()).toContain('2 entries');
    expect(text()).toContain('Received ₹16,228.00');
  });

  it('gives every button an accessible name', () => {
    create(of(listOf(rawPaymentList())));
    for (const control of Array.from(el().querySelectorAll('button'))) {
      expect((control.getAttribute('aria-label') || control.textContent || '').trim()).not.toBe('');
    }
  });
});
