import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_END_POINT } from 'src/app/shared/configs/api.config';
import { IResponseDto } from 'src/app/shared/model/common/response.model';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';
import { IQuotationDetailDto } from 'src/app/shared/model/quotation/quotation-detail.model';
import { IProductListDto } from 'src/app/shared/model/profile/productList.model';
import { ISubQuotationDetailDto } from 'src/app/shared/model/quotation/sub-quotation-detail.model';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ISubQuotation } from 'src/app/shared/model/quotation/sub-quotation.model';
import { IOpenDirectionDrpDto } from 'src/app/shared/model/quotation/open-directionDrp.model';
import Konva from 'konva';
import { IResponseDtoOfProduct } from './sub-quotation/sub-quotation-design/response.model';

@Injectable({
  providedIn: 'root',
})
export class QuotationService {
  constructor(
    private _apiHttpService: ApiHttpService,
    private http: HttpClient
  ) {}

  public getQuotationList(): Observable<IResponseDto<any>> {
    return this._apiHttpService.get(API_END_POINT.quatation.list);
  }

  public getCasementTypes(): Observable<IResponseDto<[]>> {
    return this._apiHttpService.get(API_END_POINT.quatation.casementTypes);
  }

  public getSliddingTypes(): Observable<IResponseDto<[]>> {
    return this._apiHttpService.get(API_END_POINT.quatation.sliddingTypes);
  }

  // public getPallaTypes(): Observable<IResponseDto<[]>> {
  //   return this._apiHttpService.get(API_END_POINT.quatation.pallaTypes);
  // }

  public getQuotationDetail(
    id: number
  ): Observable<IResponseDto<ISubQuotation>> {
    return this._apiHttpService.get(`${API_END_POINT.quatation.show}/${id}`);
  }

  public deleteQuotation(id: number): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.delete}/${id}`);
  }

  public deleteQuotationProduct(id: number): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(
      `${API_END_POINT.quatation.deleteProduct}/${id}`
    );
  }

  public addQuotationDetail(data: any): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(API_END_POINT.quatation.add, data);
  }

  public editQuotationDetail(data: any): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(
      `${API_END_POINT.quatation.edit}/${data.id}`,
      data
    );
  }

  public quotationManageProduct(
    data: any
  ): Observable<IResponseDto<ISubQuotationDetailDto>> {
    return this._apiHttpService.post(
      API_END_POINT.quatation.manageProduct,
      data
    );
  }

  public getSubQuotationDetail(
    id: number
  ): Observable<IResponseDto<IResponseDtoOfProduct>> {
    return this._apiHttpService.get(
      `${API_END_POINT.quatation.subQuotationDetail}/${id}`
    );
  }

    public getPDF(data: any): Observable<Blob> {
      const headers = new HttpHeaders({
        'Cache-Control': 'no-cache, no-store, must-revalidate', // Disable caching
      });

      return this.http.post(
        `${environment.API_URL}/${API_END_POINT.quatation.pdf}`,
        data,
        {
          responseType: 'blob', // Specify responseType as an option here
          headers: headers,
        }
      );
    }

  public getOpenningDirection(): Observable<
    IResponseDto<IOpenDirectionDrpDto[]>
  > {
    return this._apiHttpService.get(API_END_POINT.quatation.openningDirection);
  }

  public updateBulkPrice(ids: any): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(
      API_END_POINT.quatation.bulkpriceUpdate,
      ids
    );
  }
}
