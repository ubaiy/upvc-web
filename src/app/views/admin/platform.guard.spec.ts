import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CompanyAreaGuard, PlatformAdminGuard } from './platform.guard';

const SUBSCRIPTION = `${environment.API_URL}/subscription`;
const KEYS = ['Token', 'User', 'PlatformAdmin'];

describe('the guards of the admin area', () => {
  let http: HttpTestingController;
  let router: Router;

  function signIn(id: number): void {
    localStorage.setItem('Token', JSON.stringify('token'));
    localStorage.setItem('User', JSON.stringify({ id, name: 'Someone' }));
  }

  /** Runs a guard and answers the one question it asks the api. */
  function decide(guard: { canActivate: (...args: any[]) => any }, isAdmin: boolean | 'offline'): boolean | UrlTree {
    let answer: boolean | UrlTree | undefined;
    const result = guard.canActivate({} as any, { url: '/admin/companies' } as any);
    if (typeof result === 'boolean') {
      return result;
    }
    (result as Observable<boolean | UrlTree>).subscribe((value) => (answer = value));
    const request = http.expectOne(SUBSCRIPTION);
    if (isAdmin === 'offline') {
      request.error(new ProgressEvent('error'));
    } else {
      request.flush({ success: true, data: isAdmin ? { is_platform_admin: true, company: null } : { is_platform_admin: false, status: 'active' } });
    }
    return answer as boolean | UrlTree;
  }

  beforeEach(() => {
    KEYS.forEach((key) => localStorage.removeItem(key));
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule, RouterTestingModule] });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    http.verify();
    KEYS.forEach((key) => localStorage.removeItem(key));
  });

  it('sends a visitor with no session to sign in, to come back to the admin address', () => {
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    expect(TestBed.inject(PlatformAdminGuard).canActivate({} as any, { url: '/admin/companies' } as any)).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/auth/login'], { queryParams: { returnUrl: '/admin/companies' } });
  });

  it('lets the platform admin into the admin area', () => {
    signIn(4);
    expect(decide(TestBed.inject(PlatformAdminGuard), true)).toBe(true);
  });

  it('shows a company user "not allowed" instead of the admin area', () => {
    signIn(1);
    const answer = decide(TestBed.inject(PlatformAdminGuard), false);
    expect(router.serializeUrl(answer as UrlTree)).toBe('/admin/not-allowed');
  });

  it('treats a user it could not ask about as a company user, and asks again next time', () => {
    signIn(1);
    const guard = TestBed.inject(PlatformAdminGuard);
    expect(router.serializeUrl(decide(guard, 'offline') as UrlTree)).toBe('/admin/not-allowed');
    expect(decide(guard, true)).toBe(true);
  });

  it('asks once for a user, and again when another person signs in on the same browser', () => {
    signIn(4);
    const guard = TestBed.inject(PlatformAdminGuard);
    expect(decide(guard, true)).toBe(true);
    let again: boolean | UrlTree | undefined;
    (guard.canActivate({} as any, { url: '/admin' } as any) as Observable<boolean | UrlTree>).subscribe((value) => (again = value));
    expect(again).toBe(true); // no second request: http.verify() would fail on one

    signIn(1);
    expect(router.serializeUrl(decide(guard, false) as UrlTree)).toBe('/admin/not-allowed');
  });

  it('leads the platform admin from a company screen to the admin area', () => {
    signIn(4);
    const answer = decide(TestBed.inject(CompanyAreaGuard), true);
    expect(router.serializeUrl(answer as UrlTree)).toBe('/admin');
  });

  it('lets a company user into the company screens', () => {
    signIn(1);
    expect(decide(TestBed.inject(CompanyAreaGuard), false)).toBe(true);
  });

  it('leaves a visitor with no session to the sign-in guard', () => {
    expect(TestBed.inject(CompanyAreaGuard).canActivate()).toBe(true);
  });
});
