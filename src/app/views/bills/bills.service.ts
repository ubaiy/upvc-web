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

  /** Every quotation, billed or not: the list links a bill to the quotation it came from. */
  public getQuotations(): Observable<IResponseDto<any[]>> {
    return this._apiHttpSerivce.get('quatation/list?status=all');
  }

  /**
   * Cancels a bill. The API has no cancel yet, so this removes the bill
   * (bill/delete); it moves to the cancel endpoint when that exists.
   */
  public cancelBill(id: number): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.bills.delete, {
      bill_id: id,
    });
  }
}
