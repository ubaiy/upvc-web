import { Injectable } from '@angular/core';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { IResponseDto } from '../../shared/model/common/response.model';
import { API_END_POINT } from '../../shared/configs/api.config';
import { Observable } from 'rxjs';
import { IMasterDetailDto } from 'src/app/shared/model/masters/masterDetail.model';
@Injectable({
  providedIn: 'root',
})
export class MastersService {
  constructor(private _apiHttpService: ApiHttpService) {}

  public getList(query: any): Observable<IResponseDto<IMasterDetailDto>> {
    query = Object.keys(query)
      .map((key) => key + '=' + query[key])
      .join('&');
    return this._apiHttpService.get(
      API_END_POINT.costHead.costHeadList + '?' + query
    );
  }

  public getCostheadDetail(
    id: number
  ): Observable<IResponseDto<IMasterDetailDto>> {
    return this._apiHttpService.get(`${API_END_POINT.costHead.get}/${id}`);
  }

  public addCostHeadDetail(
    data: IMasterDetailDto
  ): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(API_END_POINT.costHead.costHeadAdd, data);
  }

  public editCostHeadDetail(
    data: IMasterDetailDto
  ): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(
      `${API_END_POINT.costHead.costHeadUpdate}/${data.id}`,
      data
    );
  }
}
