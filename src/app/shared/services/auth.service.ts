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

  public logout() {
    this._ls.clear();
    this._router.navigate(['/auth/login']);
  }

  public setUserAndToken(user: IUserDto, isAuthenticated: Boolean) {
    this.isAuthenticated = isAuthenticated;
    this.token = user.access_token;
    this.user = user;
    this.user$.next(user);
    this.profile$.next(user.profile);
    this._ls.setItem(this.TOKEN, this.token);
    this._ls.setItem(this.USER, user);
    this._ls.setItem('profile', user.profile);
  }
}
