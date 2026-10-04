import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from 'src/environments/environment';

import { apiOk, apiRefusal } from '../payments/payments.testing';
import { TABS, earlierStages, inTab, matchesOrder, paymentBadge, toBoard, toCounts, toOrder, toOrderPage, toOrders } from './orders.adapter';
import { OrdersService } from './orders.service';
import { rawOrder, rawOrderPage } from './orders.testing';

const API = environment.API_URL;

describe('orders adapter', () => {
  it('reads an order as the api returns it: the next stage is the api\'s, money is not touched', () => {
    const order = toOrder(rawOrder({ stage: 'ready', is_overdue: true }));
    expect(order.number).toBe('ORD/26-27/0001');
    expect(order.stage).toBe('ready');
    expect(order.stageLabel).toBe('Ready');
    expect(order.nextStage).toEqual({ stage: 'dispatched', label: 'Dispatched', action: 'Dispatch' });
    expect(order.stages.length).toBe(6);
    expect(order.stages[2]).toEqual({ stage: 'ready', label: 'Ready', done: true, current: true, date: '2026-10-04', by: 'Super Admin' });
    expect(order.stages[3].date).toBe('');
    expect(order.isOverdue).toBeTrue();
    expect(order.total).toBe(35456);
    expect(order.balance).toBe(17728);
    expect(order.paymentStatus).toBe('part_paid');
    expect(order.customerName).toBe('Ahmed Al-Rashid');
  });

  it('has no next stage on a closed or a cancelled order', () => {
    expect(toOrder(rawOrder({ stage: 'closed' })).nextStage).toBeNull();
    const cancelled = toOrder(rawOrder({ status: 'cancelled', next_stage: null, cancel_reason: 'Customer withdrew' }));
    expect(cancelled.cancelled).toBeTrue();
    expect(cancelled.nextStage).toBeNull();
    expect(cancelled.cancelReason).toBe('Customer withdrew');
    expect(toOrders(null)).toEqual([]);
  });

  it('reads the order page: lines, the api tax lines, links and the account', () => {
    const page = toOrderPage(rawOrderPage());
    expect(page.lines.map((l) => l.name)).toEqual(['Window 1 · Window', 'Master bedroom · Window']);
    expect(page.lines[0].size).toBe('1800 × 1200 mm');
    expect(page.lines[1].amount).toBe(21195.19);
    expect(page.taxLines).toEqual([
      { label: 'CGST 9%', amount: 2704.23 },
      { label: 'SGST 9%', amount: 2704.23 },
    ]);
    expect(page.quotation).toEqual({ id: 14, number: 'Q-0003', name: 'Al-Rashid Villa Windows', status: 'accepted' });
    expect(page.productionJob).toEqual({ number: 'Q-0003/P1', revision: 1, verified: false });
    expect(page.bill).toBeNull();
    expect(page.account?.balance).toBe(17728);
    expect(page.address).toBe('Villa 14, Palm Street, Al Olaya District, Rajkot, Gujarat, 360001');
    expect(page.paymentTerm).toBe('50% Advance, 50% on Delivery');
    const billed = toOrderPage(rawOrderPage({ bill: { id: 3, number: 'INV/26-27/0002', bill_date: '2026-10-05', total: 35456 }, production_job: null }));
    expect(billed.bill).toEqual({ id: 3, number: 'INV/26-27/0002', date: '2026-10-05', total: 35456 });
    expect(billed.productionJob).toBeNull();
  });

  it('sorts orders under the tabs and into board columns', () => {
    const orders = toOrders([
      rawOrder({ id: 1, stage: 'confirmed' }),
      rawOrder({ id: 2, stage: 'ready', is_overdue: true }),
      rawOrder({ id: 3, stage: 'ready', status: 'cancelled' }),
      rawOrder({ id: 4, stage: 'closed' }),
    ]);
    const ids = (tab: any) => orders.filter((o) => inTab(o, tab)).map((o) => o.id);
    expect(ids('all')).toEqual([1, 2, 4]);
    expect(ids('ready')).toEqual([2]);
    expect(ids('overdue')).toEqual([2]);
    expect(ids('cancelled')).toEqual([3]);
    const board = toBoard(orders);
    expect(board.map((c) => c.label)).toEqual(['Confirmed', 'In production', 'Ready', 'Dispatched', 'Installed', 'Closed']);
    expect(board.map((c) => c.orders.length)).toEqual([1, 0, 1, 0, 0, 1]);
    expect(TABS.map((t) => t.tab)).toEqual(['all', 'confirmed', 'in_production', 'ready', 'dispatched', 'installed', 'closed', 'overdue', 'cancelled']);
  });

  it('searches by number, project, customer and phone', () => {
    const order = toOrder(rawOrder());
    for (const term of ['ord/26-27', 'q-0003', 'villa', 'ahmed', '98123', '']) {
      expect(matchesOrder(order, term)).withContext(term).toBeTrue();
    }
    expect(matchesOrder(order, 'sharma')).toBeFalse();
  });

  it('offers the earlier stages for a wrong tap, the counts as sent, and a badge per payment status', () => {
    expect(earlierStages(toOrder(rawOrder({ stage: 'ready' }))).map((s) => s.stage)).toEqual(['confirmed', 'in_production']);
    expect(earlierStages(toOrder(rawOrder()))).toEqual([]);
    expect(toCounts({ all: 3, confirmed: 1, overdue: '2' })).toEqual({ all: 3, confirmed: 1, overdue: 2 });
    expect(toCounts(null)).toEqual({});
    expect(paymentBadge({ paymentStatus: 'paid' }).label).toBe('Paid');
    expect(paymentBadge({ paymentStatus: 'part_paid' }).label).toBe('Part paid');
    expect(paymentBadge({ paymentStatus: 'unpaid' }).label).toBe('Unpaid');
  });
});

