import { Component } from '@angular/core';
import { fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, Subject } from 'rxjs';

import { AuthService } from './auth.service';
import { PAGE_SKELETON_DELAY_MS, RouteLoadingService } from './route-loading.service';

@Component({ template: '' })
class BlankComponent {}

describe('RouteLoadingService (card T138)', () => {
  let router: Router;
  let service: RouteLoadingService;
  let token: string | null;
  let guard$: Subject<boolean>;
  let data$: Subject<string>;

  beforeEach(() => {
    token = 'token';
    guard$ = new Subject<boolean>();
    data$ = new Subject<string>();
    TestBed.configureTestingModule({
      declarations: [BlankComponent],
      imports: [
        RouterTestingModule.withRoutes([
          { path: 'dashboard', component: BlankComponent, canActivate: [() => guard$] },
          { path: 'profile', component: BlankComponent, resolve: { data: () => data$ } },
          { path: 'quick', component: BlankComponent, resolve: { data: () => of('here') } },
          { path: 'guarded', component: BlankComponent, canActivate: [() => guard$] },
          { path: 'auth/login', component: BlankComponent, canActivate: [() => guard$] },
          { path: 'admin', component: BlankComponent, canActivate: [() => guard$] },
          { path: 'plain', component: BlankComponent },
        ]),
      ],
      providers: [{ provide: AuthService, useValue: { getToken: () => token } }],
    });
    router = TestBed.inject(Router);
    service = TestBed.inject(RouteLoadingService);
  });

  it('first screen of a signed-in user: the shell outline is drawn at once while the guards ask the api', fakeAsync(() => {
    router.navigateByUrl('/dashboard');
    tick();
    expect(service.state$.value).toBe('boot');
    expect(service.busy).withContext('the ring stays hidden').toBeTrue();

    guard$.next(true);
    guard$.complete();
    flush();
    expect(service.state$.value).toBe('none');
    expect(service.busy).toBeFalse();
  }));

  it('draws no outline for a visitor without a session, for sign-in or for the admin area', fakeAsync(() => {
    token = null;
    router.navigateByUrl('/dashboard');
    tick();
    expect(service.state$.value).withContext('no session').toBe('none');
    guard$.next(false);
    flush();

    token = 'token';
    for (const url of ['/auth/login', '/admin']) {
      router.navigateByUrl(url);
      tick();
      expect(service.state$.value).withContext(url).toBe('none');
      expect(service.busy).withContext(url).toBeFalse();
      guard$.next(false);
      flush();
    }
  }));

  it('inside the shell: a page whose resolver is slow is drawn as a skeleton, after a moment and until the answer', fakeAsync(() => {
    service.shellOnScreen = true;
    router.navigateByUrl('/profile');
    tick();
    expect(service.busy).withContext('the ring is hidden from the start').toBeTrue();
    expect(service.state$.value).withContext('not yet').toBe('none');

    tick(PAGE_SKELETON_DELAY_MS);
    expect(service.state$.value).toBe('page');

    data$.next('here');
    data$.complete();
    flush();
    expect(service.state$.value).toBe('none');
    expect(service.busy).toBeFalse();
  }));

  it('inside the shell: a page that answers at once shows no skeleton', fakeAsync(() => {
    service.shellOnScreen = true;
    const seen: string[] = [];
    service.state$.subscribe((state) => seen.push(state));
    router.navigateByUrl('/quick');
    flush();
    router.navigateByUrl('/plain');
    flush();
    expect(seen).toEqual(['none']);
    expect(service.busy).toBeFalse();
  }));

  it('inside the shell: nothing is drawn while a guard is still deciding (a "Discard your changes?" question)', fakeAsync(() => {
    service.shellOnScreen = true;
    router.navigateByUrl('/guarded');
    tick(PAGE_SKELETON_DELAY_MS * 3);
    expect(service.state$.value).toBe('none');
    expect(service.busy).toBeFalse();
    guard$.next(false);
    flush();
    expect(service.state$.value).toBe('none');
  }));

  it('a navigation that is refused or replaced ends the skeleton', fakeAsync(() => {
    router.navigateByUrl('/dashboard');
    tick();
    expect(service.state$.value).toBe('boot');
    guard$.next(false);
    flush();
    expect(service.state$.value).toBe('none');
    expect(service.busy).toBeFalse();
  }));
});
