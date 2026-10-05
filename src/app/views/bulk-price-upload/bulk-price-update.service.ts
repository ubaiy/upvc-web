import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DownloadedFile, fileNameFromHeader } from 'src/app/shared/class/download-file';
import { API_END_POINT } from 'src/app/shared/configs/api.config';
import { quiet } from 'src/app/shared/interceptors/request-options';
import { IResponseDto } from 'src/app/shared/model/common/response.model';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';

/** One rate the uploaded file would change (phase 30 log, section 9). */
export interface PriceChange {
  sheet: string;
  row: number;
  code: string;
  name: string;
  /** "Rate per metre": the column of the file. */
  column: string;
  from: number | null;
  to: number | null;
}

/** What `price-sheet/upload` answers: a preview, or the result of applying the file. */
export interface PriceUpload {
  saved: boolean;
  /** The api's own sentence: "Rates previewed, nothing saved.", "The file has rows to correct. Nothing was saved." */
  message: string;
  summary: { rowsRead: number; ratesChanged: number; profilesChanged: number; itemsChanged: number; errors: number };
  changes: PriceChange[];
  /** Rows the api could not read. While there is one, nothing is saved. */
  errors: { sheet: string; row: number; message: string }[];
}

const amount = (value: unknown): number | null => (value === null || value === undefined || value === '' ? null : Number(value));

export function toPriceUpload(res: any): PriceUpload {
  const data = res?.data ?? {};
  const summary = data.summary ?? {};
  return {
    saved: !!data.saved,
    message: typeof res?.message === 'string' ? res.message : '',
    summary: {
      rowsRead: Number(summary.rows_read) || 0,
      ratesChanged: Number(summary.rates_changed) || 0,
      profilesChanged: Number(summary.profiles_changed) || 0,
      itemsChanged: Number(summary.items_changed) || 0,
      errors: Number(summary.errors) || 0,
    },
    changes: (Array.isArray(data.changes) ? data.changes : []).map((row: any) => ({
      sheet: String(row?.sheet ?? ''),
      row: Number(row?.row) || 0,
      code: String(row?.code ?? ''),
      name: String(row?.name ?? ''),
      column: String(row?.column ?? row?.field ?? ''),
      from: amount(row?.from),
      to: amount(row?.to),
    })),
    errors: (Array.isArray(data.errors) ? data.errors : []).map((row: any) => ({
      sheet: String(row?.sheet ?? ''),
      row: Number(row?.row) || 0,
      message: String(row?.message ?? ''),
    })),
  };
}

@Injectable({
  providedIn: 'root',
})
export class BulkPriceUpdateService {
  constructor(private _apiHttpService: ApiHttpService, private _http: HttpClient) {}

  public getBulkPrice(): Observable<IResponseDto<any>> {
    return this._apiHttpService.get(API_END_POINT.bulkPriceUpdate.get);
  }

  /** The catalogue's rates as an Excel file: sheets "Profiles" and "Glass and hardware". */
  public downloadSheet(): Observable<DownloadedFile> {
    return this._http
      .get(`${this._apiHttpService.REST_API_SERVER}/${API_END_POINT.priceSheet.download}`, { responseType: 'blob', observe: 'response', ...quiet() })
      .pipe(
        map((response) => ({
          blob: response.body as Blob,
          fileName: fileNameFromHeader(response.headers.get('Content-Disposition')),
        }))
      );
  }

  /**
   * Sends the edited file. With `apply` false the api only says what would
   * change; with true it saves, unless a row cannot be read. A file that is
   * not the price list is refused (`status: 0`) and thrown with the api's words.
   */
  public uploadSheet(file: File, apply: boolean): Observable<PriceUpload> {
    const body = new FormData();
    body.append('file', file);
    body.append('dry_run', apply ? '0' : '1');
    return this._apiHttpService.post(API_END_POINT.priceSheet.upload, body, quiet()).pipe(
      map((res: any) => {
        if (!res || res.success !== true) {
          throw new Error(res?.data?.errors?.file || res?.message || 'The file could not be read.');
        }
        return toPriceUpload(res);
      })
    );
  }
}
