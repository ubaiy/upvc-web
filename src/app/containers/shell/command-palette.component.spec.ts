import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { QuotationListService } from '../../views/quotation/quotation-list.service';
import { CommandPaletteComponent } from './command-palette.component';

const CUSTOMERS = [
  { id: 7, name: 'T73 Patel Constructions', phone: '9876543210' },
  { id: 8, name: 'Pune Retail', phone: '9123456780' },
  { id: 9, name: 'Patel Glass House', phone: '9000011111' },
];

const ORDERS = [
  { id: 2, number: 'ORD/26-27/0002', quatation_number: 'Q-0011', quatation_name: 'Order A', name: 'Ahmed Al-Rashid' },
  { id: 9, number: 'ORD/26-27/0009', quatation_number: 'Q-0019', quatation_name: 'Pune site', name: 'T73 Patel Constructions' },
];
const BILLS = [
  { id: 5, number: 'INV/26-27/0005', quatation_number: 'Q-0017', quatation_name: 'Mehta Homes – windows', name: 'Mehta Homes' },
  { id: 6, number: 'INV/26-27/0006', quatation_number: 'Q-0019', quatation_name: 'Pune site', name: 'T73 Patel Constructions', status: 'cancelled' },
];
const PAYMENTS = {
  payments: [
    { id: 15, number: 'RCT/26-27/0015', order_id: 8, order_number: 'ORD/26-27/0008', customer_name: 'Mehta Homes' },
    { id: 16, number: 'RCT/26-27/0016', bill_id: 5, bill_number: 'INV/26-27/0005', customer_name: 'Mehta Homes' },
  ],
};
/** What each list endpoint answers; a test replaces one to make it fail. */
let lists: Record<string, any>;

const QUOTATION = { id: 36, number: 'Q-0014', name: 'Patel Villa', customerName: 'T73 Patel Constructions' };

