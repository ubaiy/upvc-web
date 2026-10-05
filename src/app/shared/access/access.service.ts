import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, forkJoin, map, of, shareReplay, tap } from 'rxjs';

import { quiet } from '../interceptors/request-options';
import { ApiHttpService } from '../services/api-http.service';
import { AuthService } from '../services/auth.service';
import { AccessState, EMPTY_ACCESS, SubscriptionInfo, allows, has3d, isReadOnly } from './access.models';

/**
 * Who the signed-in user is (role, abilities) and what the company's plan allows.
 * GET me and GET subscription are asked once for a sign-in (kept with the token, so
 * the next person on this browser is asked again) and again on demand: after a 402,
 * and after the Team page changed the seats.
 */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly subject = new BehaviorSubject<AccessState>(EMPTY_ACCESS);
  /** What is known now. Empty until the first answer: nothing is hidden before it. */
  readonly state$ = this.subject.asObservable();

  private loadedFor: string | null = null;
  private pending?: Observable<AccessState>;

  constructor(private api: ApiHttpService, private auth: AuthService) {}

  get state(): AccessState {
    return this.subject.value;
  }

  can(ability: string | null | undefined): boolean {
    return allows(this.state, ability);
  }

  get has3d(): boolean {
    return has3d(this.state);
  }

  get readOnly(): boolean {
    return isReadOnly(this.state);
  }

  /** The answer for this sign-in; asked once, shared by the guards and the shell. */
  load(): Observable<AccessState> {
    const token = this.auth.getToken() || null;
    if (!token) {
      this.forget();
      return of(EMPTY_ACCESS);
    }
    if (this.loadedFor === token) {
      return this.pending ?? of(this.state);
    }
    this.loadedFor = token;
    this.subject.next(EMPTY_ACCESS);
    this.pending = forkJoin({
      me: this.api.get('me', quiet()).pipe(
        map((res: any) => res?.data ?? null),
        // Not known (no connection, or the platform admin, who has no company): nothing is hidden.
        catchError(() => of(null))
      ),
      subscription: this.fetchSubscription(),
    }).pipe(
      tap((state) => {
        // A sign-out and a new sign-in while the answer was on its way: the answer is not theirs.
        if (this.loadedFor === token) {
          this.subject.next(state);
          this.pending = undefined;
          // A failed answer is asked again by the next page.
          if (!state.me) {
            this.loadedFor = null;
          }
        }
      }),
      shareReplay(1)
    );
    return this.pending;
  }

  /** After a 402, a payment or a change of the team: the plan and the seats as they are now. */
  refreshSubscription(): void {
    if (!this.auth.getToken()) {
      return;
    }
    this.fetchSubscription().subscribe((subscription) => {
      if (subscription) {
        this.subject.next({ ...this.state, subscription });
      }
    });
  }

  forget(): void {
    this.loadedFor = null;
    this.pending = undefined;
    if (this.subject.value !== EMPTY_ACCESS) {
      this.subject.next(EMPTY_ACCESS);
    }
  }

  private fetchSubscription(): Observable<SubscriptionInfo | null> {
    return this.api.get('subscription', quiet()).pipe(
      map((res: any) => (res?.data && res.data.status ? (res.data as SubscriptionInfo) : null)),
      catchError(() => of(null))
    );
  }
}
