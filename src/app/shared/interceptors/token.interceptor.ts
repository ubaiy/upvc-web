import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';
@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}
  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    let token = this.authService.token || this.authService.getToken();
    let changedReq;
    // The bearer token belongs to the configured API only; attaching it to
    // any other host (CDN, telemetry, absolute URLs) leaks the credential.
    if (token && req.url.startsWith(environment.API_URL)) {
      changedReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });
    } else {
      changedReq = req;
    }
    return next.handle(changedReq);
  }
}