describe('OrdersService', () => {
  let service: OrdersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(OrdersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches every order once, cancelled ones included, and the counts', () => {
    let count = -1;
    service.list().subscribe((result) => (count = result.ok ? result.data.length : -1));
    http.expectOne(`${API}/order/list?stage=all`).flush(apiOk([rawOrder(), rawOrder({ id: 2 })]));
    expect(count).toBe(2);
    service.counts().subscribe();
    http.expectOne(`${API}/order/stage-counts`).flush(apiOk({ all: 2 }));
    service.forQuotation(14).subscribe();
    http.expectOne(`${API}/order/list?stage=all&quatation_id=14`).flush(apiOk([]));
  });

  it('shows an order and moves it to a stage', () => {
    let stage = '';
    service.show(1).subscribe();
    http.expectOne(`${API}/order/show/1`).flush(apiOk(rawOrderPage()));
    service.setStage(1, 'in_production').subscribe((result) => (stage = result.ok ? result.data.stage : ''));
    const request = http.expectOne(`${API}/order/stage/1`);
    expect(request.request.body).toEqual({ stage: 'in_production' });
    request.flush(apiOk(rawOrderPage({ stage: 'in_production' })));
    expect(stage).toBe('in_production');
  });

  it('creates an order from a quotation; a refusal keeps the order id the api sends', () => {
    let refusal: any = null;
    service.create({ quatation_id: 14, promised_date: '2026-10-18' }).subscribe((result) => (refusal = result));
    const request = http.expectOne(`${API}/order/create`);
    expect(request.request.body).toEqual({ quatation_id: 14, promised_date: '2026-10-18' });
    request.flush(apiRefusal('Quatation already has an order (ORD/26-27/0001)', { order_id: 1 }));
    expect(refusal.ok).toBeFalse();
    expect(refusal.message).toBe('Quatation already has an order (ORD/26-27/0001)');
    expect(refusal.data.order_id).toBe(1);
  });

  it('saves only what is sent, and cancels with or without a reason', () => {
    service.update(1, { promised_date: '2026-10-20' }).subscribe();
    const update = http.expectOne(`${API}/order/update/1`);
    expect(update.request.body).toEqual({ promised_date: '2026-10-20' });
    update.flush(apiOk(rawOrderPage()));
    service.cancel(1, 'Customer withdrew').subscribe();
    const cancel = http.expectOne(`${API}/order/cancel/1`);
    expect(cancel.request.body).toEqual({ reason: 'Customer withdrew' });
    cancel.flush(apiOk(rawOrderPage({ status: 'cancelled' })));
    service.cancel(1, '').subscribe();
    const bare = http.expectOne(`${API}/order/cancel/1`);
    expect(bare.request.body).toEqual({});
    bare.flush(apiRefusal('Order is already cancelled'));
  });

  it('fetches the challan page for a preview and the PDF for a download', () => {
    service.challan(1, 'html').subscribe();
    const preview = http.expectOne((r) => r.url === `${API}/order/challan/1`);
    expect(preview.request.params.get('format')).toBe('html');
    expect(preview.request.params.has('download')).toBeFalse();
    preview.flush(new Blob(['<p>DC</p>'], { type: 'text/html' }));
    service.challan(1, 'pdf', true).subscribe();
    const pdf = http.expectOne((r) => r.url === `${API}/order/challan/1`);
    expect(pdf.request.params.get('download')).toBe('1');
    pdf.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
  });
});
