/** Api answers for the specs, in the shapes of docs/review/e2e/orders-payments/. */

export function rawAccount(overrides: any = {}): any {
  return {
    quatation_id: 14,
    customer_id: 2,
    customer_name: 'Ahmed Al-Rashid',
    order: { id: 1, number: 'ORD/26-27/0001', status: 'active', stage: 'confirmed' },
    bill: null,
    total: 35456,
    received: 17728,
    refunded: 0,
    net_received: 17728,
    balance: 17728,
    overpaid: 0,
    status: 'part_paid',
    advance: { percent: 50, amount: 17728, received: 17728, due: 0 },
    payment_count: 1,
    last_payment_date: '2026-10-04',
    formatted: { total: '₹35,456.00', received: '₹17,728.00', balance: '₹17,728.00' },
    ...overrides,
  };
}

export function rawPayment(overrides: any = {}): any {
  return {
    id: 1,
    number: 'RCT/26-27/0001',
    kind: 'receipt',
    payment_date: '2026-10-04',
    amount: 17728,
    signed_amount: 17728,
    formatted_amount: '₹17,728.00',
    mode: 'upi',
    mode_label: 'UPI',
    reference: 'UTR 428811907733',
    note: 'Advance as per payment terms',
    status: 'active',
    cancelled_at: null,
    cancel_reason: null,
    order_id: 1,
    order_number: 'ORD/26-27/0001',
    bill_id: null,
    bill_number: null,
    quatation_id: 14,
    customer_id: 2,
    customer_name: 'Ahmed Al-Rashid',
    created_by: { id: 1, name: 'Super Admin' },
    created_at: '2026-10-04T19:10:20+00:00',
    ...overrides,
  };
}

export function rawRefund(overrides: any = {}): any {
  return rawPayment({
    id: 3,
    number: 'RCT/26-27/0003',
    kind: 'refund',
    amount: 1500,
    signed_amount: -1500,
    mode: 'bank',
    mode_label: 'Bank transfer',
    reference: 'NEFT 5521',
    ...overrides,
  });
}

export function rawPaymentList(overrides: any = {}): any {
  return {
    payments: [rawRefund(), rawPayment()],
    totals: { received: 17728, refunded: 1500, net_received: 16228 },
    account: rawAccount({ refunded: 1500, net_received: 16228, balance: 19228 }),
    ...overrides,
  };
}

export function rawOutstanding(overrides: any = {}): any {
  return {
    as_of: '2026-10-04',
    buckets: [
      { key: 'd0_30', label: '0 to 30 days' },
      { key: 'd31_60', label: '31 to 60 days' },
      { key: 'd61_90', label: '61 to 90 days' },
      { key: 'd90_plus', label: 'Over 90 days' },
    ],
    totals: {
      total: 55505.98,
      received: 33956,
      balance: 21549.98,
      d0_30: 20049.98,
      d31_60: 0,
      d61_90: 0,
      d90_plus: 1500,
      customers: 2,
      accounts: 2,
      formatted_balance: '₹21,549.98',
    },
    customers: [
      {
        customer_id: 3,
        name: 'Sharma Residency',
        phone: '9823456781',
        total: 20049.98,
        received: 0,
        balance: 20049.98,
        oldest_days: 12,
        d0_30: 20049.98,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 0,
        accounts: [
          {
            quatation_id: 17,
            order: null,
            bill: { id: 2, number: 'INV/26-27/0001' },
            basis: 'bill',
            date: '2026-09-22',
            age_days: 12,
            bucket: 'd0_30',
            total: 20049.98,
            received: 0,
            balance: 20049.98,
          },
        ],
      },
      {
        customer_id: 2,
        name: 'Ahmed Al-Rashid',
        phone: '',
        total: 35456,
        received: 33956,
        balance: 1500,
        oldest_days: 95,
        d0_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 1500,
        accounts: [
          {
            quatation_id: 14,
            order: { id: 1, number: 'ORD/26-27/0001' },
            bill: null,
            basis: 'order',
            date: '2026-07-01',
            age_days: 95,
            bucket: 'd90_plus',
            total: 35456,
            received: 33956,
            balance: 1500,
          },
        ],
      },
    ],
    ...overrides,
  };
}

export const apiOk = (data: any, message = 'ok'): any => ({ success: true, data, message });
export const apiRefusal = (message: string, data?: any): any => ({ status: 0, message, ...(data ? { data } : {}) });
