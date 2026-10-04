import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { httpMessage, toResult, todayIso } from './api-result';
import { documentName, fileNameFromHeader, previewPage, readDocument } from './document-file';
import {
  accountFromOutstanding,
  amountError,
  amountText,
  jobNumber,
  matchesCustomer,
  referenceLabel,
  reminderLink,
  reminderText,
  scopeQuery,
  toAccount,
  toOutstanding,
  toPayment,
  toPaymentList,
  whatsappNumber,
} from './payments.adapter';
import { apiOk, apiRefusal, rawAccount, rawOutstanding, rawPayment, rawPaymentList, rawRefund } from './payments.testing';

describe('api-result', () => {
  it('maps a success and keeps the api wording of a refusal', () => {
    expect(toResult(apiOk({ a: 1 }), (d) => d.a)).toEqual({ ok: true, data: 1, message: 'ok' });
    const refusal = toResult(apiRefusal('amount is more than the balance of ₹5,575.34', { order_id: 4 }), (d) => d);
    expect(refusal.ok).toBeFalse();
    expect(refusal.message).toBe('amount is more than the balance of ₹5,575.34');
    expect((refusal as any).data).toEqual({ order_id: 4 });
    expect(toResult(null, (d) => d, 'Fallback').message).toBe('Fallback');
  });

  it('says the api reason of a failed request, else the connection', () => {
    expect(httpMessage({ error: { message: 'Invalid order id' } }, 'Not loaded.')).toBe('Not loaded. Invalid order id');
    expect(httpMessage({}, 'Not loaded.')).toBe('Not loaded. Check your connection.');
  });

  it('says a record that does not exist in plain words, not with the model name', () => {
    const missing = 'It was not found: it may have been deleted, or the address is wrong.';
    expect(httpMessage({ status: 404, error: { message: 'No query results for model [App\\Models\\Order] 99999' } }, 'We could not load this order.')).toBe(
      'We could not load this order. ' + missing
    );
    expect(httpMessage({ status: 404 }, 'Not loaded.')).toBe('Not loaded. ' + missing);
    expect(toResult({ status: 0, message: 'No query results for model [App\\Models\\Quatation] 99999' }, (d) => d).message).toBe(missing);
  });

  it('gives today as a local date', () => {
    expect(todayIso(new Date(2026, 9, 5, 0, 30))).toBe('2026-10-05');
  });
});

