import { AdminCompany, Plan, Subscription } from './admin.models';

/** Rows for the specs of the admin area, in the shape the api answers. */

export const GROWTH: Plan = {
  id: 2,
  code: 'growth',
  name: 'Growth',
  price_paise: 249900,
  price: 2499,
  seats: 5,
  features: { feature_3d: false, max_quotations_per_month: 200, max_design_templates: null },
  grace_days: 7,
  is_active: true,
  sort_order: 20,
};

export const BUSINESS: Plan = {
  id: 3,
  code: 'business',
  name: 'Business',
  price_paise: 499900,
  price: 4999,
  seats: 15,
  features: { feature_3d: true, max_quotations_per_month: null, max_design_templates: null },
  grace_days: 7,
  is_active: true,
  sort_order: 30,
};

export function subscription(changes: Partial<Subscription> = {}): Subscription {
  return {
    status: 'trial',
    read_only: false,
    stored_status: 'trial',
    plan: GROWTH,
    trial_ends_at: '2026-10-19',
    current_period_ends_at: null,
    ends_on: '2026-10-19',
    grace_ends_on: '2026-10-26',
    days_left: 14,
    suspended_at: null,
    seats: { used: 1, allowed: 5, plan: 5, override: null },
    features: { ...GROWTH.features },
    today: '2026-10-05',
    ...changes,
  };
}

export function company(id: number, name: string, changes: Partial<Subscription> = {}, more: Partial<AdminCompany> = {}): AdminCompany {
  return {
    id,
    name,
    email: `office${id}@example.test`,
    phone: null,
    city: null,
    state_code: '24',
    created_at: '2026-10-01T10:00:00+00:00',
    note: null,
    subscription: subscription(changes),
    usage: { quotations_this_month: 0, last_activity_at: null },
    ...more,
  };
}
