import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap, throwError } from 'rxjs';

import { quiet } from '../../shared/interceptors/request-options';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { fileNameFromHeader, toJobResult } from './production.adapter';
import { DocumentFile, DocumentFormat, DocumentType, JobResult } from './production.model';

const MIME: Record<DocumentFormat, string> = {
  pdf: 'application/pdf',
  html: 'text/html;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * The production job of a quotation and its workshop documents
 * (api cards P0 to P4). Every call is quiet: the page draws its own
 * skeleton and its own errors.
 */
@Injectable({ providedIn: 'root' })
export class ProductionService {
  constructor(private api: ApiHttpService, private http: HttpClient) {}

  /** The newest job, or an older revision. */
  getJob(quotationId: number | string, revision?: number): Observable<JobResult> {
    const query = revision ? `?revision=${revision}` : '';
    return this.api.get(`production/job/${quotationId}${query}`, quiet()).pipe(map(toJobResult));
  }

  /**
   * Freezes the quotation as a production job. An existing job comes back
   * unchanged unless `refresh` is set, which makes a new revision; older
   * revisions stay printable.
   */
  freeze(quotationId: number | string, refresh = false): Observable<JobResult> {
    return this.api
      .post(`production/job/${quotationId}`, refresh ? { refresh: true } : {}, quiet())
      .pipe(map(toJobResult));
  }

  /**
   * One document of one revision. The api answers a refusal as JSON with
   * HTTP 200, so a JSON body here is an error with the api's message.
   */
  getDocument(
    quotationId: number | string,
    type: DocumentType | 'pack',
    format: DocumentFormat,
    revision: number,
    download = false
  ): Observable<DocumentFile> {
    let params = new HttpParams().set('format', format).set('revision', String(revision));
    if (download) {
      params = params.set('download', '1');
    }
    return this.http
      .get(`${this.api.REST_API_SERVER}/production/document/${quotationId}/${type}`, {
        params,
        responseType: 'blob',
        observe: 'response',
        ...quiet(),
      })
      .pipe(switchMap((response) => this.toFile(response, format)));
  }

  private toFile(response: HttpResponse<Blob>, format: DocumentFormat): Observable<DocumentFile> {
    const body = response.body;
    if (!body || !body.size) {
      return throwError(() => new Error('The document came back empty.'));
    }
    if (/json/i.test(body.type)) {
      return from(body.text()).pipe(
        switchMap((text) => {
          let message = 'The document could not be made.';
          try {
            message = JSON.parse(text)?.message || message;
          } catch {
            // keep the general message
          }
          return throwError(() => new Error(message));
        })
      );
    }
    // The type is set here so a saved or shared file opens in the right app.
    return of({
      blob: new Blob([body], { type: MIME[format] }),
      fileName: fileNameFromHeader(response.headers.get('Content-Disposition')),
    });
  }
}
