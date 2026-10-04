import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../../shared/components/shared-components.module';
import { ConfirmDialogComponent } from '../../bills/confirm-dialog.component';
import { UndoService } from '../../../shared/services/undo.service';
import { toCounts, toOrderPage, toOrders } from '../orders.adapter';
import { OrdersService } from '../orders.service';
import { rawOrder, rawOrderPage } from '../orders.testing';
import { OrdersListComponent } from './orders-list.component';

const ORDERS = [
  rawOrder({ id: 3, number: 'ORD/26-27/0003', stage: 'confirmed', name: 'Modern Homes LLP', quatation_name: 'Showroom front', promised_date: null, received: 0, balance: 58807, total: 58807, payment_status: 'unpaid' }),
  rawOrder({ id: 2, number: 'ORD/26-27/0002', stage: 'ready', is_overdue: true, name: 'Sharma Residency', quatation_name: 'Sharma Flat Renovation' }),
  rawOrder({ id: 1, number: 'ORD/26-27/0001', stage: 'closed', balance: 0, received: 35456, payment_status: 'paid' }),
  rawOrder({ id: 4, number: 'ORD/26-27/0004', stage: 'confirmed', status: 'cancelled', next_stage: null }),
];
const COUNTS = { all: 3, confirmed: 1, in_production: 0, ready: 1, dispatched: 0, installed: 0, closed: 1, open: 2, overdue: 1, cancelled: 1 };
const ok = <T>(data: T) => of({ ok: true as const, data, message: '' });

