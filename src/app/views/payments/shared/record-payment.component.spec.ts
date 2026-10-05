import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../../shared/components/shared-components.module';
import { todayIso } from '../api-result';
import { toAccount, toSavedPayment } from '../payments.adapter';
import { Account, PaymentKind } from '../payments.model';
import { PaymentsService } from '../payments.service';
import { rawAccount, rawPayment } from '../payments.testing';
import { RecordPaymentComponent } from './record-payment.component';

describe('RecordPaymentComponent (Record payment dialog)', () => {
  let fixture: ComponentFixture<RecordPaymentComponent>;
  let component: RecordPaymentComponent;
  let service: jasmine.SpyObj<PaymentsService>;

  const el = (): HTMLElement => fixture.nativeElement;
  const input = (id: string): HTMLInputElement => el().querySelector('#' + id)!;
  const saved = (account = rawAccount()) => ({ ok: true as const, data: toSavedPayment({ ...rawPayment(), account }), message: '' });

  function type(id: string, value: string): void {
    const box = input(id);
    box.value = value;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(): void {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  async function create(account: Account, kind: PaymentKind = 'receipt'): Promise<void> {
    fixture = TestBed.createComponent(RecordPaymentComponent);
    component = fixture.componentInstance;
    component.account = account;
    component.kind = kind;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = jasmine.createSpyObj('PaymentsService', ['add']);
    TestBed.configureTestingModule({
      declarations: [RecordPaymentComponent],
      imports: [FormsModule, SharedComponentsModule],
      providers: [{ provide: PaymentsService, useValue: service }],
    });
  });

  it('starts with the balance as the amount, cash, and today', async () => {
    await create(toAccount(rawAccount())!);
    expect(input('pay-amount').value).toBe('17728');
    expect(input('pay-date').value).toBe(todayIso().split('-').reverse().join('/'));
    expect(el().querySelector('.mode[aria-pressed="true"]')?.textContent).toContain('Cash');
    expect(el().querySelector('h2')?.textContent).toContain('Record payment');
    expect(el().textContent).toContain('ORD/26-27/0001 · Ahmed Al-Rashid');
    expect(el().textContent).toContain('₹17,728.00');
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
  });

  it('saves in one step: the amount as typed, against the order and the bill of the job', async () => {
    await create(toAccount(rawAccount({ bill: { id: 3, number: 'INV/26-27/0002' } }))!);
    service.add.and.returnValue(of(saved()));
    const emitted: any[] = [];
    component.saved.subscribe((value) => emitted.push(value));
    type('pay-amount', '2,500.50');
    submit();
    expect(service.add).toHaveBeenCalledOnceWith({
      kind: 'receipt',
      amount: '2500.50',
      mode: 'cash',
      payment_date: todayIso(),
      order_id: 1,
      bill_id: 3,
    });
    expect(emitted.length).toBe(1);
    expect(emitted[0].payment.number).toBe('RCT/26-27/0001');
  });

  it('asks for the cheque number, and sends the reference and the note when given', async () => {
    await create(toAccount(rawAccount())!);
    service.add.and.returnValue(of(saved()));
    (Array.from(el().querySelectorAll('.mode')) as HTMLButtonElement[]).find((b) => b.textContent!.includes('Cheque'))!.click();
    fixture.detectChanges();
    expect(el().querySelector('label[for="pay-reference"]')?.textContent).toContain('Cheque number');
    submit();
    expect(service.add).not.toHaveBeenCalled();
    expect(el().querySelector('#pay-reference-help')?.textContent).toContain('Enter the cheque number.');

    type('pay-reference', ' 004512 ');
    (el().querySelector('.add-note') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    type('pay-note', 'Balance by cheque');
    submit();
    const body = service.add.calls.mostRecent().args[0];
    expect(body.mode).toBe('cheque');
    expect(body.reference).toBe('004512');
    expect(body.note).toBe('Balance by cheque');
  });

  it('does not send an amount above the balance, a bad amount or a future date', async () => {
    await create(toAccount(rawAccount())!);
    type('pay-amount', '17728.01');
    submit();
    expect(el().querySelector('#pay-amount-help .error')?.textContent).toContain('The balance is ₹17,728.00');
    type('pay-amount', '12.345');
    submit();
    expect(el().querySelector('#pay-amount-help .error')?.textContent).toContain('two decimals');
    type('pay-amount', '100');
    type('pay-date', '01/01/2999');
    submit();
    expect(el().querySelector('#pay-date-help')?.textContent).toContain('cannot be in the future');
    expect(service.add).not.toHaveBeenCalled();
  });

  it('sends the date on the form: today as it opens, an earlier date as chosen', async () => {
    await create(toAccount(rawAccount())!);
    service.add.and.returnValue(of(saved()));
    submit();
    expect(service.add.calls.mostRecent().args[0].payment_date).toBe(todayIso());
    type('pay-date', '15/01/2026');
    submit();
    expect(service.add.calls.mostRecent().args[0].payment_date).toBe('2026-01-15');
  });

  it('shows the api refusal in the dialog and keeps what was typed', async () => {
    await create(toAccount(rawAccount())!);
    service.add.and.returnValue(of({ ok: false as const, message: 'Order is cancelled; a payment cannot be recorded against it' }));
    const emitted: any[] = [];
    component.saved.subscribe((value) => emitted.push(value));
    type('pay-amount', '500');
    submit();
    expect(el().querySelector('app-callout')?.textContent).toContain('Order is cancelled');
    expect(input('pay-amount').value).toBe('500');
    expect(emitted.length).toBe(0);
  });

  it('says so when the connection fails, and can be sent again', async () => {
    await create(toAccount(rawAccount())!);
    service.add.and.returnValue(throwError(() => ({ status: 0 })));
    submit();
    expect(el().querySelector('app-callout')?.textContent).toContain('The payment was not saved. Check your connection.');
    expect((el().querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBeFalse();
  });

  it('waits while saving and does not send twice', async () => {
    await create(toAccount(rawAccount())!);
    service.add.and.returnValue(new Subject());
    submit();
    submit();
    expect(service.add).toHaveBeenCalledTimes(1);
    expect(el().querySelector('button[type="submit"]')?.textContent).toContain('Saving…');
  });

  it('offers the advance still to take beside the full balance', async () => {
    await create(toAccount(rawAccount({ received: 0, net_received: 0, balance: 35456, advance: { percent: 50, amount: 17728, received: 0, due: 17728 } }))!);
    const chips = Array.from(el().querySelectorAll('.chips button')) as HTMLButtonElement[];
    expect(chips.map((c) => c.textContent!.trim())).toEqual(['Advance ₹17,728.00', 'Full balance ₹35,456.00']);
    chips[0].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.amount).toBe('17728');
  });

  it('records a refund as its own kind, limited to the money held', async () => {
    await create(toAccount(rawAccount())!, 'refund');
    service.add.and.returnValue(of(saved()));
    expect(el().querySelector('h2')?.textContent).toContain('Record refund');
    expect(input('pay-amount').value).toBe('');
    type('pay-amount', '20000');
    submit();
    expect(el().querySelector('#pay-amount-help .error')?.textContent).toContain('A refund cannot be more than the ₹17,728.00 received.');
    type('pay-amount', '1500');
    submit();
    expect(service.add.calls.mostRecent().args[0].kind).toBe('refund');
    expect(service.add.calls.mostRecent().args[0].amount).toBe('1500');
  });

  it('closes on Cancel and on Escape, but not while saving', async () => {
    await create(toAccount(rawAccount())!);
    let closed = 0;
    component.closed.subscribe(() => closed++);
    (Array.from(el().querySelectorAll('.dialog-foot button')) as HTMLButtonElement[])[0].click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(2);
    service.add.and.returnValue(new Subject());
    submit();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(2);
  });

  it('names every field', async () => {
    await create(toAccount(rawAccount())!);
    for (const control of Array.from(el().querySelectorAll('input:not([aria-hidden])'))) {
      expect(el().querySelector(`label[for="${control.id}"]`)).withContext(control.id).not.toBeNull();
    }
    expect(el().querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe('pay-dialog-title');
  });
});
