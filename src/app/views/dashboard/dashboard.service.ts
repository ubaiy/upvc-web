import { Injectable } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { IResponseDto } from '../../shared/model/common/response.model';
import { API_END_POINT } from '../../shared/configs/api.config';
import { IDashboardModelDto } from '../../shared/model/dashboard.model';
import { HomeQuotationRow, HomeView, buildHomeView } from './home-data';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  constructor(private _apiHttpService: ApiHttpService) {}

  public getDashboardData(): Observable<IResponseDto<IDashboardModelDto>> {
    return this._apiHttpService.get(API_END_POINT.home);
  }

  /** Every quotation, billed ones included. An API without status ignores the filter and sends the open ones. */
  public getQuotations(): Observable<IResponseDto<HomeQuotationRow[]>> {
    return this._apiHttpService.get(`${API_END_POINT.quatation.list}?status=all`);
  }

  /** Everything the Home screen shows, in two requests. */
  public getHome(today: Date = new Date()): Observable<HomeView> {
    return forkJoin([this.getDashboardData(), this.getQuotations()]).pipe(
      map(([figures, quotations]) => {
        if (!figures?.success || !quotations?.success) {
          throw new Error(figures?.message || quotations?.message || 'Home could not be loaded');
        }
        return buildHomeView(figures.data, quotations.data, today);
      })
    );
  }
}
