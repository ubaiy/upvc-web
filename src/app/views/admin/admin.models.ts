/** What the platform admin api (api/v1/admin/*) answers. Money is in paise; `price` and `amount` are the same in rupees. */

export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'locked' | 'suspended';

/** A flag is true or false; a limit is a number, or null for no limit. */
export type FeatureValue = boolean | number | null;
export type FeatureMap = Record<string, FeatureValue>;

export interface Plan {
  id: number;
  code: string;
  name: string;
  price_paise: number;
  price: number;
  seats: number;
  features: FeatureMap;
  grace_days: number;
  is_active: boolean;
  sort_order: number;
  /** Companies on the plan; only in the plans list. */
  companies?: number;
}

export interface Subscription {
  status: SubscriptionStatus;
  read_only: boolean;
  stored_status: 'trial' | 'active';
  plan: Plan | null;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  ends_on: string | null;
  grace_ends_on: string | null;
  days_left: number | null;
  suspended_at: string | null;
  seats: { used: number; allowed: number | null; plan: number | null; override: number | null };
  /** Plan plus overrides: what the company really has. */
  features: FeatureMap;
  today: string;
}

export interface Payment {
  id: number;
  company_id: number;
  plan: string;
  amount_paise: number;
  amount: number;
  mode: PaymentMode;
  reference: string | null;
  note: string | null;
  paid_on: string;
  months: number;
  period_from: string;
  period_to: string;
  recorded_by: number;
  created_at: string;
  /** Entered by mistake and voided (phase-56 G5 d): the row stays, the totals leave it out. */
  void?: boolean;
  voided_at?: string | null;
  voided_by?: number | null;
  void_reason?: string | null;
}

export type PaymentMode = 'upi' | 'bank' | 'cash';

export interface CompanyUser {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export interface AdminCompany {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state_code: string | null;
  created_at: string;
  note: string | null;
  subscription: Subscription;
  usage: { quotations_this_month: number; last_activity_at: string | null };
  users?: CompanyUser[];
  payments?: Payment[];
  /** Only in the answer to "create company": the password is given once. */
  owner?: { email: string; password: string | null };
  /** Only in the answer to "activate" and to "void a payment". */
  payment?: Payment;
  /** As stored (phase-56 G5 a); `null`: none. Absent in the answer of an older api. */
  seats_override?: number | null;
  features_override?: FeatureMap | null;
  /** `classic_example`, `own_rates` or null. */
  starter_catalogue?: string | null;
  /** Void rows are left out of these. */
  payments_total_paise?: number;
  payments_total?: number;
  payments_count?: number;
  payments_void_count?: number;
  /** Only in the answer to "void a payment": the plan, status and paid day went back to what they were before it. */
  subscription_restored?: boolean;
}

/** The override map as the api stores it; `undefined` when the answer does not carry it (an older api). */
export function storedFeatureOverride(company: AdminCompany | null | undefined): FeatureMap | null | undefined {
  if (company && 'features_override' in company) {
    return company.features_override ?? null;
  }
  const subscription = company?.subscription as (Subscription & { features_override?: FeatureMap | null }) | undefined;
  return subscription && 'features_override' in subscription ? subscription.features_override ?? null : undefined;
}

export function whole(value: unknown): boolean {
  return value !== null && value !== '' && Number.isInteger(Number(value));
}

export function monthsText(months: number): string {
  return months === 1 ? '1 month' : `${months} months`;
}

export interface AuditEntry {
  id: number;
  at: string;
  user_id: number | null;
  company_id: number | null;
  action: string;
  subject_type: string;
  subject_id: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  per_page: number;
  last_page: number;
}

export const STATUSES: SubscriptionStatus[] = ['trial', 'active', 'grace', 'locked', 'suspended'];

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: 'Trial',
  active: 'Active',
  grace: 'Payment due',
  locked: 'Locked',
  suspended: 'Suspended',
};

const STATUS_BADGES: Record<SubscriptionStatus, string> = {
  trial: 'badge-info',
  active: 'badge-success',
  grace: 'badge-warning',
  locked: 'badge-danger',
  suspended: 'badge-danger',
};

export function statusLabel(status: SubscriptionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusBadge(status: SubscriptionStatus): string {
  return STATUS_BADGES[status] ?? '';
}

export const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
];

export function modeLabel(mode: string): string {
  return PAYMENT_MODES.find((item) => item.value === mode)?.label ?? mode;
}

/** What the end date of a company means: the trial's last day or the last paid day. */
export function endsLabel(subscription: Subscription): string {
  if (!subscription.ends_on) {
    return 'No end date';
  }
  if (subscription.stored_status !== 'trial') {
    return 'Paid until';
  }
  // Dates are YYYY-MM-DD, so they compare as text.
  return subscription.ends_on < subscription.today ? 'Trial ended' : 'Trial ends';
}

/**
 * Expiring soonest first: by the last day of the trial or paid period. A company whose
 * day has passed (payment due, locked) is therefore at the top; one with no end date is last.
 */
