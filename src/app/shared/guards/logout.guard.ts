import { Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class LogoutGuard implements CanActivate {
  constructor(private _router: Router, private _authService: AuthService) {}

  canActivate() {
    if (!this._authService.getToken()) {
      return true;
    } else {
      // this._alertService.errorAlert('Please logout first.'); //TODO need to add alert
      this._router.navigate(['/dashboard']);
      return false;
    }
  }
}
