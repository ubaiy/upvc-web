import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Subject, of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../../shared/components/shared-components.module';
import { ToastService } from '../../../shared/services/toast.service';
import { toOrderPage, toOrders } from '../orders.adapter';
import { OrdersService } from '../orders.service';
import { rawOrder, rawOrderPage } from '../orders.testing';
import { OrderCreateComponent } from './order-create.component';

const QUOTATION = {
  id: 14,
  number: 'Q-0003',
  quatation_name: 'Al-Rashid Villa Windows',
  status: 'accepted',
  customer: { id: 2, name: 'Ahmed Al-Rashid' },
  totals: { total: 35456, total_quantity: 3, advance: { percent: 50, amount: 17728 }, payment_term: { id: 1, name: '50% Advance, 50% on Delivery' } },
};
const ok = <T>(data: T) => of({ ok: true as const, data, message: '' });

describe('OrderCreateComponent (Create order)', () => {
  let fixture: ComponentFixture<OrderCreateComponent>;
  let service: jasmine.SpyObj<OrdersService>;
  let toast: jasmine.SpyObj<ToastService>;
  let router: Router;

  const el = (): HTMLElement => fixture.nativeElement;
  const text = (): string => (el().textContent || '').replace(/\s+/g, ' ');

  async function create(params: any = { quotation: '14' }): Promise<void> {
    TestBed.overrideProvider(ActivatedRoute, { useValue: { queryParamMap: of(convertToParamMap(params)) } });
    fixture = TestBed.createComponent(OrderCreateComponent);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function submit(): void {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = jasmine.createSpyObj('OrdersService', ['quotation', 'forQuotation', 'create']);
    service.quotation.and.returnValue(ok(QUOTATION));
    service.forQuotation.and.returnValue(ok([]));
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    TestBed.configureTestingModule({
      declarations: [OrderCreateComponent],
      imports: [RouterTestingModule, FormsModule, SharedComponentsModule],
      providers: [
        { provide: OrdersService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  it('shows the advance the api worked out from the payment term, percent and amount', async () => {
    service.quotation.and.returnValue(of({ ok: true, data: { ...QUOTATION, totals: { ...QUOTATION.totals, advance: { percent: 30, amount: 10637 } } } } as any));
    await create();
    expect(text()).toContain('Advance₹10,637.0030% by the payment terms');
  });

  it('says there is no advance when the term asks for none', async () => {
    service.quotation.and.returnValue(of({ ok: true, data: { ...QUOTATION, totals: { ...QUOTATION.totals, advance: { percent: 0, amount: 0 } } } } as any));
    await create();
    expect(text()).toContain('AdvanceNoneThe payment terms name no advance');
  });

  it('shows a skeleton while the quotation loads', async () => {
    service.quotation.and.returnValue(new Subject());
    await create();
    expect(el().querySelector('[role="status"]')?.textContent).toContain('Loading the quotation');
  });

  it('shows the quotation with the total and the advance the api returns', async () => {
    await create();
    expect(text()).toContain('Q-0003');
    expect(text()).toContain('Al-Rashid Villa Windows');
    expect(text()).toContain('Order total₹35,456.00');
    expect(text()).toContain('Advance₹17,728.0050% by the payment terms');
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
    expect(el().querySelector('.btn-primary')?.textContent).toContain('Create order');
  });

  it('creates the order in one step and opens it', async () => {
    await create();
    service.create.and.returnValue(ok(toOrderPage(rawOrderPage({ id: 5, number: 'ORD/26-27/0005' }))));
    submit();
    expect(service.create).toHaveBeenCalledOnceWith({ quatation_id: 14 });
    expect(toast.showSuccess).toHaveBeenCalledWith('Order ORD/26-27/0005 created');
    expect(router.navigate).toHaveBeenCalledWith(['/orders', 5], { replaceUrl: true });
  });

  it('sends the promised date and the note when given', async () => {
    await create();
    service.create.and.returnValue(ok(toOrderPage(rawOrderPage())));
    fixture.componentInstance.promised = '2999-01-01';
    fixture.componentInstance.notes = ' Call before delivery ';
    submit();
    expect(service.create).toHaveBeenCalledOnceWith({ quatation_id: 14, promised_date: '2999-01-01', workshop_note: 'Call before delivery' });
  });

  it('does not send a promised date in the past', async () => {
    await create();
    fixture.componentInstance.promised = '2001-01-01';
    fixture.detectChanges();
    submit();
    expect(service.create).not.toHaveBeenCalled();
    expect(text()).toContain('The promised date cannot be before today.');
  });

  it('opens the order when the quotation already has one', async () => {
    service.forQuotation.and.returnValue(ok(toOrders([rawOrder({ id: 9, status: 'cancelled' }), rawOrder({ id: 7 })])));
    await create();
    expect(router.navigate).toHaveBeenCalledWith(['/orders', 7], { replaceUrl: true });
  });

  it('explains that a quotation must be accepted first, and links back to it', async () => {
    service.quotation.and.returnValue(ok({ ...QUOTATION, status: 'sent' }));
    await create();
    expect(text()).toContain('This quotation is sent. Only a quotation the customer has accepted becomes an order');
    expect(el().querySelector('form')).toBeNull();
    const primary = el().querySelectorAll('.btn-primary');
    expect(primary.length).toBe(1);
    expect(primary[0].getAttribute('href')).toBe('/quotation/detail/14');
  });

  it('shows a refusal inline, with a link to the order the api names', async () => {
    await create();
    service.create.and.returnValue(of({ ok: false as const, message: 'Quatation already has an order (ORD/26-27/0001)', data: { order_id: 1 } }));
    submit();
    expect(text()).toContain('Quatation already has an order (ORD/26-27/0001)');
    const open = (Array.from(el().querySelectorAll('a')) as HTMLAnchorElement[]).find((a) => a.textContent!.includes('Open that order'));
    expect(open?.getAttribute('href')).toBe('/orders/1');
    service.create.and.returnValue(throwError(() => ({ status: 0 })));
    submit();
    expect(text()).toContain('The order was not made. Check your connection.');
  });

  it('shows an inline error with "Try again" when the quotation cannot be loaded', async () => {
    service.quotation.and.returnValue(throwError(() => ({ status: 0 })));
    await create();
    expect(text()).toContain('We could not load the quotation. Check your connection.');
    service.quotation.and.returnValue(ok(QUOTATION));
    (Array.from(el().querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes('Try again'))!.click();
    fixture.detectChanges();
    expect(text()).toContain('Al-Rashid Villa Windows');
  });

  it('says so when the address names no quotation', async () => {
    await create({});
    expect(text()).toContain('This address has no quotation in it');
    expect(service.quotation).not.toHaveBeenCalled();
  });
});
