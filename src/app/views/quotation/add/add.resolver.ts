import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { QuotationService } from '../quotation.service';
@Injectable({
  providedIn: 'root',
})
export class AddResolver implements Resolve<boolean> {
  constructor(private dataService: QuotationService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    let id = route.params['id'];
    return this.dataService
      .getQuotationDetail(id)
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
