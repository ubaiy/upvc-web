import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { IResponseDto } from '../../shared/model/common/response.model';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { API_END_POINT } from '../../shared/configs/api.config';
@Injectable({
  providedIn: 'root',
})
export class BillsService {
  constructor(private _apiHttpSerivce: ApiHttpService) {}

  public getBillsList(): Observable<IResponseDto<any[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.bills.list);
  }
}
