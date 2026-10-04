import { Injectable } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
} from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Lets a signed-in user through; anyone else goes to sign in and comes back to the page they asked for. */
@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private _router: Router, private _authService: AuthService) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
    if (this._authService.getToken()) {
      return true;
    } else {
      this._router.navigate(['/auth/login'], {
        queryParams: this._authService.signInParams(state.url),
      });
      return false;
    }
  }
}
