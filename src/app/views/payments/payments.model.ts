export type PaymentKind = 'receipt' | 'refund';
export type PaymentMode = 'cash' | 'upi' | 'bank' | 'cheque';
export type PaymentStatus = 'unpaid' | 'part_paid' | 'paid';

export interface JobRef {
  id: number;
  number: string;
}

/** One job is one account: the order and the bill of the same quotation (phase 19 log, section 3). */
export interface Account {
  quotationId: number | null;
  customerId: number | null;
  customerName: string;
  order: (JobRef & { status: string; stage: string }) | null;
  bill: JobRef | null;
  total: number;
  /** All receipts. */
  received: number;
  refunded: number;
  /** Receipts less refunds: the money held. */
  netReceived: number;
  /** What is still to pay; never below zero. The amount "Record payment" starts with. */
  balance: number;
  /** Above zero only when more is held than the job is worth. */
  overpaid: number;
  status: PaymentStatus;
  advance: { percent: number; amount: number; received: number; due: number } | null;
  paymentCount: number;
  lastPaymentDate: string;
}

export interface Payment {
  id: number;
  number: string;
  kind: PaymentKind;
  date: string;
  /** Always positive. */
  amount: number;
  /** Negative for a refund. */
  signedAmount: number;
  mode: PaymentMode;
  modeLabel: string;
  reference: string;
  note: string;
  cancelled: boolean;
  cancelReason: string;
  orderId: number | null;
  orderNumber: string;
  billId: number | null;
  billNumber: string;
  quotationId: number | null;
  customerId: number | null;
  customerName: string;
  recordedBy: string;
}

export interface PaymentList {
  payments: Payment[];
  totals: { received: number; refunded: number; netReceived: number };
  /** Filled only when the list was asked for one order or one bill. */
  account: Account | null;
}

/** Which payments to list. One of the three, or none for every payment. */
export interface PaymentScope {
  orderId?: number | null;
  billId?: number | null;
  customerId?: number | null;
}

export interface NewPayment {
  order_id?: number;
  bill_id?: number;
  kind: PaymentKind;
  /** Sent as text, exactly as typed, so no figure is rounded on the way. */
  amount: string;
  mode: PaymentMode;
  reference?: string;
  payment_date: string;
  note?: string;
}

export interface AgeBucket {
  key: string;
  label: string;
}

export interface OutstandingAccount {
  quotationId: number | null;
  order: JobRef | null;
  bill: JobRef | null;
  basis: 'order' | 'bill';
  date: string;
  ageDays: number;
  bucket: string;
  total: number;
  received: number;
  balance: number;
}

export interface OutstandingCustomer {
  customerId: number | null;
  name: string;
  phone: string;
  total: number;
  received: number;
  balance: number;
  oldestDays: number;
  /** One figure per bucket key. */
  buckets: Record<string, number>;
  accounts: OutstandingAccount[];
}

export interface Outstanding {
  asOf: string;
  buckets: AgeBucket[];
  totals: {
    total: number;
    received: number;
    balance: number;
    customers: number;
    accounts: number;
    buckets: Record<string, number>;
  };
  customers: OutstandingCustomer[];
}

export type OutstandingBasis = 'all' | 'bill' | 'order';
