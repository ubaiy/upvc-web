import { idOrNull, num, text } from '../payments/api-result';
import { toAccount } from '../payments/payments.adapter';
import { ChargeLine, Order, OrderLine, OrderPage, OrderTab, StageCounts, StageKey, StageStep, TaxLine } from './orders.model';

/**
 * Every api field name of the orders contract (phase 19 log, section 2) is
 * read here. The screens only see the view types. Money is passed through
 * as the api returns it; nothing is added up or taxed in the web.
 */

export const STAGES: { stage: StageKey; label: string }[] = [
  { stage: 'confirmed', label: 'Confirmed' },
  { stage: 'in_production', label: 'In production' },
  { stage: 'ready', label: 'Ready' },
  { stage: 'dispatched', label: 'Dispatched' },
  { stage: 'installed', label: 'Installed' },
  { stage: 'closed', label: 'Closed' },
];

/** The tabs above the list, in the order a job moves. Counts come from `order/stage-counts` under the same keys. */
export const TABS: { tab: OrderTab; label: string }[] = [
  { tab: 'all', label: 'All' },
  ...STAGES.map((s) => ({ tab: s.stage as OrderTab, label: s.label })),
  { tab: 'overdue', label: 'Overdue' },
  { tab: 'cancelled', label: 'Cancelled' },
];

const STAGE_KEYS = STAGES.map((s) => s.stage);

function stageKey(value: unknown): StageKey {
  const key = text(value) as StageKey;
  return STAGE_KEYS.includes(key) ? key : 'confirmed';
}

function stageLabel(stage: StageKey): string {
  return STAGES.find((s) => s.stage === stage)?.label || stage;
}

function toStep(raw: any): StageStep {
  const stage = stageKey(raw?.stage);
  return {
    stage,
    label: text(raw?.label) || stageLabel(stage),
    done: !!raw?.done,
    current: !!raw?.current,
    date: text(raw?.date),
    by: text(raw?.by?.name),
  };
}

export function toOrder(raw: any): Order {
  const stage = stageKey(raw?.stage);
  const next = raw?.next_stage;
  return {
    id: num(raw?.id),
    number: text(raw?.number),
    orderDate: text(raw?.order_date),
    cancelled: raw?.status === 'cancelled',
    cancelledAt: text(raw?.cancelled_at),
    cancelReason: text(raw?.cancel_reason),
    stage,
    stageLabel: text(raw?.stage_label) || stageLabel(stage),
    nextStage:
      next && next.stage
        ? { stage: stageKey(next.stage), label: text(next.label), action: text(next.action) || `Move to ${text(next.label)}` }
        : null,
    stages: Array.isArray(raw?.stages) ? raw.stages.map(toStep) : [],
    promisedDate: text(raw?.promised_date),
    isOverdue: !!raw?.is_overdue,
    quotationId: idOrNull(raw?.quatation_id),
    quotationNumber: text(raw?.quatation_number),
    quotationName: text(raw?.quatation_name),
    customerId: idOrNull(raw?.customer_id),
    customerName: text(raw?.name),
    phone: text(raw?.phone),
    itemCount: num(raw?.item_count),
    totalQuantity: num(raw?.total_quantity),
    subtotal: num(raw?.subtotal),
    discountAmount: num(raw?.discount_amount),
    taxableValue: num(raw?.taxable_value),
    totalTax: num(raw?.total_tax),
    roundOff: num(raw?.round_off),
    total: num(raw?.total),
    received: num(raw?.received),
    balance: num(raw?.balance),
    paymentStatus: raw?.payment_status === 'paid' || raw?.payment_status === 'part_paid' ? raw.payment_status : 'unpaid',
    challanNumber: text(raw?.challan_number),
    vehicleNumber: text(raw?.vehicle_number),
    transporter: text(raw?.transporter),
    notes: text(raw?.notes),
    workshopNote: text(raw?.workshop_note),
  };
}

export function toOrders(raw: any): Order[] {
  return Array.isArray(raw) ? raw.map(toOrder) : [];
}

/** "Casement", "Sliding": the style the quotation shows, kept on the order line with its first profile. */
function styleOf(raw: any): string {
  let parts = raw?.product_information;
  if (typeof parts === 'string') {
    try {
      parts = JSON.parse(parts);
    } catch {
      parts = null;
    }
  }
  const style = Array.isArray(parts) ? text(parts[0]?.category).trim() : '';
  // The catalogue's series is stored misspelt; the quotation page words it "Sliding" too.
  return style === 'Slidding' ? 'Sliding' : style;
}

