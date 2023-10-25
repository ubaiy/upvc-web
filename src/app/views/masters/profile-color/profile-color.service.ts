import { Injectable } from '@angular/core';
import { ApiHttpService } from '../../../shared/services/api-http.service';
import { Observable } from 'rxjs';
import { IResponseDto } from '../../../shared/model/common/response.model';
import { IProfileColorDto } from '../../../shared/model/profile/profile-color.model';
import { API_END_POINT } from '../../../shared/configs/api.config';
@Injectable({
  providedIn: 'root',
})
export class ProfileColorService {
  constructor(private _apiHttpSerivce: ApiHttpService) {}

  public getList(): Observable<IResponseDto<IProfileColorDto[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.profile_color.list);
  }

  public getDetails(id: number): Observable<IResponseDto<IProfileColorDto>> {
    return this._apiHttpSerivce.get(API_END_POINT.profile_color.detail + id);
  }

  public addColor(data: IProfileColorDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.profile_color.add, data);
  }

  public updateColor(data: IProfileColorDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(
      API_END_POINT.profile_color.update + data.id,
      data
    );
  }

  public deleteColor(id: number): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.profile_color.delete + id);
  }

  public getDropdown(): Observable<IResponseDto<IProfileColorDto[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.profile_color.dropdown);
  }
}
