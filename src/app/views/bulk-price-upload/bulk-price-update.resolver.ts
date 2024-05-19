import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { BulkPriceUpdateService } from './bulk-price-update.service';
@Injectable({
  providedIn: 'root',
})
export class BulkPriceUpdateResolver implements Resolve<boolean> {
  constructor(private _dataService: BulkPriceUpdateService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    return this._dataService
      .getBulkPrice()
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
