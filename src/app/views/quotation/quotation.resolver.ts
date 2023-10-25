import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { QuotationService } from './quotation.service';
@Injectable({
  providedIn: 'root',
})
export class QuotationResolver implements Resolve<boolean> {
  constructor(private _dataService: QuotationService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    return this._dataService
      .getQuotationList()
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
