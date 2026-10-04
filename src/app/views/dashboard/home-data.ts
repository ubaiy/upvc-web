import { QuoteStatus } from 'src/app/shared/components/quote-status/quote-status.component';
import { IDashboardModelDto } from 'src/app/shared/model/dashboard.model';

/**
 * Adapter between the API and the Home screen. Everything Home knows about
 * the shape of an API row lives here, so the screen keeps working while the
 * API gains quotation status, dates and totals (cards A1 and A3).
 *
 * The API is read, never recalculated: a row's amount is the `total` it sends
 * (or the older `grand_total`); Home only adds those amounts up.
 */

/** A quotation row as `quatation/list` sends it. Fields after `email` arrive with A1 and A3. */
export interface HomeQuotationRow {
  id: number;
  quatation_identity?: string;
  quatation_name?: string | null;
  name?: string | null;
  grand_total?: number | string | null;
  is_convert_bill?: number | boolean | null;
  number?: string | null;
  status?: string | null;
  total?: number | string | null;
  item_count?: number | null;
  valid_until?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HomeQuotation {
  id: number;
  title: string;
  customer: string;
  status: QuoteStatus;
  amount: number;
  /** Number of windows; null when the API does not say. */
  items: number | null;
  /** Sent and past its "valid until" date. */
  expired: boolean;
  created: Date | null;
  edited: Date | null;
  sent: Date | null;
  accepted: Date | null;
}

export type AttentionKind = 'accepted' | 'follow-up' | 'draft';

export interface AttentionItem {
  kind: AttentionKind;
  badge: string;
  badgeClass: string;
  quotation: HomeQuotation;
  detail: string;
  action: string;
}

export interface HomeStat {
  label: string;
  amount: number;
  detail: string;
}

export interface HomeView {
  stats: HomeStat[];
  attention: AttentionItem[];
  /** Quotations that need attention beyond the ones listed. */
  attentionMore: number;
  recent: HomeQuotation[];
  /** No quotation exists yet. */
  empty: boolean;
}

/** A sent quotation is worth a call after this many days without an answer. */
export const FOLLOW_UP_AFTER_DAYS = 3;
export const ATTENTION_LIMIT = 5;
export const RECENT_LIMIT = 5;

const KNOWN: QuoteStatus[] = ['draft', 'sent', 'accepted', 'billed', 'declined'];
const DAY = 24 * 60 * 60 * 1000;

function toDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function plural(count: number, one: string, many = one + 's'): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * True when the API sends quotation status (card A1). Until then Home knows
 * drafts and bills only. An empty list tells nothing, so it counts as true:
 * a new account sees the same three figures it will see later.
 */
export function hasStatus(rows: HomeQuotationRow[]): boolean {
  return rows.length === 0 || rows.some((row) => typeof row.status === 'string' && row.status !== '');
}

export function toHomeQuotation(row: HomeQuotationRow, today: Date): HomeQuotation {
  const billed = Number(row.is_convert_bill) === 1;
  // "expired" is a sent quotation whose validity has run out.
  const raw = row.status === 'expired' ? 'sent' : row.status;
  const status = KNOWN.includes(raw as QuoteStatus) ? (raw as QuoteStatus) : billed ? 'billed' : 'draft';
  const validUntil = toDate(row.valid_until);
  const customer = (row.name || '').trim();

  return {
    id: row.id,
    title: (row.quatation_name || '').trim() || row.number || (customer ? `Quotation for ${customer}` : 'Quotation'),
    customer,
    status,
    amount: toAmount(row.total ?? row.grand_total),
    items: typeof row.item_count === 'number' ? row.item_count : null,
    expired:
      status === 'sent' && (row.status === 'expired' || (!!validUntil && startOfDay(validUntil) < startOfDay(today))),
    created: toDate(row.created_at),
    edited: toDate(row.updated_at) || toDate(row.created_at),
    sent: toDate(row.sent_at),
    accepted: toDate(row.accepted_at),
  };
}

/** "today", "yesterday", "6 days ago", then the date ("28 Sep"). */
export function relativeDay(date: Date, today: Date): string {
  const days = Math.round((startOfDay(today) - startOfDay(date)) / DAY);
  if (days <= 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 30) {
    return `${days} days ago`;
  }
  return shortDate(date, today);
}

/** "28 Sep", with the year when it is not this year. */
export function shortDate(date: Date, today: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function join(...parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(' · ');
}

function windows(quotation: HomeQuotation): string | null {
  if (quotation.items === null) {
    return null;
  }
  return quotation.items === 0 ? 'No windows yet' : plural(quotation.items, 'window');
}

function attentionFor(quotation: HomeQuotation, today: Date): AttentionItem | null {
  if (quotation.status === 'accepted') {
    return {
      kind: 'accepted',
      badge: 'Accepted',
      badgeClass: 'badge-success',
      quotation,
      detail: join(
        quotation.accepted ? `Accepted ${relativeDay(quotation.accepted, today)}` : quotation.customer,
        'ready to bill'
      ),
      action: 'Create bill',
    };
  }
  if (quotation.status === 'sent') {
    const waited = quotation.sent ? Math.round((startOfDay(today) - startOfDay(quotation.sent)) / DAY) : null;
    if (!quotation.expired && waited !== null && waited < FOLLOW_UP_AFTER_DAYS) {
      return null;
    }
    return {
      kind: 'follow-up',
      badge: 'Follow up',
      badgeClass: 'badge-warning',
      quotation,
      detail: join(
        quotation.sent ? `Sent ${relativeDay(quotation.sent, today)}` : 'Sent',
        quotation.expired && 'validity has ended',
        quotation.customer
      ),
      action: 'Open',
    };
  }
  if (quotation.status === 'draft') {
    return {
      kind: 'draft',
      badge: 'Draft',
      badgeClass: '',
      quotation,
      detail: join(
        windows(quotation),
        quotation.edited && `last edited ${relativeDay(quotation.edited, today)}`,
        quotation.customer
      ),
      action: 'Continue',
    };
  }
  return null;
}

const ATTENTION_ORDER: AttentionKind[] = ['accepted', 'follow-up', 'draft'];

/** Newest first: by last edit when the API sends dates, otherwise by id. */
function newestFirst(a: HomeQuotation, b: HomeQuotation): number {
  const byDate = (b.edited?.getTime() ?? 0) - (a.edited?.getTime() ?? 0);
  return byDate || b.id - a.id;
}

function inMonth(date: Date | null, today: Date): boolean {
  return !!date && date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
}

function sum(quotations: HomeQuotation[]): number {
  return quotations.reduce((total, quotation) => total + quotation.amount, 0);
}

function buildStats(
  figures: IDashboardModelDto | null,
  quotations: HomeQuotation[],
  statusKnown: boolean,
  today: Date
): HomeStat[] {
  // With dates on every row the month's figure is the sum of the totals the
  // customer sees. Without them it is the API's own figure for the month.
  const dated = quotations.length > 0 && quotations.every((quotation) => quotation.created);
  const thisMonth = quotations.filter((quotation) => inMonth(quotation.created, today));
  const quoted: HomeStat = dated
    ? { label: 'Quoted this month', amount: sum(thisMonth), detail: plural(thisMonth.length, 'quotation') }
    : {
        label: 'Quoted this month',
        amount: toAmount(figures?.total_revenue_quatation_current_month),
        detail: 'Quotations created this month',
      };

  const sent = quotations.filter((quotation) => quotation.status === 'sent');
  const open = quotations.filter((quotation) => quotation.status !== 'billed' && quotation.status !== 'declined');
  const waiting: HomeStat = statusKnown
    ? {
        label: 'Waiting for customer',
        amount: sum(sent),
        detail: sent.length ? `${sent.length} sent, not yet accepted` : 'Nothing sent and unanswered',
      }
    : {
        label: 'Open quotations',
        amount: sum(open),
        detail: open.length ? `${open.length} not yet billed` : 'Nothing open',
      };

  const billed: HomeStat = {
    label: 'Billed this month',
    amount: toAmount(figures?.total_revenue_quatation_converted_to_bill_current_month),
    detail: 'Bills created this month',
  };

  return [quoted, waiting, billed];
}

export function buildHomeView(
  figures: IDashboardModelDto | null,
  rows: HomeQuotationRow[] | null | undefined,
  today: Date = new Date()
): HomeView {
  const list = Array.isArray(rows) ? rows : [];
  const quotations = list.map((row) => toHomeQuotation(row, today)).sort(newestFirst);

  const attention = quotations
    .map((quotation) => attentionFor(quotation, today))
    .filter((item): item is AttentionItem => !!item)
    // Array.sort is stable, so each group stays newest first.
    .sort((a, b) => ATTENTION_ORDER.indexOf(a.kind) - ATTENTION_ORDER.indexOf(b.kind));

  return {
    stats: buildStats(figures, quotations, hasStatus(list), today),
    attention: attention.slice(0, ATTENTION_LIMIT),
    attentionMore: Math.max(0, attention.length - ATTENTION_LIMIT),
    recent: quotations.slice(0, RECENT_LIMIT),
    empty: quotations.length === 0,
  };
}

export function greeting(now: Date): string {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}
