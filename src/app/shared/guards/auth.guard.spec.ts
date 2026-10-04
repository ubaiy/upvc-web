import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot } from '@angular/router';

import { ApiHttpService } from '../services/api-http.service';
import { AuthService } from '../services/auth.service';
import { LocalStoreService } from '../services/local-storage.service';
import { AuthGuard } from './auth.guard';

describe('return to the page after signing in', () => {
  let guard: AuthGuard;
  let auth: AuthService;
  let token: string | null;
  const router = { url: '/', navigate: jasmine.createSpy('navigate') };
  const state = (url: string) => ({ url } as RouterStateSnapshot);

  beforeEach(() => {
    token = null;
    router.url = '/';
    router.navigate.calls.reset();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: ApiHttpService, useValue: { post: () => ({ subscribe: () => undefined }) } },
        {
          provide: LocalStoreService,
          useValue: { getItem: () => token, setItem: () => undefined, remove: () => undefined },
        },
      ],
    });
    guard = TestBed.inject(AuthGuard);
    auth = TestBed.inject(AuthService);
  });

  it('lets a signed-in user through', () => {
    token = 'abc';
    expect(guard.canActivate(null as any, state('/quotation'))).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('sends a visitor to sign in with the address they asked for', () => {
    expect(guard.canActivate(null as any, state('/quotation/detail/14?tab=items'))).toBeFalse();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/auth/login'], {
      queryParams: { returnUrl: '/quotation/detail/14?tab=items' },
    });
  });

  it('adds no returnUrl for Home, which is where sign in goes anyway', () => {
    guard.canActivate(null as any, state('/dashboard'));
    expect(router.navigate).toHaveBeenCalledOnceWith(['/auth/login'], { queryParams: {} });
    expect(auth.signInParams('/')).toEqual({});
    expect(auth.signInParams('/auth/login?returnUrl=%2Fbills')).toEqual({});
  });

  it('a session that ends by itself returns to the page the user was on', () => {
    router.url = '/customers/edit/3';
    auth.clearSession();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/auth/login'], {
      queryParams: { returnUrl: '/customers/edit/3' },
    });
  });

  it('signing out on purpose lands on Home next time', () => {
    router.url = '/customers/edit/3';
    auth.logout();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/auth/login'], { queryParams: {} });
  });

  it('on the sign-in page itself nothing navigates, so its returnUrl survives a wrong password', () => {
    router.url = '/auth/login?returnUrl=%2Fbills';
    auth.clearSession();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
