import { Injectable } from '@angular/core';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { Observable } from 'rxjs';
import { ICustomerDto } from '../../shared/model/customer/customer.model';
import { IResponseDto } from '../../shared/model/common/response.model';
import { API_END_POINT } from '../../shared/configs/api.config';
import { ICustomerAdddressDto } from 'src/app/shared/model/customer/customerAddress.model';
import { GstState } from './customer.adapter';
@Injectable({
  providedIn: 'root',
})
export class CustomerService {
  constructor(private _apiHttpSerivce: ApiHttpService) {}

  public getCustomerList(): Observable<IResponseDto<ICustomerDto[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.customer.list);
  }

  public getCustomerDetail(id: number): Observable<IResponseDto<ICustomerDto>> {
    return this._apiHttpSerivce.get(`${API_END_POINT.customer.get}/${id}`);
  }

  public addCustomer(
    data: ICustomerDto
  ): Observable<IResponseDto<ICustomerDto>> {
    return this._apiHttpSerivce.post(API_END_POINT.customer.add, data);
  }

  public editCustomer(data: ICustomerDto): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(
      `${API_END_POINT.customer.update}/${data.id}`,
      data
    );
  }

  public getCustomerAddressList(
    query: any
  ): Observable<IResponseDto<ICustomerAdddressDto[]>> {
    query = Object.keys(query)
      .map((key) => key + '=' + query[key])
      .join('&');
    return this._apiHttpSerivce.get(
      API_END_POINT.customer_address.list + '?' + query
    );
  }

  public getCustomerAddressDetail(
    id: number
  ): Observable<IResponseDto<ICustomerAdddressDto>> {
    return this._apiHttpSerivce.get(
      `${API_END_POINT.customer_address.get}/${id}`
    );
  }

  public addCustomerAddress(
    data: ICustomerAdddressDto
  ): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.customer_address.add, data);
  }

  public editCustomerAddress(
    data: ICustomerAdddressDto
  ): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(
      `${API_END_POINT.customer_address.update}/${data.id}`,
      data
    );
  }

  public deleteCustomer(id: number): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(`${API_END_POINT.customer.delete}/${id}`);
  }

  public deleteCustomerAddress(id: number): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(
      `${API_END_POINT.customer_address.delete}/${id}`
    );
  }

  /** GST state list: the same one the API uses to decide the tax split. */
  public getStates(): Observable<IResponseDto<GstState[]>> {
    return this._apiHttpSerivce.get('gst/states');
  }

  /** Company settings; the form reads the fabricator's own state from it. */
  public getCompanySettings(): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.get('company/settings');
  }
}
