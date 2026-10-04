import { Account, PaymentStatus } from '../payments/payments.model';

export type StageKey = 'confirmed' | 'in_production' | 'ready' | 'dispatched' | 'installed' | 'closed';

export interface StageStep {
  stage: StageKey;
  label: string;
  done: boolean;
  current: boolean;
  /** `YYYY-MM-DD`, or blank for a stage not reached. */
  date: string;
  by: string;
}

/** A row of `order/list`, and the head of the order page (phase 19 log, section 2). */
export interface Order {
  id: number;
  number: string;
  orderDate: string;
  cancelled: boolean;
  cancelledAt: string;
  cancelReason: string;
  stage: StageKey;
  stageLabel: string;
  /** The one primary button. Null on a closed or cancelled order. */
  nextStage: { stage: StageKey; label: string; action: string } | null;
  stages: StageStep[];
  promisedDate: string;
  isOverdue: boolean;
  quotationId: number | null;
  quotationNumber: string;
  quotationName: string;
  customerId: number | null;
  customerName: string;
  phone: string;
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  discountAmount: number;
  taxableValue: number;
  totalTax: number;
  roundOff: number;
  /** The figure to show. */
  total: number;
  received: number;
  balance: number;
  paymentStatus: PaymentStatus;
  challanNumber: string;
  vehicleNumber: string;
  transporter: string;
  notes: string;
}

export interface OrderLine {
  id: number;
  /** "W1 · Window", or the product type when the line has no label. */
  name: string;
  /** "1800 × 1200 mm" */
  size: string;
  hsn: string;
  quantity: number;
  /** The selling price of the line, as the api returns it. */
  amount: number;
}

export interface TaxLine {
  label: string;
  amount: number;
}

/** `order/show`, and what create, update, stage and cancel return. */
export interface OrderPage extends Order {
  quotation: { id: number; number: string; name: string; status: string } | null;
  productionJob: { number: string; revision: number; verified: boolean } | null;
  bill: { id: number; number: string; date: string; total: number } | null;
  account: Account | null;
  lines: OrderLine[];
  /** CGST, SGST or IGST as the api lists them; empty when it lists none. */
  taxLines: TaxLine[];
  paymentTerm: string;
  /** The address stored on the order, on one line. */
  address: string;
}

export type StageCounts = Record<string, number>;

/** The tabs of the list: the six stages plus the api's own filters. */
export type OrderTab = 'all' | StageKey | 'overdue' | 'cancelled';

export interface OrderUpdate {
  promised_date?: string;
  vehicle_number?: string;
  transporter?: string;
  notes?: string;
}

export interface NewOrder {
  quatation_id: number;
  order_date?: string;
  promised_date?: string;
  notes?: string;
}
