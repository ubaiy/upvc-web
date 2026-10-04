/**
 * Adapter between the quotation list endpoint and the list screen (card U3).
 *
 * The API is gaining a status, a number in a series and a customer-facing
 * total (flow cards A1 and A3). A database that has not had those migrations
 * yet returns rows without them, so every reader below has a fallback. When
 * the fields arrive the screen switches on by itself; nothing here needs to
 * change.
 */

export type QuotationRowStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'billed';

export interface QuotationRow {
  id: number;
  name: string;
  /** "Q-0014" from the API, or "No. 14" until the number series exists. Never the hash. */
  number: string;
  customerId: number | null;
  customerName: string;
  phone: string;
  /** Windows and doors on the quotation; null when the API does not say. */
  windows: number | null;
  status: QuotationRowStatus;
  total: number;
  updatedAt: Date | null;
}

export interface StatusTab {
  key: 'all' | QuotationRowStatus;
  label: string;
  count: number;
}

export const STATUS_LABELS: Record<QuotationRowStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  billed: 'Billed',
};

/** Badge colour per status, as in design-system.md. */
export const STATUS_BADGE: Record<QuotationRowStatus, string> = {
  draft: '',
  sent: 'badge-info',
  accepted: 'badge-success',
  declined: 'badge-danger',
  expired: 'badge-warning',
  billed: 'badge-accent',
};

/** Tabs that are always shown once the API reports statuses. */
const MAIN_TABS: QuotationRowStatus[] = ['draft', 'sent', 'accepted', 'billed'];
/** Tabs shown only when a quotation is in that state. */
const RARE_TABS: QuotationRowStatus[] = ['declined', 'expired'];

function isBilled(raw: any): boolean {
  return Number(raw?.is_convert_bill) === 1;
}

export function readStatus(raw: any): QuotationRowStatus {
  const status = raw?.status;
  if (typeof status === 'string' && status in STATUS_LABELS) {
    return status as QuotationRowStatus;
  }
  return isBilled(raw) ? 'billed' : 'draft';
}

function readDate(value: any): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function readNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return isFinite(n) ? n : null;
}

export function toQuotationRow(raw: any): QuotationRow {
  const customerName = (raw?.name || '').toString().trim();
  const name =
    (raw?.quatation_name || '').toString().trim() ||
    (customerName ? defaultQuotationName(customerName) : 'Untitled quotation');
  return {
    id: Number(raw?.id),
    name,
    number: (raw?.number || '').toString().trim() || `No. ${raw?.id}`,
    customerId: readNumber(raw?.customer_id),
    customerName,
    phone: (raw?.phone || '').toString(),
    windows: readNumber(raw?.item_count),
    status: readStatus(raw),
    // `total` is what the customer pays (margin, discount and GST applied).
    // `grand_total` is the cost before margin, kept for an API without A3.
    total: readNumber(raw?.total) ?? readNumber(raw?.grand_total) ?? 0,
    updatedAt: readDate(raw?.updated_at) || readDate(raw?.created_at),
  };
}

/** The tabs, from `quatation/status-counts`. Declined and Expired show only when there is one. */
export function tabsFromCounts(counts: Record<string, number> | null | undefined): StatusTab[] {
  const count = (key: string) => Number(counts?.[key]) || 0;
  const tabs: StatusTab[] = [{ key: 'all', label: 'All', count: count('all') }];
  MAIN_TABS.forEach((status) => tabs.push({ key: status, label: STATUS_LABELS[status], count: count(status) }));
  RARE_TABS.forEach((status) => {
    if (count(status)) {
      tabs.push({ key: status, label: STATUS_LABELS[status], count: count(status) });
    }
  });
  return tabs;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday", "28 Sep", or "3 Sep 2025" for another year. */
export function shortDate(date: Date | null, now: Date = new Date()): string {
  if (!date) {
    return '';
  }
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86400000);
  if (diff === 0) {
    return 'Today';
  }
  if (diff === 1) {
    return 'Yesterday';
  }
  const month = MONTHS[date.getMonth()];
  const sameYear = date.getFullYear() === now.getFullYear();
  return `${date.getDate()} ${month}${sameYear ? '' : ' ' + date.getFullYear()}`;
}

/** The name a new quotation is given until the user types one. */
export function defaultQuotationName(customerName: string): string {
  const name = (customerName || '').trim();
  return name ? `${name} – windows` : '';
}

/** A message a person can act on, from whatever the API or the network gave back. */
export function errorText(err: any, fallback: string): string {
  if (typeof err === 'string' && err) {
    return err;
  }
  return err?.error?.message || fallback;
}
