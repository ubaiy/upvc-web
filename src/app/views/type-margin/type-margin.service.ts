import { Injectable } from '@angular/core';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { Observable } from 'rxjs';
import { IResponseDto } from '../../shared/model/common/response.model';
import { API_END_POINT } from '../../shared/configs/api.config';
import { ITypeMarginDto } from '../../shared/model/type-margin/typeMargin.model';
@Injectable({
  providedIn: 'root',
})
export class TypeMarginService {
  constructor(private _apiHttpSerivce: ApiHttpService) {}

  public getTypeMarginList(): Observable<IResponseDto<ITypeMarginDto[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.type_margin.list);
  }

  public getTypeMarginDetail(
    id: number
  ): Observable<IResponseDto<ITypeMarginDto>> {
    return this._apiHttpSerivce.get(`${API_END_POINT.type_margin.get}/${id}`);
  }

  public addTypeMargin(data: ITypeMarginDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.type_margin.add, data);
  }

  public editTypeMargin(data: ITypeMarginDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(
      `${API_END_POINT.type_margin.update}/${data.id}`,
      data
    );
  }

  public deleteTypeMarginDetail(
    id: number
  ): Observable<IResponseDto<ITypeMarginDto>> {
    return this._apiHttpSerivce.post(
      `${API_END_POINT.type_margin.delete}/${id}`
    );
  }
}
