import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { ProfileService } from 'src/app/views/masters/profile/profile.service';
@Injectable({
  providedIn: 'root',
})
export class MullionResolver implements Resolve<boolean> {
  constructor(private dataService: ProfileService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    let query = {
      category_name: '',
      track: '',
      sub_category_name: 'Mullion',
      casement_type: '',
      product_type: '',
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
