import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { Subject, of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../../shared/components/shared-components.module';
import { ToastService } from '../../../shared/services/toast.service';
import { toOutstanding, toSavedPayment } from '../payments.adapter';
import { PaymentsService } from '../payments.service';
import { rawAccount, rawOutstanding, rawPayment } from '../payments.testing';
import { OutstandingComponent } from './outstanding.component';

@Component({ selector: 'app-record-payment', template: '' })
class RecordPaymentStubComponent {
  @Input() account: any;
  @Input() kind = 'receipt';
  @Output() saved = new EventEmitter<any>();
  @Output() closed = new EventEmitter<void>();
}

const listOf = (raw: any) => ({ ok: true as const, data: toOutstanding(raw), message: '' });

describe('OutstandingComponent', () => {
  let fixture: ComponentFixture<OutstandingComponent>;
  let service: jasmine.SpyObj<PaymentsService>;
  let toast: jasmine.SpyObj<ToastService>;

  const el = (): HTMLElement => fixture.nativeElement;
  const text = (): string => (el().textContent || '').replace(/\s+/g, ' ');
  const button = (label: string): HTMLButtonElement | undefined =>
    (Array.from(el().querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes(label));

  function create(list: any): void {
    service.outstanding.and.returnValue(list);
    fixture = TestBed.createComponent(OutstandingComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = jasmine.createSpyObj('PaymentsService', ['outstanding', 'companyName']);
    service.companyName.and.returnValue(of('Hakimi Enterprise'));
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    TestBed.configureTestingModule({
      declarations: [OutstandingComponent, RecordPaymentStubComponent],
      imports: [RouterTestingModule, FormsModule, SharedComponentsModule],
      providers: [
        { provide: PaymentsService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  it('shows skeletons while the list loads', () => {
    create(new Subject());
    expect(el().querySelector('[role="status"]')?.textContent).toContain('Loading the outstanding list');
    expect(el().querySelectorAll('.sk-row').length).toBe(4);
  });

  it('shows an inline error with "Try again"', () => {
    create(throwError(() => ({ status: 0 })));
    expect(text()).toContain('We could not load the outstanding list. Check your connection.');
    service.outstanding.and.returnValue(of(listOf(rawOutstanding())));
    button('Try again')!.click();
    fixture.detectChanges();
    expect(el().querySelectorAll('.customer').length).toBe(2);
  });

  it('shows the total to collect and one figure per age bucket, as the api returns them', () => {
    create(of(listOf(rawOutstanding())));
    const buckets = Array.from(el().querySelectorAll('.totals .bucket')).map((b) => b.textContent!.replace(/\s+/g, ' ').trim());
    expect(buckets[0]).toContain('To collect₹21,549.98');
    expect(buckets[0]).toContain('2 customers, 2 jobs');
    expect(buckets[1]).toBe('0 to 30 days₹20,049.98');
    expect(buckets[4]).toBe('Over 90 days₹1,500.00');
    expect(el().querySelector('.totals .bucket.old')).not.toBeNull();
    expect(text()).toContain('as of 4 Oct 2026');
  });

  it('lists each customer with the balance by age and how old the oldest job is', () => {
    create(of(listOf(rawOutstanding())));
    const first = el().querySelector('.customer')!.textContent!.replace(/\s+/g, ' ');
    expect(first).toContain('Sharma Residency');
    expect(first).toContain('1 job · oldest 12 days');
    expect(first).toContain('0 to 30 days₹20,049.98');
    expect(first).toContain('Balance₹20,049.98');
  });

  it('offers a one-tap WhatsApp reminder with the text filled in, and a way to add a missing number', () => {
    create(of(listOf(rawOutstanding())));
    const [sharma, ahmed] = Array.from(el().querySelectorAll('.customer'));
    const link = sharma.querySelector('.remind a') as HTMLAnchorElement;
    expect(link.textContent).toContain('Remind on WhatsApp');
    expect(link.getAttribute('aria-label')).toBe('Remind Sharma Residency on WhatsApp');
    expect(link.href.startsWith('https://wa.me/919823456781?text=')).toBeTrue();
    const words = decodeURIComponent(link.href.split('text=')[1]);
    expect(words).toContain('from Hakimi Enterprise');
    expect(words).toContain('₹20,049.98 is pending against INV/26-27/0001');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    const add = ahmed.querySelector('.remind a') as HTMLAnchorElement;
    expect(add.textContent).toContain('Add a mobile number');
    expect(add.getAttribute('href')).toBe('/customers/edit/2');
  });

  it('opens the jobs of a customer, each with its age and a link', () => {
    create(of(listOf(rawOutstanding())));
    expect(el().querySelector('.jobs')).toBeNull();
    const toggle = el().querySelector('.who') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const row = el().querySelector('.jobs tbody tr')!;
    expect(row.textContent!.replace(/\s+/g, ' ')).toContain('22 Sep 2026 · 12 days');
    expect(row.querySelector('a')?.getAttribute('href')).toBe('/payments/bill/2');
    expect(row.textContent).toContain('₹20,049.98');
  });

  it('records a payment from a job and asks the api for the new balances', () => {
    create(of(listOf(rawOutstanding())));
    (el().querySelector('.who') as HTMLButtonElement).click();
    fixture.detectChanges();
    button('Record payment')!.click();
    fixture.detectChanges();
    const dialog = fixture.debugElement.query((d) => d.componentInstance instanceof RecordPaymentStubComponent);
    expect(dialog.componentInstance.account.balance).toBe(20049.98);
    expect(dialog.componentInstance.account.bill.id).toBe(2);

    service.outstanding.calls.reset();
    service.outstanding.and.returnValue(of(listOf(rawOutstanding({ customers: [] }))));
    dialog.componentInstance.saved.emit(toSavedPayment({ ...rawPayment({ number: 'RCT/26-27/0005' }), account: rawAccount() }));
    fixture.detectChanges();
    expect(toast.showSuccess).toHaveBeenCalledWith('RCT/26-27/0005 saved');
    expect(service.outstanding).toHaveBeenCalledTimes(1);
    expect(el().querySelector('app-record-payment')).toBeNull();
  });

  it('filters by basis through the api and by search in the browser', () => {
    create(of(listOf(rawOutstanding())));
    button('Billed')!.click();
    expect(service.outstanding).toHaveBeenCalledWith('bill');
    fixture.componentInstance.search = 'ahmed';
    fixture.detectChanges();
    expect(el().querySelectorAll('.customer').length).toBe(1);
    fixture.componentInstance.search = 'nobody';
    fixture.detectChanges();
    expect(text()).toContain('No customer matches "nobody"');
  });

  it('teaches in the empty state, with the page\'s one primary button', () => {
    create(of(listOf(rawOutstanding({ customers: [] }))));
    expect(text()).toContain('Nothing is outstanding');
    expect(text()).toContain('with its age counted from the bill date');
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
  });

  it('gives every button and link an accessible name', () => {
    create(of(listOf(rawOutstanding())));
    for (const control of Array.from(el().querySelectorAll('button, a'))) {
      expect((control.getAttribute('aria-label') || control.textContent || '').trim()).not.toBe('');
    }
  });
});
