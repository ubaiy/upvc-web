import { AccessState, plainDate } from './access.models';

/**
 * The starter catalogue of a company made by sign-up (card T140; api phase-59 section 3).
 * GET me carries `company.starter_catalogue` = { code, example_rates, note }, `null` for a company
 * whose catalogue is its own. While `example_rates` is true every rate in the catalogue is another
 * fabricator's, and the app says so where a price is made.
 */
export interface StarterCatalogue {
  code: string;
  example_rates: boolean;
  note?: string;
}

export function starterCatalogue(state: AccessState): StarterCatalogue | null {
  const value = (state?.me?.company as { starter_catalogue?: StarterCatalogue | null } | null | undefined)?.starter_catalogue;
  return value && typeof value === 'object' ? value : null;
}

/** True only when the api says so. Not known (GET me failed) is "no": the banner never guesses. */
export function hasExampleRates(state: AccessState): boolean {
  return starterCatalogue(state)?.example_rates === true;
}

export const EXAMPLE_RATES_TEXT =
  'These are example rates from another fabricator. Replace them with yours before you send a quotation.';

export interface ExampleRatesBanner {
  text: string;
  /** Where the button leads, and its words. */
  link: string;
  label: string;
}

/**
 * The line shown on Home, the catalogue and the quotation pages while the rates are examples.
 * Not on the drawing pages of a quotation (the designer needs the height) and nowhere else.
 */
export function exampleRatesBanner(state: AccessState, url: string): ExampleRatesBanner | null {
  if (!hasExampleRates(state)) {
    return null;
  }
  const path = (url || '').split(/[?#]/)[0];
  if (/^\/masters(\/|$)/.test(path)) {
    return { text: EXAMPLE_RATES_TEXT, link: '/welcome', label: 'First steps' };
  }
  if (/^\/dashboard(\/|$)/.test(path)) {
    return { text: EXAMPLE_RATES_TEXT, link: '/welcome', label: 'First steps' };
  }
  if (/^\/quotation(\/(add|edit\/[^/]+|detail\/[^/]+))?$/.test(path)) {
    return { text: EXAMPLE_RATES_TEXT, link: '/catalogue', label: 'Open the catalogue' };
  }
  return null;
}

/** "Your free trial has 14 days left (until 19 Oct 2026)." or '' when the company is not on a trial. */
export function trialLine(state: AccessState): string {
  const sub = state?.subscription;
  if (!sub || sub.status !== 'trial' || sub.days_left === null || sub.days_left === undefined) {
    return '';
  }
  const until = plainDate(sub.trial_ends_at || sub.ends_on);
  const left =
    sub.days_left === 0
      ? 'Your free trial ends today'
      : `Your free trial has ${sub.days_left === 1 ? '1 day' : sub.days_left + ' days'} left`;
  return until && sub.days_left > 0 ? `${left} (until ${until}).` : `${left}.`;
}
