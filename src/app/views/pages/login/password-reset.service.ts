import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { API_END_POINT } from 'src/app/shared/configs/api.config';
import { PRODUCT_NAME } from 'src/app/shared/configs/product';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';

export interface NewPassword {
  email: string;
  token: string;
  password: string;
  confirm_password: string;
}

/**
 * The two password-reset calls (card T68 in the API, T76 here). Neither needs
 * a sign-in. A refusal of reset-password is HTTP 422 with a `code` (phase-56 G4) and
 * arrives through the error path; an older api answered 200 without `success`,
 * which is still thrown as an Error that carries the API's message.
 */
@Injectable({ providedIn: 'root' })
export class PasswordResetService {
  constructor(private api: ApiHttpService) {}

  /** The API answers the same whether or not the address has an account. */
  requestLink(email: string): Observable<string> {
    return this.api.post(API_END_POINT.auth.forgotPassword, { email }).pipe(map((res) => this.message(res)));
  }

  setPassword(body: NewPassword): Observable<string> {
    return this.api.post(API_END_POINT.auth.resetPassword, body).pipe(map((res) => this.message(res)));
  }

  private message(res: { success?: boolean; message?: string }): string {
    if (!res || res.success !== true) {
      throw new Error(res?.message || 'The server refused the request.');
    }
    return res.message ?? '';
  }
}

export interface ResetFailure {
  /** The line above the form; empty when the refusal is said under a field. */
  text: string;
  retry: boolean;
  /** The link is spent or wrong: the way on is a new one. */
  newLink?: boolean;
  /** 422 validation_failed: the words under the field the api did not accept. The link is still good. */
  fields?: { password?: string; confirm_password?: string };
}

export const LINK_INVALID_TEXT = 'This link is no longer valid. Ask for a new one.';

/** Which field a validation refusal is about, and plain words for it (the api names its own key in the sentence). */
function fieldRefusal(body: any): ResetFailure['fields'] {
  const errors: Record<string, string[] | string> = body?.errors && typeof body.errors === 'object' ? body.errors : {};
  const first = (key: string): string => ([] as string[]).concat(errors[key] ?? [])[0] ?? '';
  const message = String(first('confirm_password') || first('password') || body?.message || '');
  const confirm = !!first('confirm_password') || (!first('password') && /confirm|match|same|differ/i.test(message));
  const plain = /_/.test(message) || !message;
  if (confirm) {
    return { confirm_password: plain ? (/required/i.test(message) ? 'Enter the password again' : 'The two passwords do not match') : message };
  }
  return { password: plain ? (/required/i.test(message) ? 'Enter a password' : 'Password must be at least 8 characters') : message };
}

/** Words for a failed call: the API's own for a refusal, plain ones for the rest. */
export function resetFailure(err: any, fallback: string): ResetFailure {
  if (err?.status === 429) {
    return { text: 'Too many attempts. Wait a minute, then try again.', retry: false };
  }
  if (err?.status === 0) {
    return { text: `We could not reach ${PRODUCT_NAME}. Check your internet connection.`, retry: true };
  }
  if (err?.status === 422) {
    const code = err.error?.code;
    if (code === 'reset_link_invalid') {
      return { text: LINK_INVALID_TEXT, retry: false, newLink: true };
    }
    if (code === 'validation_failed' || err.error?.errors) {
      return { text: '', retry: false, fields: fieldRefusal(err.error) };
    }
    if (err.error?.message) {
      return { text: err.error.message, retry: false, newLink: true };
    }
  }
  if (typeof err?.status === 'number') {
    // anything else is a fault on our side
    return { text: fallback, retry: true };
  }
  // an older api: 200 without `success`, one answer for every refusal
  return { text: err?.message || fallback, retry: false, newLink: true };
}
