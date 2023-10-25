import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { PaymentTermsService } from './payment-terms.service';
@Injectable({
  providedIn: 'root',
})
export class PaymentTermsResolver implements Resolve<boolean> {
  constructor(private dataService: PaymentTermsService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    return this.dataService
      .getPaymentTypeList()
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
