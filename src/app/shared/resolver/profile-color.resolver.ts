import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { ProfileColorService } from '../../views/masters/profile-color/profile-color.service';
@Injectable({
  providedIn: 'root',
})
export class ProfileColorResolver implements Resolve<boolean> {
  constructor(private dataService: ProfileColorService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    return this.dataService
      .getDropdown()
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
