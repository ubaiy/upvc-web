/**
 * Buying or changing a plan is done by hand for now (card T117): the customer contacts us,
 * pays by bank or UPI, and the platform admin activates the company. Nothing in the web takes a payment.
 *
 * PLAN_CONTACT is the ONE place for how to reach us. The bank and UPI details are not known yet:
 * the owner of the product fills this in. Lines left empty are not shown.
 */
export const PLAN_CONTACT = {
  /** Shown as the heading of the instructions. */
  heading: 'Contact us to activate',
  /** TO FILL IN: who to call or write to. */
  lines: ['Phone / WhatsApp: (to be added)', 'E-mail: (to be added)'] as string[],
  /**
   * TO FILL IN: the WhatsApp number with the country code, digits only ('919876543210').
   * Empty: no WhatsApp link is drawn anywhere (the closed sign-up page, card T140).
   */
  whatsapp: '',
  /** TO FILL IN: bank account and UPI id for the payment. Empty until known. */
  payment: [] as string[],
};

export interface PlanOffer {
  code: string;
  name: string;
  /** Rupees a month, before GST. */
  price: number;
  seats: number;
  /** `null`: no limit. */
  quotationsPerMonth: number | null;
  designTemplates: number | null;
  has3d: boolean;
}

/**
 * FALLBACK ONLY (card T143): the plans are read from GET plans (views/profile/plans.service.ts). This
 * copy of the three rows is drawn only when the api has no such route (404). The company's own plan
 * is always drawn from GET subscription, not from this list.
 */
export const PLAN_OFFERS: PlanOffer[] = [
  { code: 'starter', name: 'Starter', price: 999, seats: 2, quotationsPerMonth: 30, designTemplates: 10, has3d: false },
  { code: 'growth', name: 'Growth', price: 2499, seats: 5, quotationsPerMonth: 200, designTemplates: null, has3d: false },
  { code: 'business', name: 'Business', price: 4999, seats: 15, quotationsPerMonth: null, designTemplates: null, has3d: true },
];
