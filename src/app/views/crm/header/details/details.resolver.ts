import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { HeaderService } from '../header.service';
@Injectable({
  providedIn: 'root',
})
export class DetailsResolver implements Resolve<boolean> {
  constructor(private dataService: HeaderService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    let id = route.params['id'];
    return this.dataService
      .getHeaderDetail(id)
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
