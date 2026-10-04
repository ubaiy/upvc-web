import { formatInr } from '../../shared/pipes/inr.pipe';
import { idOrNull, num, text } from './api-result';
import {
  Account,
  JobRef,
  Outstanding,
  OutstandingAccount,
  OutstandingCustomer,
  Payment,
  PaymentKind,
  PaymentList,
  PaymentMode,
  PaymentScope,
} from './payments.model';

/**
 * Every api field name of the payments contract (phase 19 log, section 3)
 * is read here. The screens only see the view types. No figure is worked
 * out: totals, balances and age buckets are the api's.
 */

export const MODES: { mode: PaymentMode; label: string }[] = [
  { mode: 'cash', label: 'Cash' },
  { mode: 'upi', label: 'UPI' },
  { mode: 'bank', label: 'Bank' },
  { mode: 'cheque', label: 'Cheque' },
];

const MODE_LABELS: Record<PaymentMode, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', cheque: 'Cheque' };

function jobRef(raw: any): JobRef | null {
  const id = idOrNull(raw?.id);
  return id ? { id, number: text(raw.number) } : null;
}

function mode(value: unknown): PaymentMode {
  const m = text(value).toLowerCase();
  return m === 'upi' || m === 'bank' || m === 'cheque' ? m : 'cash';
}

export function toAccount(raw: any): Account | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const order = jobRef(raw.order);
  const advance = raw.advance;
  return {
    quotationId: idOrNull(raw.quatation_id),
    customerId: idOrNull(raw.customer_id),
    customerName: text(raw.customer_name),
    order: order ? { ...order, status: text(raw.order.status), stage: text(raw.order.stage) } : null,
    bill: jobRef(raw.bill),
    total: num(raw.total),
    received: num(raw.received),
    refunded: num(raw.refunded),
    netReceived: num(raw.net_received ?? raw.received),
    balance: num(raw.balance),
    overpaid: num(raw.overpaid),
    status: raw.status === 'paid' || raw.status === 'part_paid' ? raw.status : 'unpaid',
    advance:
      advance && typeof advance === 'object'
        ? { percent: num(advance.percent), amount: num(advance.amount), received: num(advance.received), due: num(advance.due) }
        : null,
    paymentCount: num(raw.payment_count),
    lastPaymentDate: text(raw.last_payment_date),
  };
}

export function toPayment(raw: any): Payment {
  const kind: PaymentKind = raw?.kind === 'refund' ? 'refund' : 'receipt';
  const paymentMode = mode(raw?.mode);
  const amount = num(raw?.amount);
  return {
    id: num(raw?.id),
    number: text(raw?.number),
    kind,
    date: text(raw?.payment_date),
    amount,
    signedAmount: raw?.signed_amount === undefined || raw?.signed_amount === null ? (kind === 'refund' ? -amount : amount) : num(raw.signed_amount),
    mode: paymentMode,
    modeLabel: text(raw?.mode_label) || MODE_LABELS[paymentMode],
    reference: text(raw?.reference),
    note: text(raw?.note),
    cancelled: raw?.status === 'cancelled',
    cancelReason: text(raw?.cancel_reason),
    orderId: idOrNull(raw?.order_id),
    orderNumber: text(raw?.order_number),
    billId: idOrNull(raw?.bill_id),
    billNumber: text(raw?.bill_number),
    quotationId: idOrNull(raw?.quatation_id),
    customerId: idOrNull(raw?.customer_id),
    customerName: text(raw?.customer_name),
    recordedBy: text(raw?.created_by?.name),
  };
}

export function toPaymentList(raw: any): PaymentList {
  const totals = raw?.totals || {};
  return {
    payments: Array.isArray(raw?.payments) ? raw.payments.map(toPayment) : [],
    totals: { received: num(totals.received), refunded: num(totals.refunded), netReceived: num(totals.net_received) },
    account: toAccount(raw?.account),
  };
}

/** `payment/add`, `payment/show` and `payment/cancel` return the payment with its `account`. */
export function toSavedPayment(raw: any): { payment: Payment; account: Account | null } {
  return { payment: toPayment(raw), account: toAccount(raw?.account) };
}

export function scopeQuery(scope: PaymentScope): string {
  if (scope.orderId) {
    return `?order_id=${scope.orderId}`;
  }
  if (scope.billId) {
    return `?bill_id=${scope.billId}`;
  }
  return scope.customerId ? `?customer_id=${scope.customerId}` : '';
}

function bucketFigures(raw: any, keys: string[]): Record<string, number> {
  return keys.reduce<Record<string, number>>((all, key) => ({ ...all, [key]: num(raw?.[key]) }), {});
}

function toOutstandingAccount(raw: any): OutstandingAccount {
  return {
    quotationId: idOrNull(raw?.quatation_id),
    order: jobRef(raw?.order),
    bill: jobRef(raw?.bill),
    basis: raw?.basis === 'order' ? 'order' : 'bill',
    date: text(raw?.date),
    ageDays: num(raw?.age_days),
    bucket: text(raw?.bucket),
    total: num(raw?.total),
    received: num(raw?.received),
    balance: num(raw?.balance),
  };
}

