import { ResolveFn } from '@angular/router';

export const ventilationTypeResolver: ResolveFn<boolean> = (route, state) => {
  return true;
};
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
export class VentilationTypeResolver implements Resolve<boolean> {
  constructor(private dataService: DropdownService) {}
  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<any> {
    let query = {
      costhead: 'Ventilation',
      type: '',
      category: '',
      search: '',
    };
    return this.dataService
      .getCostHeadDataDropdown(query)
      .pipe(
        switchMap((res) =>
          res.success ? of(res.data) : throwError(res.message)
        )
      );
  }
}