describe('OrdersListComponent', () => {
  let fixture: ComponentFixture<OrdersListComponent>;
  let component: OrdersListComponent;
  let service: jasmine.SpyObj<OrdersService>;
  let undo: jasmine.SpyObj<UndoService>;
  let query: BehaviorSubject<any>;
  let router: Router;

  const el = (): HTMLElement => fixture.nativeElement;
  const text = (): string => (el().textContent || '').replace(/\s+/g, ' ');
  const button = (label: string): HTMLButtonElement | undefined =>
    (Array.from(el().querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes(label));

  function create(list: any = ok(toOrders(ORDERS)), params: any = {}): void {
    service.list.and.returnValue(list);
    query = new BehaviorSubject(convertToParamMap(params));
    TestBed.overrideProvider(ActivatedRoute, { useValue: { queryParamMap: query } });
    fixture = TestBed.createComponent(OrdersListComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    // The address is the state: a navigation lands back in the query stream.
    spyOn(router, 'navigate').and.callFake((_: any[], extras: any) => {
      const next: any = {};
      const merged = { ...Object.fromEntries(query.value.keys.map((k: string) => [k, query.value.get(k)])), ...extras.queryParams };
      Object.keys(merged).forEach((key) => merged[key] !== null && (next[key] = merged[key]));
      query.next(convertToParamMap(next));
      return Promise.resolve(true);
    });
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = jasmine.createSpyObj('OrdersService', ['list', 'counts', 'setStage']);
    service.counts.and.returnValue(ok(toCounts(COUNTS)));
    undo = jasmine.createSpyObj('UndoService', ['offer']);
    TestBed.configureTestingModule({
      declarations: [OrdersListComponent],
      imports: [RouterTestingModule, FormsModule, SharedComponentsModule, ConfirmDialogComponent],
      providers: [
        { provide: OrdersService, useValue: service },
        { provide: UndoService, useValue: undo },
      ],
    });
  });

  it('shows skeleton rows while the orders load', () => {
    create(new Subject());
    expect(el().querySelectorAll('.sk-row').length).toBe(6);
    expect(el().querySelector('[role="status"]')?.textContent).toContain('Loading orders');
  });

  it('shows an inline error with "Try again"', () => {
    create(throwError(() => ({ status: 0 })));
    expect(text()).toContain('We could not load your orders. Check your connection.');
    service.list.and.returnValue(ok(toOrders(ORDERS)));
    button('Try again')!.click();
    fixture.detectChanges();
    expect(el().querySelectorAll('tbody tr').length).toBe(4);
  });

  it('teaches in the empty state, with the one primary button', () => {
    create(ok([]));
    expect(text()).toContain('No orders yet');
    expect(text()).toContain('An order starts from a quotation the customer has accepted');
    const primary = el().querySelectorAll('.btn-primary');
    expect(primary.length).toBe(1);
    expect(primary[0].getAttribute('href')).toBe('/quotation');
  });

  it('has a tab per stage with the count the api returns; All counts the cancelled orders it lists', () => {
    create();
    const tabs = Array.from(el().querySelectorAll('.tab')).map((t) => t.textContent!.replace(/\s+/g, ' ').trim());
    expect(tabs).toEqual(['All4', 'Confirmed1', 'In production0', 'Ready1', 'Dispatched0', 'Installed0', 'Closed1', 'Overdue1', 'Cancelled1']);
    expect(el().querySelector('.tab[aria-selected="true"]')?.textContent).toContain('All');
  });

  it('lists number, project, customer, stage, promised date and money through the INR pipe', () => {
    create();
    const rows = Array.from(el().querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' '));
    expect(rows.length).toBe(4);
    expect(rows[3]).toContain('Cancelled');
    expect(rows[0]).toContain('ORD/26-27/0003');
    expect(rows[0]).toContain('Showroom front');
    expect(rows[0]).toContain('Modern Homes LLP');
    expect(rows[0]).toContain('Confirmed');
    expect(rows[0]).toContain('Not set');
    expect(rows[0]).toContain('₹58,807.00');
    expect(rows[0]).toContain('Unpaid');
    expect(rows[1]).toContain('Overdue');
    expect(rows[1]).toContain('18 Oct 2026');
    expect(rows[2]).toContain('Paid');
    expect(el().querySelector('tbody a')?.getAttribute('href')).toBe('/orders/3');
    expect(el().querySelectorAll('.btn-primary').length).toBe(0);
  });

  it('filters by tab through the address, and says so when a tab is empty', () => {
    create();
    (Array.from(el().querySelectorAll('.tab')) as HTMLButtonElement[]).find((t) => t.textContent!.includes('Ready'))!.click();
    fixture.detectChanges();
    expect(router.navigate).toHaveBeenCalled();
    expect(component.tab).toBe('ready');
    expect(el().querySelectorAll('tbody tr').length).toBe(1);
    component.setTab('cancelled');
    fixture.detectChanges();
    expect(el().querySelector('tbody tr')?.textContent).toContain('Cancelled');
    component.setTab('dispatched');
    fixture.detectChanges();
    expect(text()).toContain('No dispatched orders');
    button('Show all orders')!.click();
    fixture.detectChanges();
    expect(el().querySelectorAll('tbody tr').length).toBe(4);
  });

  it('opens the tab and the view named in the address', () => {
    create(ok(toOrders(ORDERS)), { stage: 'overdue' });
    expect(el().querySelector('.tab[aria-selected="true"]')?.textContent).toContain('Overdue');
    expect(el().querySelectorAll('tbody tr').length).toBe(1);
  });

  it('searches in the browser', () => {
    create();
    component.search = 'sharma';
    component.onSearch();
    fixture.detectChanges();
    expect(el().querySelectorAll('tbody tr').length).toBe(1);
    component.search = 'nobody';
    fixture.detectChanges();
    expect(text()).toContain('No order matches "nobody"');
  });

  it('shows a board with a column per stage; cancelled orders are not on it', () => {
    create(ok(toOrders(ORDERS)), { view: 'board' });
    const columns = Array.from(el().querySelectorAll('.column'));
    expect(columns.map((c) => c.querySelector('.column-head')!.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      'Confirmed1',
      'In production0',
      'Ready1',
      'Dispatched0',
      'Installed0',
      'Closed1',
    ]);
    expect(columns[1].textContent).toContain('Nothing here');
    const ready = columns[2].querySelector('.job')!;
    expect(ready.classList).toContain('is-late');
    expect(ready.textContent).toContain('Sharma Residency');
    expect(ready.textContent).toContain('₹17,728.00 to pay');
    expect(ready.querySelector('a')?.getAttribute('href')).toBe('/orders/2');
    expect(ready.querySelector('.job-next')?.textContent).toContain('Dispatch');
    expect(columns[5].querySelector('.job-next')).toBeNull();
  });

  it('switches between the list and the board', () => {
    create();
    button('Board')!.click();
    fixture.detectChanges();
    expect(el().querySelector('.board')).not.toBeNull();
    expect(button('Board')!.getAttribute('aria-pressed')).toBe('true');
    button('List')!.click();
    fixture.detectChanges();
    expect(el().querySelector('.board')).toBeNull();
  });

  it('moves a board card to the next stage in one tap and offers Undo', () => {
    create(ok(toOrders(ORDERS)), { view: 'board' });
    service.setStage.and.returnValue(ok(toOrderPage(rawOrderPage({ id: 2, number: 'ORD/26-27/0002', stage: 'dispatched' }))));
    (el().querySelectorAll('.column')[2].querySelector('.job-next') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(service.setStage).toHaveBeenCalledWith(2, 'dispatched');
    expect(el().querySelectorAll('.column')[3].querySelectorAll('.job').length).toBe(1);
    expect(service.counts).toHaveBeenCalledTimes(2);
    const offer = undo.offer.calls.mostRecent().args[0];
    expect(offer.message).toBe('ORD/26-27/0002 is now Dispatched');

    service.setStage.and.returnValue(ok(toOrderPage(rawOrderPage({ id: 2, number: 'ORD/26-27/0002', stage: 'ready' }))));
    offer.undo!();
    fixture.detectChanges();
    expect(service.setStage).toHaveBeenCalledWith(2, 'ready');
    expect(el().querySelectorAll('.column')[2].querySelectorAll('.job').length).toBe(1);
    expect(undo.offer).toHaveBeenCalledTimes(1);
  });

  it('asks before closing an order that still owes money, with the amount', () => {
    const owing = rawOrder({ id: 7, number: 'ORD/26-27/0007', stage: 'installed', total: 35456, received: 19000, balance: 16456 });
    create(ok(toOrders([owing])), { view: 'board' });
    (el().querySelector('.job-next') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(service.setStage).not.toHaveBeenCalled();
    const dialog = el().querySelector('app-confirm-dialog')!;
    expect(dialog.textContent).toContain('Close ORD/26-27/0007 with ₹16,456.00 still to pay?');
    expect(dialog.textContent!.replace(/\s+/g, ' ')).toContain('Received₹19,000.00');

    button('Keep it open')!.click();
    fixture.detectChanges();
    expect(el().querySelector('app-confirm-dialog')).toBeNull();
    expect(service.setStage).not.toHaveBeenCalled();

    (el().querySelector('.job-next') as HTMLButtonElement).click();
    fixture.detectChanges();
    service.setStage.and.returnValue(ok(toOrderPage(rawOrderPage({ ...owing, stage: 'closed' }))));
    (Array.from(el().querySelectorAll('app-confirm-dialog button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes('Close order'))!.click();
    fixture.detectChanges();
    expect(service.setStage).toHaveBeenCalledWith(7, 'closed');
    expect(el().querySelector('app-confirm-dialog')).toBeNull();
  });

  it('closes a paid order in one tap', () => {
    create(ok(toOrders([rawOrder({ id: 8, stage: 'installed', balance: 0, received: 35456, payment_status: 'paid' })])), { view: 'board' });
    service.setStage.and.returnValue(ok(toOrderPage(rawOrderPage({ id: 8, stage: 'closed', balance: 0 }))));
    (el().querySelector('.job-next') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(service.setStage).toHaveBeenCalledWith(8, 'closed');
    expect(el().querySelector('app-confirm-dialog')).toBeNull();
  });

  it('says why an order was not moved', () => {
    create(ok(toOrders(ORDERS)), { view: 'board' });
    service.setStage.and.returnValue(of({ ok: false as const, message: 'Order is cancelled; its stage cannot change' }));
    (el().querySelector('.job-next') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(text()).toContain('ORD/26-27/0003 was not moved. Order is cancelled; its stage cannot change');
    service.setStage.and.returnValue(throwError(() => ({ status: 0 })));
    (el().querySelector('.job-next') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(text()).toContain('ORD/26-27/0003 was not moved. Check your connection.');
    expect(button('Try again')).toBeDefined();
  });

  it('still lists the orders when the counts fail', () => {
    service.counts.and.returnValue(throwError(() => ({ status: 500 })));
    create();
    expect(el().querySelectorAll('tbody tr').length).toBe(4);
    expect(el().querySelector('.tab .count')).toBeNull();
  });

  it('gives every button and link an accessible name', () => {
    create(ok(toOrders(ORDERS)), { view: 'board' });
    for (const control of Array.from(el().querySelectorAll('button, a'))) {
      expect((control.getAttribute('aria-label') || control.textContent || '').trim()).not.toBe('');
    }
  });
});
