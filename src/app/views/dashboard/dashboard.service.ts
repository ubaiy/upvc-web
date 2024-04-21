import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { IResponseDto } from '../../shared/model/common/response.model';
import { API_END_POINT } from '../../shared/configs/api.config';
import { IDashboardModelDto } from '../../shared/model/dashboard.model';
@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  constructor(private _apiHttpService: ApiHttpService) {}

  public getDashboardData(): Observable<IResponseDto<IDashboardModelDto>> {
    return this._apiHttpService.get(API_END_POINT.home);
  }
}
