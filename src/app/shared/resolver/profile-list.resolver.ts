import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { ProfileService } from '../../views/masters/profile/profile.service';
@Injectable({
  providedIn: 'root',
})
export class ProfileListResolver implements Resolve<boolean> {
  constructor(private dataService: ProfileService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    let query = {
      category_name: 'Casement',
      track: '',
      sub_category_name: 'Frame',
      casement_type: 'Fixed',
      product_type: 'Window',
    };
    return this.dataService
      .productDropdown(query)
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
