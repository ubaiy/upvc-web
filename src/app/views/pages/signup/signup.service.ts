import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { AccessService } from 'src/app/shared/access/access.service';
import { PRODUCT_NAME } from 'src/app/shared/configs/product';
import { GST_STATES, GstState, SIGNUP_ASK_ON_OPEN, TERMS_VERSION } from 'src/app/shared/configs/signup';
import { quiet } from 'src/app/shared/interceptors/request-options';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';
import { AuthService } from 'src/app/shared/services/auth.service';
import { cleanGstin, cleanMobile } from './signup-rules';

/** What the person typed. */
export interface SignupForm {
  company_name: string;
  name: string;
  email: string;
  mobile: string;
  state_code: string;
  gstin: string;
  password: string;
  accept_terms: boolean;
  /** The honeypot: hidden from people, so only a bot fills it. Sent as it is; the api knows what to do. */
  website: string;
}

/** What the api said to POST signup, in the words of the page. */
export type SignupOutcome =
  /** The company exists and the browser holds its owner's token, exactly as after sign-in. */
  | { kind: 'signed_in' }
  /** E-mail confirmation is on: nobody is signed in. `message` is the api's and never says whether the address was new. */
  | { kind: 'check_email'; message: string }
  /** 403 signup_closed: this install takes no sign-ups now. */
  | { kind: 'closed' }
  /** 422 with `errors`: one line for each field. */
  | { kind: 'fields'; errors: Record<string, string> }
  /** Anything else, said above the form. `retry`: sending the same form again can work. */
  | { kind: 'refused'; text: string; retry: boolean };

export type SignupState = 'open' | 'closed' | 'unknown';

/** What the page knows when it opens. `trialDays`: the length of the trial as the api says it, `null` when not said. */
export interface SignupOpening {
  state: SignupState;
  trialDays: number | null;
}

/** The api's request for the form: trimmed, mobile as 10 digits, GSTIN in capitals, the password typed once. */
export function signupBody(form: SignupForm): Record<string, unknown> {
  const gstin = cleanGstin(form.gstin);
  return {
    company_name: form.company_name.trim(),
    name: form.name.trim(),
    email: form.email.trim().toLowerCase(),
    mobile: cleanMobile(form.mobile),
    state_code: form.state_code,
    ...(gstin ? { gstin } : {}),
    password: form.password,
    // The page has one password field with show / hide; the api wants it twice.
    confirm_password: form.password,
    accept_terms: form.accept_terms,
    terms_version: TERMS_VERSION,
    website: form.website,
  };
}

