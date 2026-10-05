import { AccessState, EMPTY_ACCESS, Me, SubscriptionInfo } from './access.models';
import { EXAMPLE_RATES_TEXT, exampleRatesBanner, hasExampleRates, starterCatalogue, trialLine } from './starter-catalogue';
import { welcomeSteps } from '../../views/welcome/welcome.component';

function state(starter: unknown, subscription: Partial<SubscriptionInfo> | null = null): AccessState {
  const me = {
    user: { id: 1, name: 'Asha', email: 'asha@shree.example' },
    company: { id: 6, name: 'Shree Windows', starter_catalogue: starter },
    role: 'owner',
    role_name: 'Owner',
    abilities: [],
    is_platform_admin: false,
  } as unknown as Me;
  return { me, subscription: subscription as SubscriptionInfo | null };
}

const EXAMPLE = { code: 'classic_example', example_rates: true, note: 'Example rates.' };

describe('Example rates of a company made by sign-up (T140)', () => {
  it('true only when GET me says so', () => {
    expect(hasExampleRates(state(EXAMPLE))).toBeTrue();
    expect(starterCatalogue(state(EXAMPLE))?.code).toBe('classic_example');
    // a company whose catalogue is its own
    expect(hasExampleRates(state(null))).toBeFalse();
    expect(hasExampleRates(state({ code: 'classic_example', example_rates: false }))).toBeFalse();
    // an older api that does not send the key, and GET me not known
    expect(hasExampleRates(state(undefined))).toBeFalse();
    expect(hasExampleRates(EMPTY_ACCESS)).toBeFalse();
  });

  it('the banner is on Home, the catalogue and the quotation pages, in the words of the brief', () => {
    const s = state(EXAMPLE);
    expect(EXAMPLE_RATES_TEXT).toBe('These are example rates from another fabricator. Replace them with yours before you send a quotation.');
    for (const url of ['/dashboard', '/masters/profile', '/masters/glass?x=1', '/quotation', '/quotation/add', '/quotation/edit/4', '/quotation/detail/12']) {
      expect(exampleRatesBanner(s, url)?.text).withContext(url).toBe(EXAMPLE_RATES_TEXT);
    }
    expect(exampleRatesBanner(s, '/dashboard')?.link).toBe('/welcome');
    expect(exampleRatesBanner(s, '/quotation/detail/12')?.link).toBe('/catalogue');
  });

  it('not on other pages, and not on the drawing pages of a quotation', () => {
    const s = state(EXAMPLE);
    for (const url of ['/orders', '/customers', '/profile?tab=company', '/welcome', '/quotation/detail/12/add/0', '/quotation/detail/12/edit/3/0', '/quotation/detail/12/structure']) {
      expect(exampleRatesBanner(s, url)).withContext(url).toBeNull();
    }
  });

  it('no banner anywhere for a company without the mark', () => {
    expect(exampleRatesBanner(state(null), '/dashboard')).toBeNull();
    expect(exampleRatesBanner(EMPTY_ACCESS, '/masters/profile')).toBeNull();
  });

  it('trial days left come from GET subscription', () => {
    expect(trialLine(state(EXAMPLE, { status: 'trial', days_left: 14, trial_ends_at: '2026-10-19' }))).toBe('Your free trial has 14 days left (until 19 Oct 2026).');
    expect(trialLine(state(EXAMPLE, { status: 'trial', days_left: 1, trial_ends_at: '2026-10-19' }))).toBe('Your free trial has 1 day left (until 19 Oct 2026).');
    expect(trialLine(state(EXAMPLE, { status: 'trial', days_left: 0, trial_ends_at: '2026-10-19' }))).toBe('Your free trial ends today.');
    expect(trialLine(state(EXAMPLE, { status: 'active', days_left: null }))).toBe('');
    expect(trialLine(state(EXAMPLE, null))).toBe('');
  });

  it('welcome: three steps with their real addresses; the first names the example rates only while they are examples', () => {
    const steps = welcomeSteps(true);
    expect(steps.map((s) => s.title)).toEqual([
      'Put in your own rates',
      'Add your company details and GSTIN for the documents',
      'Make your first quotation',
    ]);
    expect(steps.map((s) => s.link)).toEqual(['/catalogue', '/profile', '/quotation/add']);
    expect(steps[1].queryParams).toEqual({ tab: 'company' });
    expect(steps[0].text).toContain(EXAMPLE_RATES_TEXT);
    expect(welcomeSteps(false)[0].text).not.toContain('example');
  });
});
