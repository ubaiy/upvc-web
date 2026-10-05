import { Injectable, OnDestroy } from '@angular/core';
import { Event, NavigationCancel, NavigationEnd, NavigationError, NavigationStart, ResolveStart, Router } from '@angular/router';
import { BehaviorSubject, Subscription } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * What the app draws while the router is still waiting for a route:
 *   'boot'  no shell is on screen yet (the first address after opening the app or after sign-in) and the
 *           guards are asking GET me / GET subscription: AppComponent draws the shell's outline and a page skeleton;
 *   'page'  the shell is on screen and the new page's resolver is asking the api: the shell draws the
 *           page skeleton in place of the page being left;
 *   'none'  the routed screen itself.
 */
export type RouteLoadingState = 'none' | 'boot' | 'page';

/** A page that answers within this time is shown with no skeleton in between. */
export const PAGE_SKELETON_DELAY_MS = 120;

/** Addresses outside the shell: sign-in, the platform admin's area, the error pages, the development pages. */
const OUTSIDE_SHELL = /^\/(auth|admin|404|500|ui|design-lab)(\/|\?|#|$)/;

/**
 * Loading of a route, one way for the whole app (card T138). While `busy` is true the app's ring and
 * bar stay hidden: the skeleton is the loading sign, and there is never a second one over it.
 */
@Injectable({ providedIn: 'root' })
export class RouteLoadingService implements OnDestroy {
  readonly state$ = new BehaviorSubject<RouteLoadingState>('none');
  /** A route is being waited for (set at once; the page skeleton itself appears a moment later). */
  busy = false;
  /** Set by ShellComponent while it is on screen. */
  shellOnScreen = false;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly sub: Subscription;

  constructor(router: Router, private auth: AuthService) {
    this.sub = router.events.subscribe((event) => this.on(event));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.clear();
  }

  private on(event: Event): void {
    if (event instanceof NavigationStart) {
      this.clear();
      if (!this.shellOnScreen && !!this.auth.getToken() && !OUTSIDE_SHELL.test(event.url)) {
        this.busy = true;
        this.state$.next('boot');
      }
    } else if (event instanceof ResolveStart) {
      // After the guards: a "Discard your changes?" question never has a skeleton behind it.
      if (this.shellOnScreen && this.state$.value === 'none') {
        this.busy = true;
        this.timer = setTimeout(() => this.state$.next('page'), PAGE_SKELETON_DELAY_MS);
      }
    } else if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
      this.clear();
    }
  }

  private clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.busy = false;
    if (this.state$.value !== 'none') {
      this.state$.next('none');
    }
  }
}
