import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { BillsService } from './bills.service';
@Injectable({
  providedIn: 'root',
})
export class BillsResolver implements Resolve<boolean> {
  constructor(private dataService: BillsService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    return this.dataService
      .getBillsList()
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
