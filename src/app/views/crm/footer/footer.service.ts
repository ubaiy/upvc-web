import { Injectable } from '@angular/core';
import { ApiHttpService } from '../../../shared/services/api-http.service';
import { Observable } from 'rxjs';
import { IFooterDto } from '../../../shared/model/footer/footer.model';
import { IResponseDto } from '../../../shared/model/common/response.model';
import { API_END_POINT } from '../../../shared/configs/api.config';
@Injectable({
  providedIn: 'root',
})
export class FooterService {
  constructor(private _apiHttpSerivce: ApiHttpService) {}

  public getFooterList(): Observable<IResponseDto<IFooterDto[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.footer.list);
  }

  public getFooterDetail(id: number): Observable<IResponseDto<IFooterDto>> {
    return this._apiHttpSerivce.get(`${API_END_POINT.footer.get}/${id}`);
  }

  public addFooter(data: IFooterDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.footer.add, data);
  }

  public editFooter(data: IFooterDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(
      `${API_END_POINT.footer.update}/${data.id}`,
      data
    );
  }
}
