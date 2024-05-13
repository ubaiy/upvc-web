import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { IResponseDto } from '../../shared/model/common/response.model';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { API_END_POINT } from '../../shared/configs/api.config';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
@Injectable({
  providedIn: 'root',
})
export class BillsService {
  constructor(
    private _apiHttpSerivce: ApiHttpService,
    private http: HttpClient
  ) {}

  public getBillsList(): Observable<IResponseDto<any[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.bills.list);
  }

  public getPDF(data: any): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.bills.converToBill, data);
  }

  public downloadBillPdf(data: any): Observable<Blob> {
    const headers = new HttpHeaders({
      'Cache-Control': 'no-cache, no-store, must-revalidate', // Disable caching
    });

    return this.http.post(
      `${environment.API_URL}/${API_END_POINT.bills.pdf}`,
      data,
      {
        responseType: 'blob', // Specify responseType as an option here
        headers: headers,
      }
    );
  }

  public deleteBill(id: number): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.bills.pdf, {
      bill_id: id,
    });
  }
}
