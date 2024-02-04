import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_END_POINT } from 'src/app/shared/configs/api.config';
import { IResponseDto } from 'src/app/shared/model/common/response.model';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';

@Injectable({
  providedIn: 'root',
})
export class BulkPriceUpdateService {
  constructor(private _apiHttpService: ApiHttpService) {}

  public getBulkPrice(): Observable<IResponseDto<any>> {
    return this._apiHttpService.get(API_END_POINT.bulkPriceUpdate.get);
  }

  public postBulkPrice(data: any): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(API_END_POINT.bulkPriceUpdate.post, data);
  }
}
