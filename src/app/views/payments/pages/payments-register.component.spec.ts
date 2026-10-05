import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../../shared/components/shared-components.module';
import { ToastService } from '../../../shared/services/toast.service';
import { todayIso } from '../api-result';
import { scopeQuery, toPaymentList } from '../payments.adapter';
import { PaymentsService } from '../payments.service';
import { PaymentsRegisterComponent } from './payments-register.component';

@Component({ selector: 'app-account-payments', template: '' })
class PanelStubComponent {
  @Input() customerId: number | null = null;
  @Input() from: string | null = null;
  @Input() to: string | null = null;
  @Input() mode: string | null = null;
  @Input() heading = '';
}

describe('PaymentsRegisterComponent', () => {
  let fixture: ComponentFixture<PaymentsRegisterComponent>;
  let component: PaymentsRegisterComponent;
  let service: jasmine.SpyObj<PaymentsService>;
  let toast: jasmine.SpyObj<ToastService>;
  let query: BehaviorSubject<any>;

  const el = (): HTMLElement => fixture.nativeElement;
  const panel = (): PanelStubComponent => fixture.debugElement.query((d) => d.componentInstance instanceof PanelStubComponent).componentInstance;
  const button = (label: string): HTMLButtonElement =>
    (Array.from(el().querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes(label))!;

  function create(params: any = {}): void {
    query = new BehaviorSubject(convertToParamMap(params));
    TestBed.overrideProvider(ActivatedRoute, { useValue: { queryParamMap: query } });
    fixture = TestBed.createComponent(PaymentsRegisterComponent);
    component = fixture.componentInstance;
    // The address is the state: a navigation lands back in the query stream.
    spyOn(TestBed.inject(Router), 'navigate').and.callFake((_: any[], extras: any) => {
      const merged: any = { ...Object.fromEntries(query.value.keys.map((k: string) => [k, query.value.get(k)])), ...extras.queryParams };
      Object.keys(merged).forEach((key) => merged[key] === null && delete merged[key]);
      query.next(convertToParamMap(merged));
      return Promise.resolve(true);
    });
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = jasmine.createSpyObj('PaymentsService', ['customers', 'exportExcel']);
    service.customers.and.returnValue(of([{ id: 2, name: 'Ahmed Al-Rashid' }]));
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    TestBed.configureTestingModule({
      declarations: [PaymentsRegisterComponent, PanelStubComponent],
      imports: [RouterTestingModule, SharedComponentsModule],
      providers: [
        { provide: PaymentsService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  it('lists everything at first, with named filters and no primary button', () => {
    create();
    expect(panel().heading).toBe('All payments');
    expect(panel().from).toBeNull();
    for (const id of ['pay-from', 'pay-to', 'pay-mode', 'pay-customer']) {
      expect(el().querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
    expect(el().querySelector('.btn-primary')).toBeNull();
    expect(button('Clear filters')).toBeUndefined();
  });

  it('reads the period, the mode and the customer from the address, and ignores what is not one', () => {
    create({ from: '2026-10-01', to: '2026-10-05', mode: 'upi', customer: '2' });
    expect([panel().from, panel().to, panel().mode, panel().customerId]).toEqual(['2026-10-01', '2026-10-05', 'upi', 2]);
    expect(panel().heading).toBe('Payments of Ahmed Al-Rashid');
    query.next(convertToParamMap({ from: 'yesterday', mode: 'barter' }));
    fixture.detectChanges();
    expect([panel().from, panel().mode]).toEqual([null, null]);
  });

  it('filters by Today, by a mode and by a customer, and clears them again', () => {
    create();
    button('Today').click();
    fixture.detectChanges();
    expect([panel().from, panel().to]).toEqual([todayIso(), todayIso()]);
    expect(panel().heading).toBe('Today');
    component.setMode('cash');
    component.setCustomer('2');
    fixture.detectChanges();
    expect([panel().mode, panel().customerId]).toEqual(['cash', 2]);
    button('Clear filters').click();
    fixture.detectChanges();
    expect([panel().from, panel().to, panel().mode, panel().customerId]).toEqual([null, null, null, null]);
  });

  it('exports what is on screen under the name the api gives', () => {
    create({ from: '2026-10-05', to: '2026-10-05', mode: 'cash' });
    service.exportExcel.and.returnValue(of({ blob: new Blob(['x']), fileName: 'Payments-05-Oct-2026.xlsx' }));
    const saved = spyOn(document.body, 'appendChild').and.callThrough();
    button('Export to Excel').click();
    expect(service.exportExcel).toHaveBeenCalledOnceWith({ customerId: null, from: '2026-10-05', to: '2026-10-05', mode: 'cash' });
    expect(toast.showSuccess).toHaveBeenCalledWith('Payments-05-Oct-2026.xlsx downloaded');
    expect(saved).toHaveBeenCalled();
  });

  it('says why the export failed, with "Try again"', () => {
    create();
    service.exportExcel.and.returnValue(throwError(() => new Error('to cannot be before from')));
    button('Export to Excel').click();
    fixture.detectChanges();
    expect(el().querySelector('app-callout')?.textContent).toContain('The Excel file could not be made. to cannot be before from');
    expect(button('Try again')).toBeDefined();
  });
});

describe('payments register query and day book', () => {
  it('builds the query of the register from a customer, a period and a mode', () => {
    expect(scopeQuery({})).toBe('');
    expect(scopeQuery({ customerId: 2, from: '2026-10-01', to: '2026-10-05', mode: 'cash' })).toBe('?customer_id=2&from=2026-10-01&to=2026-10-05&mode=cash');
    expect(scopeQuery({ orderId: 4, from: '2026-10-01' })).toBe('?order_id=4');
  });

  it('reads the sums by mode and by day as the api sends them', () => {
    const list = toPaymentList({
      payments: [],
      totals: {},
      summary: {
        count: 4,
        by_mode: [{ mode: 'cash', mode_label: 'Cash', received: 9000, refunded: 500, net_received: 8500, count: 3 }],
        by_day: [{ date: '2026-10-05', received: 4000, refunded: 500, net_received: 3500, count: 2 }],
      },
    });
    expect(list.summary.byMode).toEqual([{ key: 'cash', label: 'Cash', received: 9000, refunded: 500, netReceived: 8500, count: 3 }]);
    expect(list.summary.byDay[0]).toEqual({ key: '2026-10-05', label: '', received: 4000, refunded: 500, netReceived: 3500, count: 2 });
    expect(toPaymentList({}).summary).toEqual({ count: 0, byMode: [], byDay: [] });
  });
});
