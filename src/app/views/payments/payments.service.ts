import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, from, map, of, switchMap } from 'rxjs';

import { quiet } from '../../shared/interceptors/request-options';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { Result, text, toResult } from './api-result';
import { DocumentFile, DocumentFormat, fileNameFromHeader, readDocument } from './document-file';
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

  /**
   * The register as an Excel file, with the filters on screen: sheets
   * Payments, By day and By mode. A refusal comes back as JSON and is thrown
   * with the api's words.
   */
  exportExcel(scope: PaymentScope = {}): Observable<DocumentFile> {
    return this.http
      .get(`${this.api.REST_API_SERVER}/payment/export${scopeQuery(scope)}`, { responseType: 'blob', observe: 'response', ...quiet() })
      .pipe(
        switchMap((response) => {
          const body = response.body;
          if (!body || !body.size) {
            throw new Error('The file came back empty.');
          }
          if (/json/i.test(body.type)) {
            return from(body.text()).pipe(
              map((raw) => {
                let message = 'The file could not be made.';
                try {
                  message = JSON.parse(raw)?.message || message;
                } catch {
                  // keep the general message
                }
                throw new Error(message);
              })
            );
          }
          return of({
            blob: new Blob([body], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            fileName: fileNameFromHeader(response.headers.get('Content-Disposition')),
          });
        })
      );
  }

  /** Id and name of every customer, for the register's filter. An empty list when it cannot be read. */
  customers(): Observable<{ id: number; name: string }[]> {
    return this.api.get('customer/list', quiet()).pipe(
      map((res) =>
        (Array.isArray(res?.data) ? res.data : [])
          .map((row: any) => ({ id: Number(row?.id), name: text(row?.name) }))
          .filter((row: { id: number; name: string }) => row.id > 0 && row.name)
          .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
      ),
      catchError(() => of([]))
    );
  }

  /** The company's name for the reminder text. The reminder still works without it. */
  companyName(): Observable<string> {
    return this.api.get('company/settings', quiet()).pipe(
      map((res) => text(res?.data?.company?.name || res?.data?.name || res?.data?.company_name)),
      catchError(() => of(''))
    );
  }
}
