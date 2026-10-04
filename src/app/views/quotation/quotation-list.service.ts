import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { API_END_POINT } from 'src/app/shared/configs/api.config';
import { quiet } from 'src/app/shared/interceptors/request-options';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';
import { QuotationRow, QuotationRowStatus, toQuotationRow } from './quotation-list.model';

export interface QuotationListQuery {
  /** 'all' or one status: the tab that is open. */
  status: 'all' | QuotationRowStatus;
  search: string;
  /** 1 is the first page, as the API counts. */
  page: number;
  perPage: number;
}

export interface QuotationPage {
  rows: QuotationRow[];
  /** Quotations that match the tab and the search, on every page. */
  total: number;
  lastPage: number;
}

/**
 * The quotation list, one page at a time (card T76; contract in
 * docs/review/phase-17-screen-api-gaps-log.md section 1). The API searches,
 * filters by status and pages; rows arrive newest first. The list draws its
 * own skeleton and inline error, so the requests are quiet.
 */
@Injectable({ providedIn: 'root' })
export class QuotationListService {
  constructor(private api: ApiHttpService) {}

  page(query: QuotationListQuery): Observable<QuotationPage> {
    const params = new URLSearchParams({ status: query.status, page: String(query.page), per_page: String(query.perPage) });
    const search = query.search.trim();
    if (search) {
      params.set('search', search);
    }
    return this.api.get(`${API_END_POINT.quatation.list}?${params.toString()}`, quiet()).pipe(
      map((res: any) => {
        if (!res?.success || !Array.isArray(res.data)) {
          throw new Error(res?.message || 'The list could not be loaded.');
        }
        const rows = res.data.filter((raw: any) => !!raw).map(toQuotationRow);
        const total = Number(res.meta?.total ?? rows.length);
        return { rows, total, lastPage: Number(res.meta?.last_page ?? 1) };
      })
    );
  }

  /** Quotations per status for the tabs: { all, draft, sent, accepted, declined, expired, billed }. */
  counts(): Observable<Record<string, number>> {
    return this.api.get('quatation/status-counts', quiet()).pipe(
      map((res: any) => {
        if (!res?.success || !res.data) {
          throw new Error(res?.message || 'The counts could not be loaded.');
        }
        return res.data as Record<string, number>;
      })
    );
  }
}
