import { Injectable } from '@angular/core';
import { ApiHttpService } from './api-http.service';
import { Observable } from 'rxjs';
import { API_END_POINT } from '../configs/api.config';
import { IResponseDto } from '../model/common/response.model';
import { IMasterListDto } from '../model/masters/masterList.model';
import { IAllDropDownsDto } from '../model/common/allDropdowns.model';
@Injectable({
  providedIn: 'root',
})
export class DropdownService {
  constructor(private _apiHttpService: ApiHttpService) {}

  public getProfileCategoryDropdown(): Observable<IResponseDto<[]>> {
    return this._apiHttpService.get(API_END_POINT.product.category);
  }

  public getProductTypeDropdown(): Observable<IResponseDto<[]>> {
    return this._apiHttpService.get(API_END_POINT.product.productType);
  }

  public getSliddingTypesDropdown(): Observable<IResponseDto<[]>> {
    return this._apiHttpService.get(API_END_POINT.product.sliddingTypes);
  }

  public getCostheadList(): Observable<IResponseDto<[]>> {
    return this._apiHttpService.get(API_END_POINT.costHead.base);
  }

  public getCostheadTypeList(query: any): Observable<IResponseDto<[]>> {
    query = Object.keys(query)
      .map((key) => key + '=' + query[key])
      .join('&');
    return this._apiHttpService.get(
      API_END_POINT.costHead.costHeadTypes + '?' + query
    );
  }

  public getUnitDropdown(): Observable<IResponseDto<[]>> {
    return this._apiHttpService.get(API_END_POINT.costHead.unit);
  }

  public getCostHeadDataDropdown(
    query: any
  ): Observable<IResponseDto<IMasterListDto>> {
    query = Object.keys(query)
      .map((key) => key + '=' + query[key])
      .join('&');
    return this._apiHttpService.get(
      API_END_POINT.costHead.costHeadList + '?' + query
    );
  }

  public getHingesDropdown(): Observable<IResponseDto<[]>> {
    return this._apiHttpService.get(API_END_POINT.product.hingesType);
  }

  public allDropDowns(): Observable<IResponseDto<IAllDropDownsDto>> {
    return this._apiHttpService.get(API_END_POINT.product.allDropdowns);
  }
}
