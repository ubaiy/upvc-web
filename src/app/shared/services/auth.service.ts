import { Injectable } from '@angular/core';
import { ApiHttpService } from './api-http.service';
import { ILoginRequestDto } from '../model/loginRequest.model';
import { API_END_POINT } from '../configs/api.config';
import { BehaviorSubject, Observable, catchError, map, throwError } from 'rxjs';
import { IUserDto, UserDto } from '../model/user.model';
import { LocalStoreService } from './local-storage.service';
import { Router } from '@angular/router';
import { IResponseDto } from '../model/common/response.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  token: string;
  isAuthenticated: Boolean = false;
  user: IUserDto = new UserDto();
  user$ = new BehaviorSubject<IUserDto>(this.user);
  profile$ = new BehaviorSubject<string>(
    '../../assets/images/defaultProfile.webp'
  );
  TOKEN = 'Token';
  USER = 'User';
  constructor(
    private _apiHttpService: ApiHttpService,
    private _ls: LocalStoreService,
    private _router: Router
  ) {}

  getToken(): string {
    return this._ls.getItem(this.TOKEN);
  }

  public login(
    loginData: ILoginRequestDto
  ): Observable<IResponseDto<IUserDto>> {
    return this._apiHttpService.post(API_END_POINT.auth.login, loginData).pipe(
      map((res: any) => {
        if (res.success) {
          this.setUserAndToken(res.data, !!res);
        }
        return res;
      }),
      catchError((error) => {
        // this._alertService.errorAlert(error.error.message);//TODO need to add alert
        return throwError(error);
      })
    );
  }

  /**
   * Full logout: revoke the token server-side (audit H2), then clear local
   * state. The revocation call is fire-and-forget — local state is cleared
   * even if the API is unreachable or the token is already invalid.
   */
  public logout() {
    this._apiHttpService.post(API_END_POINT.auth.logout).subscribe({
      next: () => {},
      error: () => {},
    });
    this.clearSession();
  }

  /**
   * Clear local session state only (no API call). Used by the 401 handler so
   * an expired/revoked token doesn't trigger a logout call that would 401
   * again in a loop. Removes only our own keys (not localStorage.clear()).
   */
  public clearSession() {
    this.token = '';
    this.isAuthenticated = false;
    this.user = new UserDto();
    this.user$.next(this.user);
    this.profile$.next('../../assets/images/defaultProfile.webp');
    this._ls.remove(this.TOKEN);
    this._ls.remove(this.USER);
    this._ls.remove('profile');
    this._router.navigate(['/auth/login']);
  }

  public setUserAndToken(user: IUserDto, isAuthenticated: Boolean) {
    this.isAuthenticated = isAuthenticated;
    // The API only returns access_token from login; get-profile now echoes
    // null there (audit H2). Never overwrite a valid token with null, and
    // keep the token under its own key only — not duplicated in the User
    // blob. Tokens expire after 7 days server-side; expiry surfaces as a
    // 401, which clearSession() handles.
    if (user.access_token) {
      this.token = user.access_token;
      this._ls.setItem(this.TOKEN, this.token);
    }
    const { access_token, ...userWithoutToken } = user;
    this.user = user;
    this.user$.next(user);
    this.profile$.next(user.profile);
    this._ls.setItem(this.USER, userWithoutToken);
    this._ls.setItem('profile', user.profile);
  }
}
