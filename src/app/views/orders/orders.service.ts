import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';

import { quiet } from '../../shared/interceptors/request-options';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { Result, toResult } from '../payments/api-result';
import { DocumentFile, DocumentFormat, readDocument } from '../payments/document-file';
import { toCounts, toOrderPage, toOrders } from './orders.adapter';
import { NewOrder, Order, OrderPage, OrderUpdate, StageCounts, StageKey } from './orders.model';

/**
 * Orders: the job after the quotation (api card O1). Every call is quiet:
 * the screens draw their own skeletons and their own errors.
 */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  constructor(private api: ApiHttpService, private http: HttpClient) {}

  /** Every order, cancelled ones included, newest first. The tabs and the board filter it in the browser. */
  list(): Observable<Result<Order[]>> {
    return this.api
      .get('order/list?stage=all', quiet())
      .pipe(map((res) => toResult(res, toOrders, 'The orders could not be loaded.')));
  }

  /** The orders of one quotation, cancelled ones included. */
  forQuotation(quotationId: number): Observable<Result<Order[]>> {
    return this.api
      .get(`order/list?stage=all&quatation_id=${quotationId}`, quiet())
      .pipe(map((res) => toResult(res, toOrders, 'The orders could not be loaded.')));
  }

  /**
   * The advance a payment term asks for, as a percentage: the term's own
   * field, else what the api reads in its wording. Null when it has none.
   */
  termAdvancePercent(termId: number): Observable<number | null> {
    return this.api.get('payment-term/list', quiet()).pipe(
      map((res: any) => {
        const term = (Array.isArray(res?.data) ? res.data : []).find((row: any) => Number(row?.id) === termId);
        const percent = term?.advance_percent ?? term?.advance_percent_in_use;
        return percent === null || percent === undefined || !Number.isFinite(Number(percent)) ? null : Number(percent);
      })
    );
  }

  counts(): Observable<Result<StageCounts>> {
    return this.api
      .get('order/stage-counts', quiet())
      .pipe(map((res) => toResult(res, toCounts, 'The counts could not be loaded.')));
  }

  show(id: number | string): Observable<Result<OrderPage>> {
    return this.api.get(`order/show/${id}`, quiet()).pipe(map((res) => this.page(res, 'The order could not be loaded.')));
  }

  /** Makes the order from an accepted quotation. A refusal for an existing order carries `data.order_id`. */
  create(order: NewOrder): Observable<Result<OrderPage>> {
    return this.api.post('order/create', order, quiet()).pipe(map((res) => this.page(res, 'The order could not be made.')));
  }

  /** Promised date, vehicle, transporter, note. Only what is sent changes; a blank clears. */
  update(id: number, changes: OrderUpdate): Observable<Result<OrderPage>> {
    return this.api
      .post(`order/update/${id}`, changes, quiet())
      .pipe(map((res) => this.page(res, 'The order could not be saved.')));
  }

  /** Moves the order to a stage: forward for the next step, backward to undo a wrong tap. */
  setStage(id: number, stage: StageKey): Observable<Result<OrderPage>> {
    return this.api
      .post(`order/stage/${id}`, { stage }, quiet())
      .pipe(map((res) => this.page(res, 'The stage could not be changed.')));
  }

  cancel(id: number, reason: string): Observable<Result<OrderPage>> {
    return this.api
      .post(`order/cancel/${id}`, reason ? { reason } : {}, quiet())
      .pipe(map((res) => this.page(res, 'The order could not be cancelled.')));
  }

  /** The delivery challan: the api's page for a preview, or its PDF. */
  challan(id: number, format: DocumentFormat, download = false): Observable<DocumentFile> {
    let params = new HttpParams().set('format', format);
    if (download) {
      params = params.set('download', '1');
    }
    return this.http
      .get(`${this.api.REST_API_SERVER}/order/challan/${id}`, {
        params,
        responseType: 'blob',
        observe: 'response',
        ...quiet(),
      })
      .pipe(switchMap((response) => readDocument(response, format)));
  }

  /** Name, customer, status and total of a quotation, for the "Create order" page. */
  quotation(id: number): Observable<Result<any>> {
    return this.api
      .get(`quatation/show/${id}`, quiet())
      .pipe(map((res) => toResult(res, (data) => data, 'The quotation could not be loaded.')));
  }

  private page(res: any, fallback: string): Result<OrderPage> {
    return toResult(res, toOrderPage, fallback);
  }
}
