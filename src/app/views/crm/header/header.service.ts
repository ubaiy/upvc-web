import { Injectable } from '@angular/core';
import { ApiHttpService } from '../../../shared/services/api-http.service';
import { Observable } from 'rxjs';
import { IHeaderDto } from '../../../shared/model/header/header.model';
import { IResponseDto } from '../../../shared/model/common/response.model';
import { API_END_POINT } from '../../../shared/configs/api.config';
@Injectable({
  providedIn: 'root',
})
export class HeaderService {
  constructor(private _apiHttpSerivce: ApiHttpService) {}

  public getHeaderList(): Observable<IResponseDto<IHeaderDto[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.header.list);
  }

  public getHeaderDetail(id: number): Observable<IResponseDto<IHeaderDto>> {
    return this._apiHttpSerivce.get(`${API_END_POINT.header.get}/${id}`);
  }

  public addHeader(data: IHeaderDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.header.add, data);
  }

  public editHeader(data: IHeaderDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(
      `${API_END_POINT.header.update}/${data.id}`,
      data
    );
  }
}
