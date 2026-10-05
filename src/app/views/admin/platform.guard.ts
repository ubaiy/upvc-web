import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { quiet } from '../../shared/interceptors/request-options';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { AuthService } from '../../shared/services/auth.service';
import { LocalStoreService } from '../../shared/services/local-storage.service';

/**
 * Is the signed-in user the platform admin (the product owner) or a company's user?
 * The sign-in answer does not say; GET subscription does: `is_platform_admin`.
 * It is asked once for a user and kept with that user's id, so a second person
 * signing in on the same browser is asked again.
 *
 * This only decides which screens are shown. The api is the control: it answers
 * 403 to a company user on admin/* and to a platform admin on a company route.
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly KEY = 'PlatformAdmin';

  constructor(private api: ApiHttpService, private store: LocalStoreService) {}

  isPlatformAdmin(): Observable<boolean> {
    const userId = this.store.getItem('User')?.id ?? null;
    const kept = this.store.getItem(this.KEY);
    if (kept && userId !== null && kept.userId === userId) {
      return of(kept.admin === true);
    }
    return this.api.get('subscription', quiet()).pipe(
      map((res: any) => {
        const admin = res?.data?.is_platform_admin === true;
        this.store.setItem(this.KEY, { userId, admin });
        return admin;
      }),
      // Not known (no connection): treated as a company user, and not kept.
      catchError(() => of(false))
    );
  }
}

/** The admin area: only the platform admin. A visitor signs in first; a company user gets "not allowed". */
@Injectable({ providedIn: 'root' })
export class PlatformAdminGuard implements CanActivate {
  constructor(private router: Router, private auth: AuthService, private platform: PlatformService) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> | boolean {
    if (!this.auth.getToken()) {
      this.router.navigate(['/auth/login'], { queryParams: this.auth.signInParams(state.url) });
      return false;
    }
    return this.platform
      .isPlatformAdmin()
      .pipe(map((admin) => (admin ? true : this.router.createUrlTree(['/admin/not-allowed']))));
  }
}

/** The company's screens: a platform admin has no company, so every address of the app leads them to the admin area. */
@Injectable({ providedIn: 'root' })
export class CompanyAreaGuard implements CanActivate {
  constructor(private router: Router, private auth: AuthService, private platform: PlatformService) {}

  canActivate(): Observable<boolean | UrlTree> | boolean {
    if (!this.auth.getToken()) {
      // AuthGuard, next to this one, sends the visitor to sign in.
      return true;
    }
    return this.platform.isPlatformAdmin().pipe(map((admin) => (admin ? this.router.createUrlTree(['/admin']) : true)));
  }
}