describe('payments adapter', () => {
  it('reads the account as the api returns it, without working anything out', () => {
    const account = toAccount(rawAccount({ refunded: 1500, net_received: 16228, balance: 19228 }))!;
    expect(account.total).toBe(35456);
    expect(account.received).toBe(17728);
    expect(account.netReceived).toBe(16228);
    expect(account.balance).toBe(19228);
    expect(account.advance).toEqual({ percent: 50, amount: 17728, received: 17728, due: 0 });
    expect(account.order).toEqual({ id: 1, number: 'ORD/26-27/0001', status: 'active', stage: 'confirmed' });
    expect(account.bill).toBeNull();
    expect(toAccount(null)).toBeNull();
    expect(toAccount(rawAccount({ advance: null }))!.advance).toBeNull();
  });

  it('reads a receipt and a refund; a refund keeps its negative signed amount', () => {
    const receipt = toPayment(rawPayment());
    expect(receipt.kind).toBe('receipt');
    expect(receipt.signedAmount).toBe(17728);
    expect(receipt.modeLabel).toBe('UPI');
    expect(receipt.recordedBy).toBe('Super Admin');
    const refund = toPayment(rawRefund());
    expect(refund.kind).toBe('refund');
    expect(refund.amount).toBe(1500);
    expect(refund.signedAmount).toBe(-1500);
    expect(toPayment(rawPayment({ status: 'cancelled', cancel_reason: 'Typed twice' })).cancelled).toBeTrue();
    expect(toPayment({ kind: 'refund', amount: 10, mode: 'CHEQUE' }).signedAmount).toBe(-10);
    expect(toPayment({ mode: 'CHEQUE' }).modeLabel).toBe('Cheque');
  });

  it('reads the list with the api totals and the account', () => {
    const list = toPaymentList(rawPaymentList());
    expect(list.payments.map((p) => p.number)).toEqual(['RCT/26-27/0003', 'RCT/26-27/0001']);
    expect(list.totals).toEqual({ received: 17728, refunded: 1500, netReceived: 16228 });
    expect(list.account?.balance).toBe(19228);
    expect(toPaymentList({}).payments).toEqual([]);
    expect(toPaymentList({ payments: [], account: null }).account).toBeNull();
  });

  it('asks for the payments of an order, a bill, a customer, or all', () => {
    expect(scopeQuery({ orderId: 4 })).toBe('?order_id=4');
    expect(scopeQuery({ billId: 3 })).toBe('?bill_id=3');
    expect(scopeQuery({ customerId: 2 })).toBe('?customer_id=2');
    expect(scopeQuery({})).toBe('');
  });

  it('builds the outstanding columns from the buckets the api sends', () => {
    const list = toOutstanding(rawOutstanding());
    expect(list.buckets.map((b) => b.label)).toEqual(['0 to 30 days', '31 to 60 days', '61 to 90 days', 'Over 90 days']);
    expect(list.totals.balance).toBe(21549.98);
    expect(list.totals.buckets).toEqual({ d0_30: 20049.98, d31_60: 0, d61_90: 0, d90_plus: 1500 });
    expect(list.customers[0].buckets['d0_30']).toBe(20049.98);
    expect(list.customers[0].accounts[0].bill).toEqual({ id: 2, number: 'INV/26-27/0001' });
    expect(list.customers[1].accounts[0].basis).toBe('order');
    expect(toOutstanding({}).customers).toEqual([]);
  });

  it('makes the account "Record payment" needs from an outstanding row', () => {
    const list = toOutstanding(rawOutstanding());
    const account = accountFromOutstanding(list.customers[0], list.customers[0].accounts[0]);
    expect(account.balance).toBe(20049.98);
    expect(account.bill?.id).toBe(2);
    expect(account.order).toBeNull();
    expect(account.customerName).toBe('Sharma Residency');
    expect(jobNumber(account)).toBe('INV/26-27/0001');
  });

  it('checks a typed amount before it is sent', () => {
    expect(amountError('', 'receipt', 100)).toBe('Enter the amount.');
    expect(amountError('12.345', 'receipt', 100)).toContain('at most two decimals');
    expect(amountError('abc', 'receipt', 100)).toContain('at most two decimals');
    expect(amountError('0', 'receipt', 100)).toBe('The amount must be more than zero.');
    expect(amountError('100.01', 'receipt', 100)).toBe('The balance is ₹100.00. Enter that or less.');
    expect(amountError('100.01', 'refund', 100)).toBe('A refund cannot be more than the ₹100.00 received.');
    expect(amountError('100', 'receipt', 100)).toBeNull();
    expect(amountError('1,500.50', 'receipt', 2000)).toBeNull();
    expect(amountText(' 1,500.50 ')).toBe('1500.50');
  });

  it('labels the reference by mode', () => {
    expect(referenceLabel('cheque')).toBe('Cheque number');
    expect(referenceLabel('upi')).toContain('UPI reference');
    expect(referenceLabel('bank')).toContain('Bank reference');
    expect(referenceLabel('cash')).toBe('Reference (optional)');
  });

  it('makes a wa.me reminder only for a usable Indian mobile number', () => {
    expect(whatsappNumber('98234 56781')).toBe('919823456781');
    expect(whatsappNumber('+91 98234-56781')).toBe('919823456781');
    expect(whatsappNumber('09823456781')).toBe('919823456781');
    expect(whatsappNumber('12345')).toBeNull();
    expect(whatsappNumber('')).toBeNull();

    const [sharma, ahmed] = toOutstanding(rawOutstanding()).customers;
    const words = reminderText(sharma, 'Hakimi Enterprise');
    expect(words).toContain('Hello Sharma Residency');
    expect(words).toContain('from Hakimi Enterprise');
    expect(words).toContain('₹20,049.98 is pending against INV/26-27/0001');
    expect(reminderText(sharma, '')).not.toContain(' from ');
    const link = reminderLink(sharma, 'Hakimi Enterprise')!;
    expect(link.startsWith('https://wa.me/919823456781?text=')).toBeTrue();
    expect(decodeURIComponent(link.split('text=')[1])).toBe(words);
    expect(reminderLink(ahmed, 'Hakimi Enterprise')).toBeNull();
  });

  it('searches customers by name, phone and job number', () => {
    const [sharma] = toOutstanding(rawOutstanding()).customers;
    expect(matchesCustomer(sharma, 'sharma')).toBeTrue();
    expect(matchesCustomer(sharma, '98234')).toBeTrue();
    expect(matchesCustomer(sharma, 'inv/26-27')).toBeTrue();
    expect(matchesCustomer(sharma, 'ahmed')).toBeFalse();
    expect(matchesCustomer(sharma, '  ')).toBeTrue();
  });
});

describe('document-file', () => {
  it('reads the file name the api sent', () => {
    expect(fileNameFromHeader('attachment; filename="Receipt-RCT-26-27-0001-Ahmed-Al-Rashid.pdf"')).toBe(
      'Receipt-RCT-26-27-0001-Ahmed-Al-Rashid.pdf'
    );
    expect(fileNameFromHeader("attachment; filename*=UTF-8''Delivery%20challan.pdf")).toBe('Delivery challan.pdf');
    expect(fileNameFromHeader(null)).toBeNull();
    expect(documentName('Receipt', 'RCT/26-27/0001')).toBe('Receipt-RCT-26-27-0001.pdf');
  });

  it('turns a JSON answer into an error with the api message', async () => {
    const body = new Blob([JSON.stringify({ status: 0, message: 'Invalid payment id' })], { type: 'application/json' });
    await expectAsync(firstValueFrom(readDocument(new HttpResponse({ body }), 'pdf'))).toBeRejectedWithError('Invalid payment id');
    await expectAsync(firstValueFrom(readDocument(new HttpResponse({ body: new Blob([]) }), 'pdf'))).toBeRejectedWithError(
      'The document came back empty.'
    );
  });

  it('returns the document typed as a PDF with its name', async () => {
    const response = new HttpResponse({
      body: new Blob(['%PDF'], { type: 'application/octet-stream' }),
      headers: new HttpHeaders({ 'Content-Disposition': 'attachment; filename="Receipt-RCT-26-27-0001.pdf"' }),
    });
    const file = await firstValueFrom(readDocument(response, 'pdf'));
    expect(file.blob.type).toBe('application/pdf');
    expect(file.fileName).toBe('Receipt-RCT-26-27-0001.pdf');
  });

  it('adds screen-only rules to the preview page and leaves the document alone', () => {
    expect(previewPage('<html><head><title>x</title></head><body>R</body></html>')).toContain('@media screen');
    expect(previewPage('<p>R</p>')).toContain('<p>R</p>');
  });
});