export function byExpiry(a: AdminCompany, b: AdminCompany): number {
  const left = a.subscription.ends_on;
  const right = b.subscription.ends_on;
  if (left && right) {
    return left.localeCompare(right) || a.name.localeCompare(b.name);
  }
  if (left || right) {
    return left ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

/** A trial or paid period with this many days left, or fewer, is 'ending soon'. */
export const SOON_DAYS = 7;

/**
 * Who needs the admin first: locked (0), payment due (1), a trial or paid period
 * ending within a week (2), suspended (3), everyone else (4).
 */
export function attentionRank(subscription: Subscription): number {
  const { status, days_left } = subscription;
  if (status === 'locked') {
    return 0;
  }
  if (status === 'grace') {
    return 1;
  }
  if ((status === 'trial' || status === 'active') && days_left !== null && days_left <= SOON_DAYS) {
    return 2;
  }
  return status === 'suspended' ? 3 : 4;
}

/** Why the company needs attention, in a few words; empty when it does not. */
export function attentionText(subscription: Subscription): string {
  const days = subscription.days_left;
  switch (attentionRank(subscription)) {
    case 0:
      return 'Read-only until a payment is entered';
    case 1:
      return days === null ? 'Payment due' : days === 0 ? 'Payment due: locks tomorrow' : `Payment due: locks in ${daysText(days + 1)}`;
    case 2: {
      const what = subscription.status === 'trial' ? 'Trial' : 'Paid period';
      return days === 0 ? `${what} ends today` : `${what} ends in ${daysText(days as number)}`;
    }
    case 3:
      return 'Read-only until reactivated';
    default:
      return '';
  }
}

export function daysText(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

/** Most urgent first; inside one group, the one whose day comes first. */
export function byAttention(a: AdminCompany, b: AdminCompany): number {
  return attentionRank(a.subscription) - attentionRank(b.subscription) || byExpiry(a, b);
}

/** '3 of 15', or '3, no limit'. */
export function seatsText(subscription: Subscription): string {
  const { used, allowed } = subscription.seats;
  return allowed === null || allowed === undefined ? `${used}, no limit` : `${used} of ${allowed}`;
}

const FEATURE_LABELS: Record<string, string> = {
  feature_3d: '3D view',
  max_quotations_per_month: 'Quotations a month',
  max_design_templates: 'Design templates',
};

/** A name for a key of the feature map. A key this screen has not met is shown in plain words. */
export function featureLabel(key: string): string {
  if (FEATURE_LABELS[key]) {
    return FEATURE_LABELS[key];
  }
  const words = key.replace(/^(feature|max)_/, '').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isFlag(key: string, value: FeatureValue): boolean {
  return typeof value === 'boolean' || (value === null && key.startsWith('feature_'));
}

/** "3D view: yes" / "Quotations a month: 30" / "Design templates: no limit". */
export function featureText(key: string, value: FeatureValue): string {
  if (isFlag(key, value)) {
    return `${featureLabel(key)}: ${value ? 'yes' : 'no'}`;
  }
  return `${featureLabel(key)}: ${value === null || value === undefined ? 'no limit' : value}`;
}

export function featureList(features: FeatureMap | null | undefined): string[] {
  return Object.keys(features || {}).map((key) => featureText(key, (features as FeatureMap)[key]));
}

/** The message of a refused request, in the api's own words when it gave any. */
export function apiError(err: any): string {
  if (err?.status === 0) {
    return 'We could not reach the server. Check the connection and try again.';
  }
  const errors = err?.error?.errors;
  if (errors && typeof errors === 'object') {
    const first = Object.values(errors)[0];
    const text = Array.isArray(first) ? first[0] : first;
    if (text) {
      return String(text);
    }
  }
  return err?.error?.message || 'That did not work. Nothing was changed. Try again.';
}

/** GST state codes (India). The api's own list (gst/states) is closed to a platform admin. */
export const GST_STATES: { code: string; name: string }[] = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'],
  ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'],
  ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'],
  ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
].map(([code, name]) => ({ code, name }));

export function stateName(code: string | null | undefined): string {
  return GST_STATES.find((state) => state.code === code)?.name ?? '';
}

/** What the admin can do to a company; each is a dialog of two steps on its page. */
export type CompanyAction = 'activate' | 'plan' | 'trial' | 'limits' | 'suspend' | 'reactivate' | 'void';

export const TITLES: Record<CompanyAction, string> = {
  activate: 'Record a payment and activate',
  plan: 'Change plan',
  trial: 'Extend the trial',
  limits: 'Seats and 3D view',
  suspend: 'Suspend this company',
  reactivate: 'Reactivate this company',
  void: 'Void a payment entered by mistake',
};

export const CONFIRM_LABELS: Record<CompanyAction, string> = {
  activate: 'Yes, record and activate',
  plan: 'Yes, change the plan',
  trial: 'Yes, extend the trial',
  limits: 'Yes, save the limits',
  suspend: 'Yes, suspend',
  reactivate: 'Yes, reactivate',
  void: 'Yes, void this payment',
};