export function toOutstanding(raw: any): Outstanding {
  const buckets = Array.isArray(raw?.buckets)
    ? raw.buckets.map((b: any) => ({ key: text(b?.key), label: text(b?.label) })).filter((b: any) => b.key)
    : [];
  const keys = buckets.map((b: any) => b.key);
  const totals = raw?.totals || {};
  return {
    asOf: text(raw?.as_of),
    buckets,
    totals: {
      total: num(totals.total),
      received: num(totals.received),
      balance: num(totals.balance),
      customers: num(totals.customers),
      accounts: num(totals.accounts),
      buckets: bucketFigures(totals, keys),
    },
    customers: Array.isArray(raw?.customers)
      ? raw.customers.map(
          (c: any): OutstandingCustomer => ({
            customerId: idOrNull(c?.customer_id),
            name: text(c?.name),
            phone: text(c?.phone),
            total: num(c?.total),
            received: num(c?.received),
            balance: num(c?.balance),
            oldestDays: num(c?.oldest_days),
            buckets: bucketFigures(c, keys),
            accounts: Array.isArray(c?.accounts) ? c.accounts.map(toOutstandingAccount) : [],
          })
        )
      : [],
  };
}

/** The account "Record payment" needs, from one row of the outstanding list. */
export function accountFromOutstanding(customer: OutstandingCustomer, row: OutstandingAccount): Account {
  return {
    quotationId: row.quotationId,
    customerId: customer.customerId,
    customerName: customer.name,
    order: row.order ? { ...row.order, status: 'active', stage: '' } : null,
    bill: row.bill,
    total: row.total,
    received: row.received,
    refunded: 0,
    netReceived: row.received,
    balance: row.balance,
    overpaid: 0,
    status: row.received > 0 ? 'part_paid' : 'unpaid',
    advance: null,
    paymentCount: 0,
    lastPaymentDate: '',
  };
}

/** "INV/26-27/0001" when billed, else the order number. */
export function jobNumber(job: { order: JobRef | null; bill: JobRef | null }): string {
  return job.bill?.number || job.order?.number || '';
}

/** The label of the reference field: a cheque needs its number, the others may carry one. */
export function referenceLabel(paymentMode: PaymentMode): string {
  switch (paymentMode) {
    case 'cheque':
      return 'Cheque number';
    case 'upi':
      return 'UPI reference (optional)';
    case 'bank':
      return 'Bank reference (optional)';
    default:
      return 'Reference (optional)';
  }
}

/**
 * Checks what was typed as an amount, before anything is sent. `limit` is
 * the balance for a receipt and the money held for a refund; the api checks
 * both again. Returns the message to show, or null when the amount is fine.
 */
export function amountError(typed: string, kind: PaymentKind, limit: number | null): string | null {
  const value = typed.trim().replace(/,/g, '');
  if (!value) {
    return 'Enter the amount.';
  }
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    return 'Enter the amount in rupees, with at most two decimals.';
  }
  const amount = Number(value);
  if (!(amount > 0)) {
    return 'The amount must be more than zero.';
  }
  if (limit !== null && amount > limit) {
    return kind === 'refund'
      ? `A refund cannot be more than the ${formatInr(limit)} received.`
      : `The balance is ${formatInr(limit)}. Enter that or less.`;
  }
  return null;
}

/** What goes to the api as `amount`: the digits as typed, without thousands commas. */
export function amountText(typed: string): string {
  return typed.trim().replace(/,/g, '');
}

/**
 * The number wa.me needs: digits only with the country code. An Indian
 * mobile typed as ten digits gets 91. Anything else gives null and the
 * "Remind" link is not offered.
 */
export function whatsappNumber(phone: string): string | null {
  const digits = (phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) {
    return '91' + digits;
  }
  return digits.length === 12 && digits.startsWith('91') ? digits : null;
}

/** The message a reminder starts with; the owner can edit it in WhatsApp before sending. */
export function reminderText(customer: OutstandingCustomer, company: string): string {
  const numbers = customer.accounts.map(jobNumber).filter(Boolean);
  const against = numbers.length ? ` against ${numbers.join(', ')}` : '';
  const from = company ? ` from ${company}` : '';
  return (
    `Hello ${customer.name || 'there'}, this is a reminder${from}. ` +
    `${formatInr(customer.balance)} is pending${against}. ` +
    'Please let us know when we can expect the payment. Thank you.'
  );
}

/** A wa.me address with the reminder filled in, or null when the customer has no usable phone. */
export function reminderLink(customer: OutstandingCustomer, company: string): string | null {
  const number = whatsappNumber(customer.phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(reminderText(customer, company))}` : null;
}

export function matchesCustomer(customer: OutstandingCustomer, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) {
    return true;
  }
  return [customer.name, customer.phone, ...customer.accounts.map(jobNumber)].some((v) => v.toLowerCase().includes(term));
}
