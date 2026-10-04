import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { IResponseDto } from '../../shared/model/common/response.model';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { API_END_POINT } from '../../shared/configs/api.config';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { DownloadedFile, downloadedFile } from '../../shared/class/download-file';
@Injectable({
  providedIn: 'root',
})
export class BillsService {
  constructor(
    private _apiHttpSerivce: ApiHttpService,
    private http: HttpClient
  ) {}

  public getBillsList(): Observable<IResponseDto<any[]>> {
    // Cancelled bills stay in the list: a number in the series is never reused.
    return this._apiHttpSerivce.get(API_END_POINT.bills.list + '?status=all');
  }

  public getPDF(data: any): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.bills.converToBill, data);
  }

  /** The bill as a PDF file, with the file name the api gave it. */
  public downloadBillPdf(data: any): Observable<DownloadedFile> {
    const headers = new HttpHeaders({
      'Cache-Control': 'no-cache, no-store, must-revalidate', // Disable caching
    });

    return this.http
      .post(`${environment.API_URL}/${API_END_POINT.bills.pdf}`, data, {
        responseType: 'blob',
        observe: 'response',
        headers: headers,
      })
      .pipe(map(downloadedFile));
  }

  /** Every quotation, billed or not: the list links a bill to the quotation it came from. */
  public getQuotations(): Observable<IResponseDto<any[]>> {
    return this._apiHttpSerivce.get(API_END_POINT.quatation.list + '?status=all');
  }

  /**
   * Cancels a bill (bill/cancel). The bill keeps its number and stays in the
   * list as cancelled; its quotation goes back to the status it had before.
   * The reason (optional, up to 191 characters) is kept with the bill.
   */
  public cancelBill(id: number, reason = ''): Observable<IResponseDto<any>> {
    return this._apiHttpSerivce.post(API_END_POINT.bills.cancel, {
      bill_id: id,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
  }
}
