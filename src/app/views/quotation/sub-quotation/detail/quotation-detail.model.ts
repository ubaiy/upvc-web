/**
 * Adapter between `quatation/show/{id}` and the quotation page (card U4).
 *
 * Pure functions. The page shows what the API returns: every amount below is
 * read from `totals`, nothing is recalculated here. A database without the
 * flow migrations returns no `totals`; the readers then fall back to the cost
 * figures the old screen showed, so the page still opens.
 */
import { TotalsLine } from 'src/app/shared/components/totals/totals.component';
import { PaneType, WindowSpec } from 'src/app/shared/components/window-thumb/window-drawing';

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'billed';

/** The one primary button of the page. */
export type PrimaryAction = 'send' | 'accept' | 'bill' | 'bill-pdf' | 'revise' | 'open-current' | null;

export interface QuotationLine {
  id: number;
  /** 1-based position; the designer's edit route takes it. */
  position: number;
  /** "Master bedroom", or "Window 2" when the line has no label yet. */
  name: string;
  label: string;
  /** "Casement · 1800 × 1200 mm · 5mm plain glass" */
  description: string;
  quantity: number;
  /** Selling price of the line, margin included. */
  amount: number;
  ratePerSqFt: number | null;
  /** The designer's saved drawing, when there is one. */
  image: string | null;
  /** A simple drawing for a line saved without an image. */
  spec: WindowSpec;
  /** What the thumbnail shows, for screen readers. */
  thumbLabel: string;
}

export interface QuotationCustomer {
  id: number | null;
  name: string;
  initials: string;
  phone: string;
  email: string;
  address: string;
}

export interface QuotationRevision {
  id: number;
  number: string;
  status: QuotationStatus;
  current: boolean;
}

export interface QuotationView {
  id: number;
  name: string;
  number: string;
  status: QuotationStatus;
  /** Draft and not replaced by a newer revision: windows and money can change in place. */
  editable: boolean;
  /** Sent, expired, accepted or declined: a change goes through "Revise". */
  revisable: boolean;
  /** A newer revision exists; this version is read only. */
  supersededBy: { id: number; number: string } | null;
  /** The revision this one would create: "R1", "R2". */
  nextRevision: string;
  sentAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  validUntil: Date | null;
  /** valid_until as the API sends it (YYYY-MM-DD), for the date input. */
  validUntilIso: string;
  customer: QuotationCustomer;
  lines: QuotationLine[];
  itemCount: number;
  areaSqFt: number | null;
  /** Lines above the total in the Summary card, as the API returns them. */
  summary: TotalsLine[];
  total: number;
  /** "Retail margin 20%" */
  marginText: string;
  termsText: string;
  advance: { percent: number; amount: number } | null;
  /** Why no tax is charged, or null. */
  taxNote: string | null;
  /** The customer's state is not known, so the API assumed a sale within the state. */
  placeOfSupplyAssumed: boolean;
  marginId: number | null;
  paymentTermId: number | null;
  discountType: 'percent' | 'amount' | null;
  discountValue: number;
  pricesIncludeGst: boolean;
  bill: { id: number; number: string; date: Date | null; total: number } | null;
  revisions: QuotationRevision[];
  /** Catalogue prices moved after this quotation was priced (sent by the API when it knows). */
  pricesChanged: boolean;
}

const STATUSES: QuotationStatus[] = ['draft', 'sent', 'accepted', 'declined', 'expired', 'billed'];

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/** An API date or date-time; null when missing or unreadable. */
export function readDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) {
    return null;
  }
  // A plain date is local midnight, not UTC midnight, so "valid until 3 Nov" stays 3 Nov.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T00:00:00') : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function readStatus(raw: any): QuotationStatus {
  const status = raw?.status;
  if (typeof status === 'string' && STATUSES.includes(status as QuotationStatus)) {
    return status as QuotationStatus;
  }
  return Number(raw?.is_convert_bill) === 1 ? 'billed' : 'draft';
}

