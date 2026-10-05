import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, map } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { homeFor, allows } from './access.models';
import { AccessService } from './access.service';

/**
 * A page of the app needs one ability: `data: { ability: 'quotations.view' }` on its route.
 * A user whose role lacks it is led to the first screen the role has when they asked for
 * Home (a workshop user opens on Orders), and to one plain line otherwise.
 * Decided by the abilities GET me lists, never by the name of a role.
 */
@Injectable({ providedIn: 'root' })
export class AbilityGuard implements CanActivate {
  constructor(private router: Router, private auth: AuthService, private access: AccessService) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> | boolean {
    const ability: string | undefined = route.data?.['ability'];
    if (!ability || !this.auth.getToken()) {
      // No session: AuthGuard on the shell sends the visitor to sign in.
      return true;
    }
    return this.access.load().pipe(
      map((known) => {
        if (allows(known, ability)) {
          return true;
        }
        const home = homeFor(known);
        const path = state.url.split(/[?#]/)[0];
        return path === '/dashboard' && home !== '/no-access'
          ? this.router.parseUrl(home)
          : this.router.createUrlTree(['/no-access']);
      })
    );
  }
}
