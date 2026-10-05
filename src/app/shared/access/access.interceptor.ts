import { Injectable } from '@angular/core';
import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { ToastService } from '../services/toast.service';
import { AccessService } from './access.service';

export const ROLE_REFUSAL = 'Your role does not allow this. Ask the owner of the account.';
export const LOCKED_REFUSAL =
  'The account is read-only, so this was not saved. Nothing is lost: you can still view and download everything.';

/** The plain line for a refusal by role or by plan, or `null` for any other failure. */
export function refusalLine(err: unknown): string | null {
  if (!(err instanceof HttpErrorResponse)) {
    return null;
  }
  const body: any = err.error;
  if (err.status === 402) {
    return (body && typeof body === 'object' && body.message) || LOCKED_REFUSAL;
  }
  if (err.status === 403 && body && typeof body === 'object' && body.code === 'forbidden_for_role') {
    return body.message || ROLE_REFUSAL;
  }
  return null;
}

/**
 * The two refusals every screen can meet, handled in one place (card T117):
 *
 * - 402 `subscription_locked`: the company is locked or suspended. The api's line is shown
 *   once and GET subscription is read again, so the banner and the locked buttons appear
 *   without a reload.
 * - 403 `forbidden_for_role`: the role may not do this. One plain line, also for a request
 *   that is otherwise quiet, so the screen is never left blank without a reason.
 *
 * The error still reaches the caller, which shows its own state next to the form.
 */
@Injectable()
export class AccessInterceptor implements HttpInterceptor {
  constructor(private toast: ToastService, private access: AccessService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      tap({
        error: (err) => {
          const line = refusalLine(err);
          if (!line) {
            return;
          }
          // The toast service drops the same line when the loader interceptor says it too.
          this.toast.showError(line);
          if (err.status === 402) {
            this.access.refreshSubscription();
          }
        },
      })
    );
  }
}
