import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { CustomerService } from '../customer.service';
@Injectable({
  providedIn: 'root',
})
export class DetailResolver implements Resolve<boolean> {
  constructor(private dataService: CustomerService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    let id = route.params['id'];
    return this.dataService
      .getCustomerDetail(id)
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
