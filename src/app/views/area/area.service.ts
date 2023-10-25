import { Injectable } from '@angular/core';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { Observable } from 'rxjs';
import { IResponseDto } from '../../shared/model/common/response.model';
import { API_END_POINT } from '../../shared/configs/api.config';
import { IAreaDto } from '../../shared/model/area/area.model';
@Injectable({
  providedIn: 'root',
})
export class AreaService {
  constructor(private _apiHttpSerivce: ApiHttpService) {}

  public getAreaList(): Observable<IResponseDto<IAreaDto[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.area.list);
  }

  public getAreaDetail(id: number): Observable<IResponseDto<IAreaDto>> {
    return this._apiHttpSerivce.get(`${API_END_POINT.area.get}/${id}`);
  }

  public addArea(data: IAreaDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.area.add, data);
  }

  public editArea(data: IAreaDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(
      `${API_END_POINT.area.update}/${data.id}`,
      data
    );
  }
}
