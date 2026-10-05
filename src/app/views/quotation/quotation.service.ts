import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_END_POINT } from 'src/app/shared/configs/api.config';
import { IResponseDto } from 'src/app/shared/model/common/response.model';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';
import { IQuotationDetailDto } from 'src/app/shared/model/quotation/quotation-detail.model';
import { IProductListDto } from 'src/app/shared/model/profile/productList.model';
import { ISubQuotationDetailDto } from 'src/app/shared/model/quotation/sub-quotation-detail.model';
import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ISubQuotation } from 'src/app/shared/model/quotation/sub-quotation.model';
import { IOpenDirectionDrpDto } from 'src/app/shared/model/quotation/open-directionDrp.model';
import Konva from 'konva';
import { IResponseDtoOfProduct } from './sub-quotation/sub-quotation-design/response.model';
import { quiet } from 'src/app/shared/interceptors/request-options';
import { DownloadedFile, downloadedFile } from 'src/app/shared/class/download-file';

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

  /**
   * Prices a window (is_saved false) or saves it. The designer passes
   * quiet('loader') for a price: the global overlay would cover the screen
   * and take the click on Save made while the price is on its way.
   */
  public quotationManageProduct(
    data: any,
    options?: { context: HttpContext }
  ): Observable<IResponseDto<ISubQuotationDetailDto>> {
    return this._apiHttpService.post(
      API_END_POINT.quatation.manageProduct,
      data,
      options
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

  /** Flow additions (cards U3 and U4). */

  /** Every quotation, billed ones included, each with its status and total. */
  public getAllQuotations(): Observable<IResponseDto<any[]>> {
    return this._apiHttpService.get(`${API_END_POINT.quatation.list}?status=all`);
  }

  /** Quotations per status: { all, draft, sent, accepted, declined, expired, billed }. */
  public getStatusCounts(): Observable<IResponseDto<Record<string, number>>> {
    return this._apiHttpService.get(API_END_POINT.quatation.statusCounts);
  }

  /** status: draft, sent, accepted or declined. Billed is set by creating a bill. */
  public setQuotationStatus(
    id: number,
    status: string,
    validUntil?: string
  ): Observable<IResponseDto<any>> {
    const body: any = { status };
    if (validUntil) {
      body.valid_until = validUntil;
    }
    return this._apiHttpService.post(`${API_END_POINT.quatation.status}/${id}`, body);
  }

  /** Margin, payment terms, discount, validity and GST settings of a quotation. */
  public updateQuotationSummary(
    id: number,
    data: any
  ): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.summary}/${id}`, data);
  }

  /** Label ("Master bedroom") and HSN code of one window. */
  public updateLineDetails(
    lineId: number,
    data: { label?: string; hsn_code?: string }
  ): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.lineDetails}/${lineId}`, data);
  }

  /** Customers for the picker in the new-quotation dialog. */
  public getCustomerOptions(): Observable<IResponseDto<any[]>> {
    return this._apiHttpService.get(API_END_POINT.customer.list);
  }

  /** A customer made inline from the new-quotation dialog: name and phone only. */
  public addCustomerInline(data: {
    name: string;
    phone: string;
  }): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(API_END_POINT.customer.add, data);
  }

  /**
   * Quotation page (card U4). The page draws its own skeleton, busy buttons
   * and inline errors, so these requests are quiet: no global overlay and no
   * global error toast.
   */

  /** The quotation with its lines, totals, bill link and revisions. */
  public getQuotation(id: number): Observable<IResponseDto<any>> {
    return this._apiHttpService.get(`${API_END_POINT.quatation.show}/${id}`, quiet());
  }

  /** Price lists for the Summary card. */
  public getMarginOptions(): Observable<IResponseDto<any[]>> {
    return this._apiHttpService.get(API_END_POINT.type_margin.list, quiet());
  }

  /** Payment terms for the Summary card. */
  public getPaymentTermOptions(): Observable<IResponseDto<any[]>> {
    return this._apiHttpService.get(API_END_POINT.paymentType.list, quiet());
  }

  /** The GST states, for the "Place of supply" list: the same list the API decides the tax split with. */
  public getGstStates(): Observable<IResponseDto<{ code: string; name: string }[]>> {
    return this._apiHttpService.get('gst/states', quiet());
  }

  /** Customers for the picker in "Duplicate". */
  public getCustomerChoices(): Observable<IResponseDto<any[]>> {
    return this._apiHttpService.get(API_END_POINT.customer.list, quiet());
  }

  /** The bill made from a quotation, as a PDF file. */
  public getBillPdf(billId: number): Observable<DownloadedFile> {
    return this.http
      .post(
        `${environment.API_URL}/${API_END_POINT.bills.pdf}`,
        { bill_id: billId, download: 1 },
        { responseType: 'blob', observe: 'response', context: quiet().context }
      )
      .pipe(map(downloadedFile));
  }

  public saveQuotationSummary(id: number, data: any): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.summary}/${id}`, data, quiet());
  }

  /** status: draft, sent, accepted or declined. */
  public changeQuotationStatus(id: number, status: string): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.status}/${id}`, { status }, quiet());
  }

  /** A new draft with a new number at today's prices. data: customer_id, quatation_name (both optional). */
  public copyQuotation(id: number, data: any): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.copy}/${id}`, data, quiet());
  }

  /** One window again in the same quotation, at the same price. */
  public duplicateLine(lineId: number): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.lineDuplicate}/${lineId}`, {}, quiet());
  }

  /**
   * The order of the windows on the page, the PDF and the bill. `order` is
   * every line id of the quotation, once each, in the order wanted.
   */
  public reorderLines(id: number, order: number[]): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.reorder}/${id}`, { order }, quiet());
  }

  public renameLine(lineId: number, label: string): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.lineDetails}/${lineId}`, { label }, quiet());
  }

  public removeLine(lineId: number): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.deleteProduct}/${lineId}`, {}, quiet());
  }

  public removeQuotation(id: number): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.delete}/${id}`, {}, quiet());
  }

  /** Revision R1, R2 of a quotation that was sent. Returns the new draft. */
  public reviseQuotation(id: number): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.revise}/${id}`, {}, quiet());
  }

  /** data.channel: email, whatsapp or download. Any of them marks the quotation Sent. */
  public sendQuotation(id: number, data: any): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(`${API_END_POINT.quatation.send}/${id}`, data, quiet());
  }

  /** The bill copies the quotation's lines, discount and tax; nothing is asked. Returns the bill. */
  public createBill(quotationId: number): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(API_END_POINT.bills.converToBill, { quatation_id: quotationId }, quiet());
  }

  /** Prices the quotation's windows again at today's catalogue rates. */
  public updateQuotationPrices(id: number): Observable<IResponseDto<any>> {
    return this._apiHttpService.post(API_END_POINT.quatation.bulkpriceUpdate, { quatation_ids: [id] }, quiet());
  }

  /** The quotation document by id: the PDF file, as the customer receives it, with the api's file name. */
  public getQuotationPdf(id: number): Observable<DownloadedFile> {
    return this.http
      .post(
        `${environment.API_URL}/${API_END_POINT.quatation.pdf}`,
        { quatation_id: id, download: 1 },
        { responseType: 'blob', observe: 'response', context: quiet().context }
      )
      .pipe(map(downloadedFile));
  }

  /** The same document as a page, for the preview in "Send quotation". */
  public getQuotationPreview(id: number): Observable<string> {
    return this.http.post(
      `${environment.API_URL}/${API_END_POINT.quatation.pdf}`,
      { quatation_id: id },
      { responseType: 'text', context: quiet().context }
    );
  }
}