describe('CommandPaletteComponent (Search, Ctrl K)', () => {
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let component: CommandPaletteComponent;
  let api: jasmine.SpyObj<ApiHttpService>;
  let quotations: jasmine.SpyObj<QuotationListService>;
  let router: Router;

  const el = (): HTMLElement => fixture.nativeElement;
  const input = (): HTMLInputElement => el().querySelector('input') as HTMLInputElement;
  const options = (): string[] =>
    Array.from(el().querySelectorAll('[role="option"]')).map((o) => o.getAttribute('aria-label') || '');
  const sections = (): string[] => Array.from(el().querySelectorAll('.section')).map((s) => (s.textContent || '').trim());

  function type(value: string): void {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function key(name: string): void {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: name }));
    fixture.detectChanges();
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('ApiHttpService', ['get']);
    lists = { 'customer/list': CUSTOMERS, 'order/list': ORDERS, 'bill/list': BILLS, 'payment/list': PAYMENTS };
    api.get.and.callFake((path: string) => of({ success: true, data: lists[path.split('?')[0]] }) as any);
    quotations = jasmine.createSpyObj('QuotationListService', ['page']);
    quotations.page.and.returnValue(of({ rows: [QUOTATION as any], total: 1, lastPage: 1 }));
    TestBed.configureTestingModule({
      declarations: [CommandPaletteComponent],
      imports: [SharedComponentsModule, RouterTestingModule],
      providers: [
        { provide: ApiHttpService, useValue: api },
        { provide: QuotationListService, useValue: quotations },
      ],
    });
    fixture = TestBed.createComponent(CommandPaletteComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fixture.detectChanges();
  });

  it('opens with the cursor in the field and the pages listed, and asks the api nothing', () => {
    expect(document.activeElement).toBe(input());
    expect(options()).toContain('Customers');
    expect(api.get).not.toHaveBeenCalled();
    expect(quotations.page).not.toHaveBeenCalled();
  });

  it('finds a customer by name and a quotation by its customer (M11)', fakeAsync(() => {
    type('patel');
    expect(el().textContent).toContain('Looking for customers, quotations, orders, bills and receipts');
    tick(250);
    fixture.detectChanges();
    expect(sections()).toEqual(['Customers', 'Quotations', 'Orders', 'Bills']);
    // A name that starts with the text comes first.
    expect(options()).toEqual([
      'Patel Glass House, 9000011111',
      'T73 Patel Constructions, 9876543210',
      'Q-0014 · Patel Villa, T73 Patel Constructions',
      'ORD/26-27/0009 · Pune site, T73 Patel Constructions',
      'INV/26-27/0006 · cancelled, T73 Patel Constructions',
    ]);
    expect(quotations.page).toHaveBeenCalledOnceWith({ status: 'all', search: 'patel', page: 1, perPage: 6 });
    expect(el().textContent).not.toContain('Nothing matches');
  }));

  it('finds a customer by a part of the phone number', fakeAsync(() => {
    quotations.page.and.returnValue(of({ rows: [], total: 0, lastPage: 1 }));
    type('91234');
    tick(250);
    fixture.detectChanges();
    expect(options()).toEqual(['Pune Retail, 9123456780']);
  }));

  it('opens the record with the arrow keys and Enter', fakeAsync(() => {
    const closed = jasmine.createSpy('closed');
    component.closed.subscribe(closed);
    type('patel');
    tick(250);
    fixture.detectChanges();
    key('ArrowDown');
    tick();
    expect(input().getAttribute('aria-activedescendant')).toBe('palette-option-1');
    key('Enter');
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/customers/edit/7');
    expect(closed).toHaveBeenCalled();

    type('q-0014');
    tick(250);
    fixture.detectChanges();
    key('Enter');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/quotation/detail/36');
  }));

  it('finds an order, a bill and a receipt by its number, and opens it (after-sale M5)', fakeAsync(() => {
    quotations.page.and.returnValue(of({ rows: [], total: 0, lastPage: 1 }));
    const find = (text: string): void => {
      type(text);
      tick(250);
      fixture.detectChanges();
    };

    find('ORD/26-27/0002');
    expect(sections()).toEqual(['Orders']);
    expect(options()).toEqual(['ORD/26-27/0002 · Order A, Ahmed Al-Rashid']);
    key('Enter');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/orders/2');

    find('inv');
    expect(sections()).toEqual(['Bills']);
    expect(options()).toEqual(['INV/26-27/0005, Mehta Homes', 'INV/26-27/0006 · cancelled, T73 Patel Constructions']);
    key('Enter');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/payments/bill/5');

    // A receipt opens the order it was paid against, or the bill when there is no order.
    find('rct');
    expect(sections()).toEqual(['Receipts']);
    expect(options()).toEqual([
      'RCT/26-27/0015 · ORD/26-27/0008, Mehta Homes',
      'RCT/26-27/0016 · INV/26-27/0005, Mehta Homes',
    ]);
    key('Enter');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/orders/8');
    key('ArrowDown');
    key('Enter');
    tick();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/payments/bill/5');
  }));

  it('finds orders, bills and receipts by the customer, every word typed', fakeAsync(() => {
    quotations.page.and.returnValue(of({ rows: [], total: 0, lastPage: 1 }));
    type('mehta homes');
    tick(250);
    fixture.detectChanges();
    expect(sections()).toEqual(['Bills', 'Receipts']);
    expect(options().length).toBe(3);
  }));

  it('still lists pages, and reads the customer, order, bill and payment lists once while it is open', fakeAsync(() => {
    type('cust');
    tick(250);
    fixture.detectChanges();
    expect(sections()[0]).toBe('Pages');
    expect(options()[0]).toBe('Customers');
    type('custo');
    tick(250);
    expect(api.get.calls.allArgs().map((args) => args[0])).toEqual([
      'customer/list',
      'order/list?stage=all',
      'bill/list?status=all',
      'payment/list',
    ]);
  }));

  it('says so when nothing matches, and when the records cannot be searched', fakeAsync(() => {
    quotations.page.and.returnValue(of({ rows: [], total: 0, lastPage: 1 }));
    type('zzzz');
    tick(250);
    fixture.detectChanges();
    expect(el().textContent).toContain('Nothing matches "zzzz".');

    quotations.page.and.returnValue(throwError(() => new Error('offline')));
    type('patel');
    tick(250);
    fixture.detectChanges();
    expect(el().textContent).toContain('Customers, quotations, orders, bills and receipts could not be searched.');

    // A list the api refuses is asked for again on the next search.
    quotations.page.and.returnValue(of({ rows: [], total: 0, lastPage: 1 }));
    lists['order/list'] = null;
    type('ord/26');
    tick(250);
    fixture.detectChanges();
    expect(el().textContent).toContain('could not be searched');
    lists['order/list'] = ORDERS;
    type('ord/26-27/0002');
    tick(250);
    fixture.detectChanges();
    expect(options()).toEqual(['ORD/26-27/0002 · Order A, Ahmed Al-Rashid']);
  }));
});
