import { Injectable } from '@angular/core';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { Observable } from 'rxjs';
import { IResponseDto } from '../../shared/model/common/response.model';
import { API_END_POINT } from '../../shared/configs/api.config';
import { IPaymentTypeDto } from '../../shared/model/paymentTerms/paymentTerms.model';
@Injectable({
  providedIn: 'root',
})
export class PaymentTermsService {
  constructor(private _apiHttpSerivce: ApiHttpService) {}

  public getPaymentTypeList(): Observable<IResponseDto<IPaymentTypeDto[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.paymentType.list);
  }

  public getPaymentTypeDetail(
    id: number
  ): Observable<IResponseDto<IPaymentTypeDto>> {
    return this._apiHttpSerivce.get(`${API_END_POINT.paymentType.get}/${id}`);
  }

  public addPaymentType(data: IPaymentTypeDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.paymentType.add, data);
  }

  public editPaymentType(data: IPaymentTypeDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(
      `${API_END_POINT.paymentType.update}/${data.id}`,
      data
    );
  }

  public deletePaymentTerms(
    id: number
  ): Observable<IResponseDto<IPaymentTypeDto>> {
    return this._apiHttpSerivce.post(
      `${API_END_POINT.paymentType.delete}/${id}`
    );
  }
}
