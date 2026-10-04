import { Injectable } from '@angular/core';
import { Resolve } from '@angular/router';
import { Observable, of } from 'rxjs';

/**
 * Kept because the route in app-routing.module.ts (card U0) names it.
 *
 * It used to fetch the user before the page opened, so a failed request left
 * a blank screen. Each Settings tab now loads its own data and shows a
 * skeleton, then an inline error with "Try again"; nothing is resolved here.
 */
@Injectable({
  providedIn: 'root',
})
export class ProfileResolver implements Resolve<null> {
  resolve(): Observable<null> {
    return of(null);
  }
}
