/**
 * Sign-up (card T140). The contract is docs/review/phase-59-signup-log.md of the api.
 */

/** Sent back with the form: the api refuses any other value (its `signup.terms_version`). ONE place. */
export const TERMS_VERSION = '2026-10-draft';

/**
 * The page asks GET signup/state when it opens, so that nobody fills the form of a closed install in vain.
 * FALLBACK for an api without that route (404): an empty POST signup (a closed install answers 403
 * `signup_closed` before it looks at anything). That question counts on the api's limiter (3 an hour
 * for an IP); set this to false to ask nothing by POST before the first real submit.
 */
export const SIGNUP_ASK_ON_OPEN = true;

export interface GstState {
  /** The 2 digit GST state code: the first two digits of a GSTIN of that state. */
  code: string;
  name: string;
}

/**
 * FALLBACK ONLY (card T143): the sign-up page reads the states from GET public/gst/states (no token).
 * This copy is drawn only when that read gives no list (the route is not there: 404; or no answer at
 * all, so the form can still be filled). The same 37 rows as `App\Services\Gst\IndianStates` of the api.
 */
export const GST_STATES: GstState[] = [
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '18', name: 'Assam' },
  { code: '10', name: 'Bihar' },
  { code: '04', name: 'Chandigarh' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '07', name: 'Delhi' },
  { code: '30', name: 'Goa' },
  { code: '24', name: 'Gujarat' },
  { code: '06', name: 'Haryana' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '20', name: 'Jharkhand' },
  { code: '29', name: 'Karnataka' },
  { code: '32', name: 'Kerala' },
  { code: '38', name: 'Ladakh' },
  { code: '31', name: 'Lakshadweep' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '27', name: 'Maharashtra' },
  { code: '14', name: 'Manipur' },
  { code: '17', name: 'Meghalaya' },
  { code: '15', name: 'Mizoram' },
  { code: '13', name: 'Nagaland' },
  { code: '21', name: 'Odisha' },
  { code: '34', name: 'Puducherry' },
  { code: '03', name: 'Punjab' },
  { code: '08', name: 'Rajasthan' },
  { code: '11', name: 'Sikkim' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '16', name: 'Tripura' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '19', name: 'West Bengal' },
  { code: '97', name: 'Other Territory' },
];