/** "45 minutes", from the Retry-After header (seconds) of a 429. */
export function waitWords(retryAfter: string | null | undefined): string {
  const seconds = Number(retryAfter);
  if (!retryAfter || !isFinite(seconds) || seconds <= 0) {
    return 'an hour';
  }
  const minutes = Math.ceil(seconds / 60);
  return minutes >= 55 ? 'an hour' : minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/** A refusal of POST signup in the words of the page. */
export function readRefusal(err: HttpErrorResponse): SignupOutcome {
  const body = err?.error && typeof err.error === 'object' ? err.error : {};
  if (err?.status === 403 && body.code === 'signup_closed') {
    return { kind: 'closed' };
  }
  if (err?.status === 422 && body.errors && typeof body.errors === 'object') {
    const errors: Record<string, string> = {};
    for (const field of Object.keys(body.errors)) {
      const lines = body.errors[field];
      errors[field] = String(Array.isArray(lines) ? lines[0] : lines);
    }
    return { kind: 'fields', errors };
  }
  if (err?.status === 422) {
    // signup_not_possible: the api names no field and no reason, and neither does the page.
    return {
      kind: 'refused',
      text: body.message || 'We could not create the account with these details. If you already have an account, sign in.',
      retry: false,
    };
  }
  if (err?.status === 429) {
    return {
      kind: 'refused',
      text: `Too many tries from this connection. Wait ${waitWords(err.headers?.get('Retry-After'))}, then try again. Nothing was created.`,
      retry: false,
    };
  }
  if (err?.status === 503) {
    return {
      kind: 'refused',
      text: 'We cannot start new trials at this moment. Nothing was created. Please try again later.',
      retry: true,
    };
  }
  if (err?.status === 0) {
    return { kind: 'refused', text: `We could not reach ${PRODUCT_NAME}. Check your internet connection.`, retry: true };
  }
  return { kind: 'refused', text: 'Something went wrong on our side. Nothing was created. Try again.', retry: true };
}

/**
 * The rows of GET public/gst/states ({ code, name, abbreviation }) for the State box, by name.
 * Empty when the answer is not such a list: the caller then uses the web's own copy.
 */
export function toGstStates(data: unknown): GstState[] {
  const rows: any[] = Array.isArray(data) ? data : [];
  const states = rows
    .filter((row) => row && /^\d\d$/.test(String(row.code)) && typeof row.name === 'string' && row.name.trim())
    .map((row): GstState => ({ code: String(row.code), name: row.name.trim() }));
  return states.length === rows.length ? states.sort((a, b) => a.name.localeCompare(b.name)) : [];
}

const STATE_KEY = 'signup-state';

@Injectable({ providedIn: 'root' })
export class SignupService {
  constructor(private api: ApiHttpService, private auth: AuthService, private access: AccessService) {}

  /**
   * Is sign-up open? GET signup/state (public, outside the sign-up limiter) answers
   * { open, verify_email, trial_days, plan: { name } }. An api without that route (404) is asked the old
   * way when SIGNUP_ASK_ON_OPEN is on. Anything else (no connection) is "unknown": the form is shown
   * and the submit tells.
   */
  ask(): Observable<SignupOpening> {
    return this.api.get('signup/state', quiet()).pipe(
      map((res: any): SignupOpening => {
        const data = res?.data;
        if (!data || typeof data.open !== 'boolean') {
          return { state: 'unknown', trialDays: null };
        }
        const days = Number(data.trial_days);
        return { state: data.open ? 'open' : 'closed', trialDays: data.trial_days != null && isFinite(days) && days > 0 ? days : null };
      }),
      catchError((err: HttpErrorResponse) =>
        err?.status === 404 && SIGNUP_ASK_ON_OPEN
          ? this.askByPost().pipe(map((state): SignupOpening => ({ state, trialDays: null })))
          : of<SignupOpening>({ state: 'unknown', trialDays: null })
      )
    );
  }

  /**
   * The states of the State box: GET public/gst/states (no token; the api lets it be kept for a day).
   * The web's own copy is the fallback: when the api has no such route (404), and also when it gives
   * no list at all, because a form without states could not be sent.
   */
  states(): Observable<GstState[]> {
    return this.api.get('public/gst/states', quiet()).pipe(
      map((res: any): GstState[] => {
        const states = toGstStates(res?.data);
        return states.length ? states : GST_STATES;
      }),
      catchError(() => of(GST_STATES))
    );
  }

  /**
   * The fallback: an empty POST signup. A closed install answers 403 signup_closed before it reads
   * anything, an open one answers 422 (nothing is made). It counts on the api's limiter (3 an hour
   * for an IP), so the answer is kept for the browser tab.
   */
  private askByPost(): Observable<SignupState> {
    const known = this.remembered();
    if (known) {
      return of(known);
    }
    return this.api.post('signup', {}, quiet()).pipe(
      map((): SignupState => 'unknown'),
      catchError((err: HttpErrorResponse) => {
        const state: SignupState =
          err?.status === 403 && err.error?.code === 'signup_closed' ? 'closed' : err?.status === 422 ? 'open' : 'unknown';
        this.remember(state);
        return of(state);
      })
    );
  }

  signUp(form: SignupForm): Observable<SignupOutcome> {
    return this.api.post('signup', signupBody(form), quiet()).pipe(
      map((res: any): SignupOutcome => {
        const data = res?.data;
        if (res?.success && data?.verification_required === false && data.access_token) {
          // The same two steps as after POST login: the token and the user are kept, and GET me /
          // GET subscription are asked for the new token by the first page of the app.
          this.access.forget();
          this.auth.setUserAndToken({ ...data.user, access_token: data.access_token }, true);
          return { kind: 'signed_in' };
        }
        if (res?.success && data?.verification_required) {
          return {
            kind: 'check_email',
            message: res.message || 'Check your e-mail: we have sent a link to confirm the address. Open it, then sign in.',
          };
        }
        return { kind: 'refused', text: res?.message || 'Something went wrong on our side. Try again.', retry: true };
      }),
      catchError((err: HttpErrorResponse) => {
        const outcome = readRefusal(err);
        if (outcome.kind === 'closed') {
          this.remember('closed');
        }
        return of(outcome);
      })
    );
  }

  private remembered(): SignupState | null {
    try {
      const value = sessionStorage.getItem(STATE_KEY);
      return value === 'open' || value === 'closed' ? value : null;
    } catch {
      return null;
    }
  }

  private remember(state: SignupState): void {
    try {
      if (state === 'unknown') {
        sessionStorage.removeItem(STATE_KEY);
      } else {
        sessionStorage.setItem(STATE_KEY, state);
      }
    } catch {
      // a browser without storage asks again
    }
  }
}
