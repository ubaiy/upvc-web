import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiHttpService } from 'src/app/shared/services/api-http.service';

export interface NewPassword {
  email: string;
  token: string;
  password: string;
  confirm_password: string;
}

/**
 * The two password-reset calls (card T68 in the API, T76 here). Neither needs
 * a sign-in. A refusal comes back as HTTP 200 without `success`, and is
 * thrown as an Error that carries the API's message.
 */
@Injectable({ providedIn: 'root' })
export class PasswordResetService {
  constructor(private api: ApiHttpService) {}

  /** The API answers the same whether or not the address has an account. */
  requestLink(email: string): Observable<string> {
    return this.api.post('forgot-password', { email }).pipe(map((res) => this.message(res)));
  }

  setPassword(body: NewPassword): Observable<string> {
    return this.api.post('reset-password', body).pipe(map((res) => this.message(res)));
  }

  private message(res: { success?: boolean; message?: string }): string {
    if (!res || res.success !== true) {
      throw new Error(res?.message || 'The server refused the request.');
    }
    return res.message ?? '';
  }
}

/** Words for a failed call: the API's own for a refusal, plain ones for the rest. */
export function resetFailure(err: any, fallback: string): { text: string; retry: boolean } {
  if (err?.status === 429) {
    return { text: 'Too many attempts. Wait a minute, then try again.', retry: false };
  }
  if (err?.status === 0) {
    return { text: 'We could not reach UPVC. Check your internet connection.', retry: true };
  }
  if (typeof err?.status === 'number') {
    // 422 is a field the API did not accept; anything else is a fault on our side.
    return err.status === 422 && err.error?.message
      ? { text: err.error.message, retry: false }
      : { text: fallback, retry: true };
  }
  return { text: err?.message || fallback, retry: false };
}
