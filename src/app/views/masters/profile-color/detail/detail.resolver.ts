import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { ProfileColorService } from '../profile-color.service';
@Injectable({
  providedIn: 'root',
})
export class DetailResolver implements Resolve<boolean> {
  constructor(private dataService: ProfileColorService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    let id = route.params['id'];
    return this.dataService
      .getDetails(id)
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