export function initials(name: string): string {
  const words = text(name).split(/\s+/).filter(Boolean);
  if (!words.length) {
    return '?';
  }
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** The address is stored on the quotation as a JSON string. */
function readAddress(raw: unknown): string {
  let address: any = raw;
  if (typeof raw === 'string') {
    try {
      address = JSON.parse(raw);
    } catch {
      return '';
    }
  }
  if (!address || typeof address !== 'object') {
    return '';
  }
  return [address.address, address.address_line2, address.city, address.state, address.zip_code]
    .map(text)
    .filter(Boolean)
    .join(', ');
}

function readCustomer(raw: any): QuotationCustomer {
  const customer = raw?.customer || {};
  const name = text(customer.name);
  return {
    id: customer.id ?? raw?.customer_id ?? null,
    name,
    initials: initials(name),
    phone: text(customer.phone),
    email: text(customer.email),
    address: readAddress(raw?.customer_address),
  };
}

/** The stored designer request of a line, when it has one. */
function storedRequest(line: any): any {
  const info = line?.costhead_information;
  return (info && !Array.isArray(info) && info.old_post_data) || null;
}

function costHeads(line: any): any[] {
  const info = line?.costhead_information;
  if (Array.isArray(info)) {
    return info;
  }
  return Array.isArray(info?.costhead) ? info.costhead : [];
}

function glassName(line: any): string {
  const glass = costHeads(line).find((head) => /^glaz/i.test(text(head?.type) || text(head?.costhead)));
  return text(glass?.name);
}

function paneType(part: any, index: number): PaneType {
  if (/slid/i.test(text(part?.category_type))) {
    return index % 2 === 0 ? 'sr' : 'sl';
  }
  if (!/open/i.test(text(part?.casement_type))) {
    return 'fixed';
  }
  const direction = text(part?.opening_direction).toLowerCase();
  if (direction === 'right') {
    return 'R';
  }
  return direction === 'top' ? 'top' : 'L';
}

/** A columns-only drawing from the stored request: enough for a thumbnail, not the design. */
export function readSpec(line: any): WindowSpec {
  const w = num(line?.width) || 1200;
  const h = num(line?.height) || 1200;
  const parts: any[] = storedRequest(line)?.full_window?.parts || [];
  const widths = parts.map((part) => num(part?.width));
  const sum = widths.reduce((a, b) => a + b, 0);
  if (!parts.length || sum <= 0) {
    return { w, h, cols: [{ f: 1, t: 'fixed' }] };
  }
  return { w, h, cols: parts.map((part, i) => ({ f: widths[i] / sum, t: paneType(part, i) })) };
}

function readLine(line: any, index: number, item: any): QuotationLine {
  const label = text(item?.label ?? line?.label);
  const kind = text(line?.product_type) || 'Window';
  const category = text(line?.product?.category);
  const width = num(line?.width);
  const height = num(line?.height);
  const description = [category, width && height ? `${width} × ${height} mm` : '', glassName(line)]
    .filter(Boolean)
    .join(' · ');
  const name = label || `${kind} ${index + 1}`;
  const image = text(line?.image);
  return {
    id: line?.id,
    position: index + 1,
    name,
    label,
    description,
    quantity: num(item?.quantity ?? line?.quantity) || 1,
    amount: num(item?.amount ?? line?.total),
    ratePerSqFt: item?.rate_per_sq_ft ?? line?.average_total ?? null,
    image: image.startsWith('data:image/') || /^https?:\/\//.test(image) ? image : null,
    spec: readSpec(line),
    thumbLabel: `Drawing of ${name}${category ? ', ' + category.toLowerCase() : ''}`,
  };
}

/** Subtotal, discount, taxable value, tax lines and round-off, in the order the PDF prints them. */
function readSummary(raw: any): TotalsLine[] {
  const totals = raw?.totals;
  if (!totals) {
    return [];
  }
  const lines: TotalsLine[] = [{ label: 'Subtotal', amount: totals.subtotal }];
  const discount = totals.discount || {};
  const discounted = num(discount.amount) > 0;
  if (discounted) {
    const label = discount.type === 'percent' ? `Discount ${num(discount.value)}%` : 'Discount';
    lines.push({ label, amount: -num(discount.amount) });
  }
  if (discounted || totals.prices_include_gst) {
    lines.push({ label: 'Taxable value', amount: totals.taxable_value });
  }
  for (const tax of totals.tax?.lines || []) {
    lines.push({ label: text(tax.label) || text(tax.code), amount: tax.amount });
  }
  if (num(totals.round_off) !== 0) {
    lines.push({ label: 'Round off', amount: totals.round_off });
  }
  return lines;
}

export function toQuotationView(raw: any): QuotationView {
  const totals = raw?.totals || null;
  const status = readStatus(raw);
  const products: any[] = Array.isArray(raw?.quatation_product) ? raw.quatation_product : [];
  const items: any[] = Array.isArray(totals?.items) ? totals.items : [];
  const revisions: QuotationRevision[] = (Array.isArray(raw?.revisions) ? raw.revisions : []).map((r: any) => ({
    id: r.id,
    number: text(r.number),
    status: readStatus(r),
    current: !!r.is_current,
  }));
  const newer = raw?.superseded_by_id
    ? revisions.find((r) => r.id === raw.superseded_by_id) || revisions.find((r) => r.current)
    : null;
  const supersededBy = raw?.superseded_by_id
    ? { id: Number(raw.superseded_by_id), number: newer?.number || 'a newer revision' }
    : null;
  const margin = totals?.margin;
  const term = totals?.payment_term;
  const bill = raw?.bill;
  return {
    id: raw?.id,
    name: text(raw?.quatation_name) || text(raw?.customer?.name) || 'Quotation',
    number: text(raw?.number) || `No. ${raw?.id}`,
    status,
    editable: status === 'draft' && !supersededBy,
    revisable: !supersededBy && ['sent', 'expired', 'accepted', 'declined'].includes(status),
    supersededBy,
    nextRevision: `R${num(raw?.revision_no) + 1}`,
    sentAt: readDate(raw?.sent_at),
    acceptedAt: readDate(raw?.accepted_at),
    declinedAt: readDate(raw?.declined_at),
    validUntil: readDate(raw?.valid_until),
    validUntilIso: text(raw?.valid_until).slice(0, 10),
    customer: readCustomer(raw),
    lines: products.map((line, i) => readLine(line, i, items[i])),
    itemCount: totals?.item_count ?? products.length,
    areaSqFt: totals ? num(totals.total_area_sq_ft) : null,
    summary: readSummary(raw),
    total: totals ? num(totals.total) : num(raw?.grand_total),
    marginText: margin ? `${text(margin.name)} margin ${num(margin.percent)}%` : '',
    termsText: text(term?.name),
    advance: totals?.advance ? { percent: num(totals.advance.percent), amount: num(totals.advance.amount) } : null,
    taxNote: text(totals?.tax?.note) || null,
    placeOfSupplyAssumed: !!totals?.tax?.applicable && !!totals?.tax?.place_of_supply_assumed,
    marginId: raw?.order_type_margin_id ?? margin?.id ?? null,
    paymentTermId: raw?.payment_term_id ?? term?.id ?? null,
    discountType: raw?.discount_type === 'percent' || raw?.discount_type === 'amount' ? raw.discount_type : null,
    discountValue: num(raw?.discount_value),
    pricesIncludeGst: !!(raw?.prices_include_gst ?? totals?.prices_include_gst),
    bill: bill ? { id: bill.id, number: text(bill.number), date: readDate(bill.bill_date), total: num(bill.total) } : null,
    revisions,
    pricesChanged: !!(raw?.prices_changed ?? totals?.prices_changed),
  };
}

/**
 * Draft → Send quotation → Mark as accepted → Create bill → Download bill.
 * A draft with no window has no header button: "Add a window" in the empty state is the primary.
 */
export function primaryAction(view: QuotationView): PrimaryAction {
  if (view.supersededBy) {
    return 'open-current';
  }
  switch (view.status) {
    case 'draft':
      return view.lines.length ? 'send' : null;
    case 'sent':
    case 'expired':
      return 'accept';
    case 'accepted':
      return 'bill';
    case 'declined':
      return 'revise';
    case 'billed':
      return view.bill ? 'bill-pdf' : null;
    default:
      return null;
  }
}

/** Label and icon of the primary button, per action. */
export const PRIMARY_BUTTON: Record<Exclude<PrimaryAction, null>, { label: string; icon: string }> = {
  send: { label: 'Send quotation', icon: 'send' },
  accept: { label: 'Mark as accepted', icon: 'check' },
  bill: { label: 'Create bill', icon: 'receipt' },
  'bill-pdf': { label: 'Download bill', icon: 'download' },
  revise: { label: 'Revise quotation', icon: 'pencil' },
  'open-current': { label: 'Open current version', icon: 'arrow-right' },
};

/** "Quotation-Q-0003-Ahmed-Al-Rashid.pdf" */
export function pdfFileName(view: QuotationView): string {
  const slug = (value: string) => value.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return ['Quotation', slug(view.number), slug(view.customer.name)].filter(Boolean).join('-') + '.pdf';
}
