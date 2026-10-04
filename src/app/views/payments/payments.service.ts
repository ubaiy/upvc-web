import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';

import { quiet } from '../../shared/interceptors/request-options';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { Result, text, toResult } from './api-result';
import { DocumentFile, DocumentFormat, readDocument } from './document-file';
import { scopeQuery, toOutstanding, toPaymentList, toSavedPayment } from './payments.adapter';
import { Account, NewPayment, Outstanding, OutstandingBasis, Payment, PaymentList, PaymentScope } from './payments.model';

export type SavedPayment = { payment: Payment; account: Account | null };

/**
 * Payments against an order or a bill (api card PAY1). Every call is quiet:
 * the screens draw their own skeletons and their own errors.
 */
@Injectable({ providedIn: 'root' })
export class PaymentsService {
  constructor(private api: ApiHttpService, private http: HttpClient) {}

  /** Payments of one order, one bill, one customer, or all. Cancelled entries stay listed, marked. */
  list(scope: PaymentScope = {}): Observable<Result<PaymentList>> {
    return this.api
      .get('payment/list' + scopeQuery(scope), quiet())
      .pipe(map((res) => toResult(res, toPaymentList, 'The payments could not be loaded.')));
  }

  /** Records a receipt or a refund. A refusal carries the api's reason. */
  add(payment: NewPayment): Observable<Result<SavedPayment>> {
    return this.api
      .post('payment/add', payment, quiet())
      .pipe(map((res) => toResult(res, toSavedPayment, 'The payment could not be saved.')));
  }

  /** Cancels a wrong entry. It keeps its number and stays listed, marked cancelled. */
  cancel(id: number, reason: string): Observable<Result<SavedPayment>> {
    return this.api
      .post(`payment/cancel/${id}`, reason ? { reason } : {}, quiet())
      .pipe(map((res) => toResult(res, toSavedPayment, 'The entry could not be cancelled.')));
  }

  outstanding(basis: OutstandingBasis = 'all'): Observable<Result<Outstanding>> {
    const query = basis === 'all' ? '' : `?basis=${basis}`;
    return this.api
      .get('payment/outstanding' + query, quiet())
      .pipe(map((res) => toResult(res, toOutstanding, 'The outstanding list could not be loaded.')));
  }

  /** The receipt, or the refund voucher: the api's page for a preview, or its PDF. */
  receipt(id: number, format: DocumentFormat, download = false): Observable<DocumentFile> {
    let params = new HttpParams().set('format', format);
    if (download) {
      params = params.set('download', '1');
    }
    return this.http
      .get(`${this.api.REST_API_SERVER}/payment/receipt/${id}`, {
        params,
        responseType: 'blob',
        observe: 'response',
        ...quiet(),
      })
      .pipe(switchMap((response) => readDocument(response, format)));
  }

  /** The company's name for the reminder text. The reminder still works without it. */
  companyName(): Observable<string> {
    return this.api.get('company/settings', quiet()).pipe(
      map((res) => text(res?.data?.company?.name || res?.data?.name || res?.data?.company_name)),
      catchError(() => of(''))
    );
  }
}
