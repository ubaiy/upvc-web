import { GST_STATES, GstState } from 'src/app/shared/configs/signup';

/**
 * The rules of the sign-up form (card T140), as the api checks them (phase-59 section 1).
 * Each answers the line to show under the field, or '' when the value is right.
 */

/** "+91 98765 43210", "098765-43210" -> "9876543210": what the api stores. */
export function cleanMobile(typed: string): string {
  let digits = (typed || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits;
}

export function mobileError(typed: string): string {
  const digits = cleanMobile(typed);
  if (!digits) {
    return 'Enter your mobile number';
  }
  if (digits.length !== 10) {
    return 'A mobile number has 10 digits';
  }
  if (!/^[6-9]/.test(digits)) {
    return 'An Indian mobile number starts with 6, 7, 8 or 9';
  }
  return '';
}

/** As typed: capitals, no spaces. */
export function cleanGstin(typed: string): string {
  return (typed || '').replace(/\s/g, '').toUpperCase();
}

const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The 15th character of a GSTIN, worked out from the first 14 (base 36, weights 1 and 2 in turn). */
export function gstinCheckCharacter(firstFourteen: string): string | null {
  if (firstFourteen.length !== 14) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = BASE36.indexOf(firstFourteen[i]);
    if (value < 0) {
      return null;
    }
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return BASE36[(36 - (sum % 36)) % 36];
}

const GSTIN_LAYOUT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * GSTIN is optional. `whileTyping`: a number that is not complete yet is not called wrong,
 * but a wrong state is said as soon as the first two digits are there.
 */
export function gstinError(typed: string, stateCode: string, whileTyping = false, states: GstState[] = GST_STATES): string {
  const gstin = cleanGstin(typed);
  if (!gstin) {
    return '';
  }
  const state = states.find((s) => s.code === stateCode);
  if (stateCode && gstin.length >= 2 && /^\d\d/.test(gstin) && gstin.slice(0, 2) !== stateCode) {
    return `This GSTIN starts with ${gstin.slice(0, 2)}, but a GSTIN of ${state ? state.name : 'the state you chose'} starts with ${stateCode}. Check the state and the number.`;
  }
  if (gstin.length < 15 && whileTyping) {
    return '';
  }
  if (gstin.length !== 15) {
    return `A GSTIN has 15 characters. This one has ${gstin.length}.`;
  }
  if (!GSTIN_LAYOUT.test(gstin)) {
    return 'This does not look like a GSTIN. It reads like 24AAACC1206D1ZM.';
  }
  if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin[14]) {
    return 'This GSTIN has a typing mistake: one of its characters is wrong. Check it against your certificate.';
  }
  return '';
}

export const PASSWORD_MIN = 8;

export function passwordError(password: string): string {
  if (!password) {
    return 'Choose a password';
  }
  if (password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters. This one has ${password.length}.`;
  }
  return '';
}