function toLine(raw: any, index: number): OrderLine {
  const label = text(raw?.label).trim();
  const type = styleOf(raw) || text(raw?.product_type).trim();
  const width = text(raw?.width).trim();
  const height = text(raw?.height).trim();
  return {
    id: num(raw?.id),
    name: [label || `Window ${index + 1}`, type && type !== label ? type : ''].filter(Boolean).join(' · '),
    size: width && height ? `${width} × ${height} mm` : '',
    hsn: text(raw?.hsn_code),
    quantity: num(raw?.quantity),
    amount: num(raw?.amount),
  };
}

function oneLine(address: any): string {
  if (!address || typeof address !== 'object') {
    return text(address);
  }
  return [address.address, address.address_line2, address.city, address.state, address.zip_code]
    .map((part) => text(part).trim())
    .filter(Boolean)
    .join(', ');
}

export function toOrderPage(raw: any): OrderPage {
  const quotation = raw?.quatation;
  const job = raw?.production_job;
  const bill = raw?.bill;
  const taxLines: TaxLine[] = Array.isArray(raw?.totals?.tax?.lines)
    ? raw.totals.tax.lines.map((line: any) => ({ label: text(line?.label) || text(line?.code), amount: num(line?.amount) }))
    : [];
  const charges: ChargeLine[] = Array.isArray(raw?.totals?.charges)
    ? raw.totals.charges.map((charge: any) => ({
        label: text(charge?.label).trim() || 'Other charge',
        amount: num(charge?.amount),
        taxable: charge?.taxable !== false,
      }))
    : [];
  return {
    ...toOrder(raw),
    quotation: idOrNull(quotation?.id)
      ? { id: num(quotation.id), number: text(quotation.number), name: text(quotation.name), status: text(quotation.status) }
      : null,
    productionJob: job ? { number: text(job.number), revision: num(job.revision), verified: !!job.verified } : null,
    bill: idOrNull(bill?.id)
      ? { id: num(bill.id), number: text(bill.number), date: text(bill.bill_date), total: num(bill.total) }
      : null,
    account: toAccount(raw?.account),
    lines: Array.isArray(raw?.order_product) ? raw.order_product.map(toLine) : [],
    taxLines,
    charges,
    paymentTerm: text(raw?.payment_terms?.name || raw?.totals?.payment_term?.name),
    address: oneLine(raw?.customer_address),
  };
}

export function toCounts(raw: any): StageCounts {
  const counts: StageCounts = {};
  if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach((key) => (counts[key] = num(raw[key])));
  }
  return counts;
}

/** Whether an order belongs under a tab. The list is fetched once with every order in it. */
export function inTab(order: Order, tab: OrderTab): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'cancelled':
      return order.cancelled;
    case 'overdue':
      return !order.cancelled && order.isOverdue;
    default:
      return !order.cancelled && order.stage === tab;
  }
}

export function matchesOrder(order: Order, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) {
    return true;
  }
  return [order.number, order.quotationNumber, order.quotationName, order.customerName, order.phone].some((v) =>
    v.toLowerCase().includes(term)
  );
}

export interface BoardColumn {
  stage: StageKey;
  label: string;
  orders: Order[];
}

/** One column per stage, in sequence. Cancelled orders are not on the board. */
export function toBoard(orders: Order[]): BoardColumn[] {
  return STAGES.map((s) => ({
    stage: s.stage,
    label: s.label,
    orders: orders.filter((order) => !order.cancelled && order.stage === s.stage),
  }));
}

/** The stages an order can be taken back to: those before the one it is at. */
export function earlierStages(order: Order): { stage: StageKey; label: string }[] {
  const at = STAGE_KEYS.indexOf(order.stage);
  return STAGES.slice(0, Math.max(at, 0));
}

/** The badge colour of a payment status. */
export function paymentBadge(order: Pick<Order, 'paymentStatus'>): { label: string; tone: string } {
  switch (order.paymentStatus) {
    case 'paid':
      return { label: 'Paid', tone: 'badge-success' };
    case 'part_paid':
      return { label: 'Part paid', tone: 'badge-warning' };
    default:
      return { label: 'Unpaid', tone: '' };
  }
}
