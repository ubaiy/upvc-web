import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';
import { IResponseDto } from 'src/app/shared/model/common/response.model';
import { IUserDto } from 'src/app/shared/model/user.model';
import { API_END_POINT } from 'src/app/shared/configs/api.config';
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

  public updateProfilePhoto(data: any): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(
      API_END_POINT.user.updateProfilePhoto,
      data
    );
  }
}
