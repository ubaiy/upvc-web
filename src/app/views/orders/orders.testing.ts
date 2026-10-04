import { rawAccount } from '../payments/payments.testing';

/** Api answers for the specs, in the shape of docs/review/e2e/orders-payments/ORD-26-27-0001-order.json. */

const STAGES: [string, string, string][] = [
  ['confirmed', 'Confirmed', 'Confirm order'],
  ['in_production', 'In production', 'Start production'],
  ['ready', 'Ready', 'Mark ready'],
  ['dispatched', 'Dispatched', 'Dispatch'],
  ['installed', 'Installed', 'Mark installed'],
  ['closed', 'Closed', 'Close order'],
];

/** An order at `stage`, with the stage rows and the next stage the api would send. */
export function rawOrder(overrides: any = {}): any {
  const stage = overrides.stage || 'confirmed';
  const at = STAGES.findIndex((s) => s[0] === stage);
  const next = STAGES[at + 1];
  return {
    id: 1,
    number: 'ORD/26-27/0001',
    order_date: '2026-10-04',
    financial_year: '26-27',
    status: 'active',
    stage,
    stage_label: STAGES[at][1],
    next_stage: next ? { stage: next[0], label: next[1], action: next[2] } : null,
    stages: STAGES.map((s, index) => ({
      stage: s[0],
      label: s[1],
      done: index <= at,
      current: index === at,
      at: index <= at ? '2026-10-04T19:10:20+00:00' : null,
      date: index <= at ? '2026-10-04' : null,
      by: index <= at ? { id: 1, name: 'Super Admin' } : null,
    })),
    promised_date: '2026-10-18',
    is_overdue: false,
    cancelled_at: null,
    cancel_reason: null,
    quatation_id: 14,
    quatation_number: 'Q-0003',
    quatation_name: 'Al-Rashid Villa Windows',
    customer_id: 2,
    name: 'Ahmed Al-Rashid',
    phone: '9812345670',
    email: 'ahmed@example.com',
    item_count: 3,
    total_quantity: 3,
    subtotal: 30047.05,
    discount_amount: 0,
    taxable_value: 30047.05,
    total_tax: 5408.46,
    round_off: 0.49,
    total: 35456,
    received: 17728,
    balance: 17728,
    payment_status: 'part_paid',
    challan_number: 'DC/26-27/0001',
    vehicle_number: 'GJ 03 AB 1234',
    transporter: 'Own vehicle',
    notes: 'Unload at the rear gate.',
    workshop_note: 'Site visit before install.',
    ...overrides,
  };
}

export function rawOrderPage(overrides: any = {}): any {
  return {
    ...rawOrder(overrides),
    totals: {
      total: 35456,
      tax: {
        lines: [
          { code: 'CGST', rate: 9, label: 'CGST 9%', amount: 2704.23 },
          { code: 'SGST', rate: 9, label: 'SGST 9%', amount: 2704.23 },
        ],
      },
      payment_term: { id: 1, name: '50% Advance, 50% on Delivery' },
    },
    customer: { id: 2, name: 'Ahmed Al-Rashid' },
    customer_address: { address: 'Villa 14, Palm Street', address_line2: 'Al Olaya District', city: 'Rajkot', state: 'Gujarat', zip_code: '360001' },
    payment_terms: { id: 1, name: '50% Advance, 50% on Delivery' },
    quatation: { id: 14, number: 'Q-0003', name: 'Al-Rashid Villa Windows', status: 'accepted' },
    production_job: { id: 1, number: 'Q-0003/P1', revision: 1, verified: false },
    bill: null,
    account: rawAccount(),
    order_product: [
      { id: 1, label: null, product_type: 'Window', width: '1800', height: '1200', hsn_code: '3925 20 00', quantity: 1, amount: 8851.86, total: 7376.55 },
      { id: 2, label: 'Master bedroom', product_type: 'Window', width: '1200', height: '1200', hsn_code: '3925 20 00', quantity: 2, amount: 21195.19, total: 17662.66 },
    ],
    ...overrides,
  };
}
