// loader-interceptor.service.ts
import { Injectable } from '@angular/core';
import {
  HttpResponse,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { LoaderService } from '../services/loader.service';
import { LocalStoreService } from '../services/local-storage.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
@Injectable()
export class LoaderInterceptor implements HttpInterceptor {
  private requests: HttpRequest<any>[] = [];

  constructor(
    private loaderService: LoaderService,
    private authService: AuthService,
    private ls: LocalStoreService,
    private _toastService: ToastService
  ) {}

  removeRequest(req: HttpRequest<any>) {
    const i = this.requests.indexOf(req);
    if (i >= 0) {
      this.requests.splice(i, 1);
    }
    this.loaderService.isLoading.next(this.requests.length > 0);
  }

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    this.requests.push(req);
    if (!req.url.includes('i18n')) {
      this.loaderService.isLoading.next(true);
    }
    return Observable.create(
      (observer: {
        next: (arg0: HttpResponse<any>) => void;
        error: (arg0: any) => void;
        complete: () => void;
      }) => {
        const subscription = next.handle(req).subscribe(
          (event) => {
            if (event instanceof HttpResponse) {
              this.removeRequest(req);
              // Shared business-error handler (defects D4/A3): the API
              // returns HTTP 200 with {status: 0, message} and no `success`
              // key on validation/business failures. Components that only
              // branch on res.success would swallow these silently — surface
              // the API's message once, here, for every such response.
              // ToastService de-duplicates if a component also toasts it.
              const body: any = event.body;
              if (
                body &&
                typeof body === 'object' &&
                !(body instanceof Blob) &&
                body.success === undefined &&
                body.status === 0 &&
                body.message
              ) {
                this._toastService.showError(body.message);
              }
              observer.next(event);
            }
          },
          (err) => {
            if (err.status == 401) {
              // Clear local state only — calling logout() here would POST
              // api/v1/logout with the same dead token and 401 in a loop.
              if (!req.url.endsWith('/logout')) {
                this._toastService.showError('Session Expired.');
              }
              this.authService.clearSession();
            } else if (!req.url.includes('i18n')) {
              // Surface failed requests (400/500/network) so actions aren't silent.
              const detail =
                err?.error?.message ||
                (err?.status === 0
                  ? 'Network error. Please check your connection.'
                  : err?.statusText || 'Something went wrong. Please try again.');
              this._toastService.showError(detail);
            }
            this.removeRequest(req);
            observer.error(err);
          },
          () => {
            this.removeRequest(req);
            observer.complete();
          }
        );
        // remove request from queue when cancelled
        return () => {
          this.removeRequest(req);
          subscription.unsubscribe();
        };
      }
    );
  }
}
