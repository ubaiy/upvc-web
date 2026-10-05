import { Injectable, Injector } from '@angular/core';
import { BehaviorSubject, Observable, catchError, forkJoin, map, of, shareReplay, tap } from 'rxjs';

import { quiet } from '../interceptors/request-options';
import { ApiHttpService } from '../services/api-http.service';
import { AuthService } from '../services/auth.service';
import { AccessState, EMPTY_ACCESS, SubscriptionInfo, WriteGate, allows, gateMenu, has3d, isReadOnly, seesAmounts, writeGate } from './access.models';

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

  private _api?: ApiHttpService;
  private _auth?: AuthService;

  // A screen that only reads what is known (a button, a menu) needs no http: where there
  // is none (a spec of such a screen) the two services are simply not there.
  constructor(private injector: Injector) {
    try {
      this._api = injector.get(ApiHttpService);
      this._auth = injector.get(AuthService);
    } catch {
      // asked for again when first used
    }
  }

  private get api(): ApiHttpService {
    return (this._api ??= this.injector.get(ApiHttpService));
  }

  private get auth(): AuthService {
    return (this._auth ??= this.injector.get(AuthService));
  }

  get state(): AccessState {
    return this.subject.value;
  }

  can(ability: string | null | undefined): boolean {
    return allows(this.state, ability);
  }

  get has3d(): boolean {
    return has3d(this.state);
  }

  /** Selling amounts (totals, balance) are for a role that can open quotations or payments; not for the workshop. */
  get seesAmounts(): boolean {
    return seesAmounts(this.state);
  }

  get readOnly(): boolean {
    return isReadOnly(this.state);
  }

  /** May this user press a button that needs the ability, now? Not for a role without it, not in a read-only account. */
  canWrite(ability: string | null | undefined): boolean {
    const gate = this.gate(ability);
    return !gate.hidden && !gate.locked;
  }

  gate(ability: string | null | undefined): WriteGate {
    return writeGate(this.state, ability);
  }

  /** A menu without the entries the role may not use; in a read-only account the writing ones are off. */
  menu<T extends { disabled?: boolean; title?: string; separator?: boolean }>(items: T[], abilityOf: (item: T) => string | null | undefined): T[] {
    return gateMenu(this.state, items, abilityOf);
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
