/**
 * What the api says about the signed-in user and the company's plan (card T117).
 * GET me: role and abilities (phase-51). GET subscription: plan, status, seats, features (phase-46).
 * The web only hides what the user may not use; the api is the control (403, 402).
 */

/** Names of `App\Access\Roles` in the api. Kept as text: a new ability needs no change here. */
export type Ability =
  | 'quotations.view'
  | 'quotations.write'
  | 'prices.view_cost'
  | 'orders.view'
  | 'orders.write'
  | 'production.view'
  | 'production.write'
  | 'bills.write'
  | 'payments.view'
  | 'payments.write'
  | 'catalogue.view'
  | 'catalogue.write'
  | 'settings.write'
  | 'team.manage'
  | 'billing.view';

export interface Me {
  user: { id: number; name: string; last_name?: string | null; email: string };
  company: { id: number; name: string } | null;
  role: string;
  role_name: string;
  abilities: string[];
  is_platform_admin: boolean;
}

export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'locked' | 'suspended';

export interface PlanInfo {
  id?: number;
  code: string;
  name: string;
  price: number;
  seats: number | null;
  features: Record<string, boolean | number | null>;
}

export interface SubscriptionInfo {
  company: { id: number; name: string } | null;
  status: SubscriptionStatus;
  read_only: boolean;
  plan: PlanInfo | null;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  ends_on: string | null;
  grace_ends_on: string | null;
  days_left: number | null;
  seats: { used: number; allowed: number | null };
  features: Record<string, boolean | number | null>;
  today?: string;
}

export interface AccessState {
  /** `null`: not known (the request failed). Nothing is hidden then; the api still refuses. */
  me: Me | null;
  subscription: SubscriptionInfo | null;
}

export const EMPTY_ACCESS: AccessState = { me: null, subscription: null };

export function allows(state: AccessState, ability: string | null | undefined): boolean {
  if (!ability || !state.me) {
    return true;
  }
  return state.me.abilities.includes(ability);
}

/** The plan has 3D. Not known counts as yes: the designer itself needs nothing from the api to open. */
export function has3d(state: AccessState): boolean {
  return !state.subscription || state.subscription.features?.['feature_3d'] === true;
}

export function isReadOnly(state: AccessState): boolean {
  return state.subscription?.read_only === true;
}

/** Where a user lands when the page they asked for is not theirs: the first screen the role has. */
export function homeFor(state: AccessState): string {
  if (allows(state, 'quotations.view')) {
    return '/dashboard';
  }
  if (allows(state, 'orders.view')) {
    return '/orders';
  }
  return '/no-access';
}

export interface PlanBanner {
  tone: 'info' | 'warn' | 'danger';
  text: string;
}

function days(n: number): string {
  return n === 1 ? '1 day' : `${n} days`;
}

/** 2026-10-19 -> 19 Oct 2026. The api sends business dates (India); no time zone is applied. */
export function plainDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) {
    return '';
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

/** The line across the top of the app, or `null` when the plan needs no attention. */
export function bannerFor(sub: SubscriptionInfo | null): PlanBanner | null {
  if (!sub) {
    return null;
  }
  switch (sub.status) {
    case 'trial':
      if (sub.days_left === null || sub.days_left > 7) {
        return null;
      }
      return {
        tone: 'info',
        text: sub.days_left === 0 ? 'Your free trial ends today.' : `Your free trial ends in ${days(sub.days_left)}.`,
      };
    case 'grace':
      return {
        tone: 'warn',
        text:
          'Payment is due. ' +
          (sub.grace_ends_on
            ? `The account becomes read-only after ${plainDate(sub.grace_ends_on)}.`
            : 'The account becomes read-only soon.'),
      };
    case 'locked':
      return {
        tone: 'danger',
        text: 'Your subscription has ended and the account is read-only. Nothing is lost: you can still view and download everything.',
      };
    case 'suspended':
      return {
        tone: 'danger',
        text: 'This account is suspended and is read-only. You can still view and download everything.',
      };
    default:
      return null;
  }
}

/** Why a write button does nothing while the account is read-only. */
export function readOnlyReason(sub: SubscriptionInfo | null): string {
  if (sub?.status === 'suspended') {
    return 'This account is suspended and is read-only. Contact us to reactivate it.';
  }
  return 'Your subscription has ended and the account is read-only. Renew the plan to continue.';
}
