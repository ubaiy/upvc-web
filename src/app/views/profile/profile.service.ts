import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';
import { IResponseDto } from 'src/app/shared/model/common/response.model';
import { IUserDto } from 'src/app/shared/model/user.model';
import { API_END_POINT } from 'src/app/shared/configs/api.config';
import { quiet } from 'src/app/shared/interceptors/request-options';
@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  constructor(private _apiHttpService: ApiHttpService) {}

  public getProfile(): Observable<IResponseDto<IUserDto>> {
    return this._apiHttpService.get(API_END_POINT.user.getProfile);
  }

  public updateProfile(data: IUserDto): Observable<IResponseDto<IUserDto>> {
    return this._apiHttpService.post(API_END_POINT.user.updateProfile, data);
  }

  /** Changes the signed-in user's password. A refusal is HTTP 200 with `status: 0` and `data.errors`. */
  public changePassword(data: { current_password: string; password: string; confirm_password: string }): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(API_END_POINT.auth.changePassword, data, quiet('errors'));
  }

  public updateProfilePhoto(data: any): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(
      API_END_POINT.user.updateProfilePhoto,
      data
    );
  }
}
