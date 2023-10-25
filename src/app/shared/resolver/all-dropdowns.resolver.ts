import { Injectable } from '@angular/core';
import {
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { DropdownService } from '../services/dropdown.service';
@Injectable({
  providedIn: 'root',
})
export class AllDropdownsResolver implements Resolve<boolean> {
  constructor(private dataService: DropdownService) {}
  resolve(): Observable<any> {
    return this.dataService
      .allDropDowns()
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
