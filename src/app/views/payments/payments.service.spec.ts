import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from 'src/environments/environment';

import { apiOk, apiRefusal, rawAccount, rawOutstanding, rawPayment, rawPaymentList } from './payments.testing';
import { PaymentsService } from './payments.service';

const API = environment.API_URL;

describe('PaymentsService', () => {
  let service: PaymentsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(PaymentsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the payments of an order with its account', () => {
    let balance = 0;
    service.list({ orderId: 1 }).subscribe((result) => (balance = result.ok ? result.data.account!.balance : -1));
    http.expectOne(`${API}/payment/list?order_id=1`).flush(apiOk(rawPaymentList()));
    expect(balance).toBe(19228);
  });

  it('lists the payments of a bill, of a customer, and all of them', () => {
    service.list({ billId: 3 }).subscribe();
    http.expectOne(`${API}/payment/list?bill_id=3`).flush(apiOk(rawPaymentList()));
    service.list({ customerId: 2 }).subscribe();
    http.expectOne(`${API}/payment/list?customer_id=2`).flush(apiOk(rawPaymentList({ account: null })));
    let account: any = 'unset';
    service.list().subscribe((result) => (account = result.ok ? result.data.account : 'refused'));
    http.expectOne(`${API}/payment/list`).flush(apiOk(rawPaymentList({ account: null })));
    expect(account).toBeNull();
  });

  it('posts a payment as given and returns it with the account', () => {
    let number = '';
    const body = { kind: 'receipt' as const, order_id: 1, amount: '2500.50', mode: 'cash' as const, payment_date: '2026-10-01' };
    service.add(body).subscribe((result) => (number = result.ok ? result.data.payment.number : ''));
    const request = http.expectOne(`${API}/payment/add`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush(apiOk({ ...rawPayment({ number: 'RCT/26-27/0004' }), account: rawAccount() }));
    expect(number).toBe('RCT/26-27/0004');
  });

  it('hands a refusal on with the api wording', () => {
    let message = '';
    service
      .add({ kind: 'receipt', order_id: 1, amount: '99999', mode: 'cash', payment_date: '2026-10-05' })
      .subscribe((result) => (message = result.ok ? '' : result.message));
    http.expectOne(`${API}/payment/add`).flush(apiRefusal('amount is more than the balance of ₹5,575.34'));
    expect(message).toBe('amount is more than the balance of ₹5,575.34');
  });

  it('cancels an entry with a reason, or with none', () => {
    service.cancel(7, 'Typed twice').subscribe();
    const first = http.expectOne(`${API}/payment/cancel/7`);
    expect(first.request.body).toEqual({ reason: 'Typed twice' });
    first.flush(apiOk({ ...rawPayment({ status: 'cancelled' }), account: rawAccount() }));
    service.cancel(7, '').subscribe();
    const second = http.expectOne(`${API}/payment/cancel/7`);
    expect(second.request.body).toEqual({});
    second.flush(apiRefusal('Payment is already cancelled'));
  });

  it('asks for the outstanding list, by basis when one is chosen', () => {
    let customers = 0;
    service.outstanding().subscribe((result) => (customers = result.ok ? result.data.customers.length : -1));
    http.expectOne(`${API}/payment/outstanding`).flush(apiOk(rawOutstanding()));
    expect(customers).toBe(2);
    service.outstanding('bill').subscribe();
    http.expectOne(`${API}/payment/outstanding?basis=bill`).flush(apiOk(rawOutstanding()));
  });

  it('fetches the receipt page for a preview and the PDF for a download', async () => {
    const preview = service.receipt(4, 'html');
    const done = new Promise<string>((resolve) => preview.subscribe((file) => resolve(file.blob.type)));
    const request = http.expectOne((r) => r.url === `${API}/payment/receipt/4`);
    expect(request.request.params.get('format')).toBe('html');
    expect(request.request.params.has('download')).toBeFalse();
    request.flush(new Blob(['<p>Receipt</p>'], { type: 'text/html' }));
    expect(await done).toContain('text/html');

    service.receipt(4, 'pdf', true).subscribe();
    const pdf = http.expectOne((r) => r.url === `${API}/payment/receipt/4`);
    expect(pdf.request.params.get('format')).toBe('pdf');
    expect(pdf.request.params.get('download')).toBe('1');
    pdf.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
  });

  it('reads the company name for the reminder, and does without it when the call fails', () => {
    let name = 'x';
    service.companyName().subscribe((value) => (name = value));
    http.expectOne(`${API}/company/settings`).flush(apiOk({ id: 1, name: 'Hakimi Enterprise' }));
    expect(name).toBe('Hakimi Enterprise');
    service.companyName().subscribe((value) => (name = value));
    http.expectOne(`${API}/company/settings`).flush('down', { status: 500, statusText: 'Server Error' });
    expect(name).toBe('');
  });
});
