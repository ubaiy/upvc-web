import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { MastersService } from './masters.service';
@Injectable({
  providedIn: 'root',
})
export class HardwareResolver implements Resolve<boolean> {
  constructor(private dataService: MastersService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    let query = {
      costhead: 'Hardware',
    };
    return this.dataService
      .getList(query)
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
