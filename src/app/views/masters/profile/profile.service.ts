import { Injectable } from '@angular/core';
import { ApiHttpService } from '../../../shared/services/api-http.service';
import { Observable } from 'rxjs';
import { IResponseDto } from '../../../shared/model/common/response.model';
import { API_END_POINT } from '../../../shared/configs/api.config';
import { IProductListDto } from '../../../shared/model/profile/productList.model';
import { IProfileDropdown } from '../../../shared/model/profile/profileDropdown.model';
import { IProductDetailDto } from '../../../shared/model/profile/productDetail.model';
@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  constructor(private _apiHttpSerivce: ApiHttpService) {}

  public getCategorylTypes(): Observable<IResponseDto<[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.product.category);
  }

  public getProductList(): Observable<IResponseDto<IProductListDto[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.product.productList);
  }

  public productDropdown(
    query: any
  ): Observable<IResponseDto<IProfileDropdown[]>> {
    query = Object.keys(query)
      .map((key) => key + '=' + query[key])
      .join('&');
    return this._apiHttpSerivce.get(
      API_END_POINT.product.productDropdown + '?' + query
    );
  }

  public getProductDetail(
    id: number
  ): Observable<IResponseDto<IProductDetailDto>> {
    return this._apiHttpSerivce.get(`${API_END_POINT.product.get}/${id}`);
  }

  public editProductDetail(
    data: IProductDetailDto
  ): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(
      `${API_END_POINT.product.edit}/${data.id}`,
      data
    );
  }

  public addProductDetail(
    data: IProductDetailDto
  ): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.product.add, data);
  }
}
