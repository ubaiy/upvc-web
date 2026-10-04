import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../services/auth.service';
import { LoaderService } from '../services/loader.service';
import { ToastService } from '../services/toast.service';
import { LoaderInterceptor } from './loader.interceptor';
import { quiet } from './request-options';

describe('LoaderInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let loader: LoaderService;
  const toast = { showError: jasmine.createSpy('showError') };
  const auth = { clearSession: jasmine.createSpy('clearSession') };

  /** Every value the overlay was given, in order. */
  let shown: boolean[];

  beforeEach(() => {
    toast.showError.calls.reset();
    auth.clearSession.calls.reset();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: HTTP_INTERCEPTORS, useClass: LoaderInterceptor, multi: true },
        { provide: ToastService, useValue: toast },
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    loader = TestBed.inject(LoaderService);
    loader.isLoading.next(false);
    shown = [];
    loader.isLoading.subscribe((value) => shown.push(value));
  });

  afterEach(() => backend.verify());

  const fail = (url: string) =>
    backend.expectOne(url).flush({ message: 'Rate must be above 0' }, { status: 422, statusText: 'Unprocessable' });

  it('by default dims the page while the request is open and toasts a failure', () => {
    http.get('/api/customer/list').subscribe({ error: () => undefined });
    expect(shown).toEqual([false, true]);
    fail('/api/customer/list');
    expect(shown[shown.length - 1]).toBeFalse();
    expect(toast.showError).toHaveBeenCalledOnceWith('Rate must be above 0');
  });

  it('quiet(): no overlay and no toast, and the error still reaches the screen', () => {
    let seen = 0;
    http.get('/api/customer/list', quiet()).subscribe({ error: (err) => (seen = err.status) });
    fail('/api/customer/list');
    expect(shown.includes(true)).toBeFalse();
    expect(toast.showError).not.toHaveBeenCalled();
    expect(seen).toBe(422);
  });

  it('quiet("loader") keeps the toast and quiet("errors") keeps the overlay', () => {
    http.get('/api/a', quiet('loader')).subscribe({ error: () => undefined });
    fail('/api/a');
    expect(shown.includes(true)).toBeFalse();
    expect(toast.showError).toHaveBeenCalledTimes(1);

    toast.showError.calls.reset();
    http.get('/api/b', quiet('errors')).subscribe({ error: () => undefined });
    expect(shown[shown.length - 1]).toBeTrue();
    fail('/api/b');
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it('a quiet request does not hide the overlay of a normal one that is still open', () => {
    http.get('/api/slow').subscribe();
    http.get('/api/fast', quiet()).subscribe();
    backend.expectOne('/api/fast').flush({ success: true });
    expect(shown[shown.length - 1]).toBeTrue();
    backend.expectOne('/api/slow').flush({ success: true });
    expect(shown[shown.length - 1]).toBeFalse();
  });

  it('quiet() also silences the toast for a refusal the API sends as 200 with status 0', () => {
    http.post('/api/company/settings', {}, quiet()).subscribe();
    backend.expectOne('/api/company/settings').flush({ status: 0, message: 'state_code does not match' });
    expect(toast.showError).not.toHaveBeenCalled();

    http.post('/api/company/settings', {}).subscribe();
    backend.expectOne('/api/company/settings').flush({ status: 0, message: 'state_code does not match' });
    expect(toast.showError).toHaveBeenCalledOnceWith('state_code does not match');
  });

  it('an ended session is always announced and cleared, even for a quiet request', () => {
    http.get('/api/quatation/list', quiet()).subscribe({ error: () => undefined });
    backend.expectOne('/api/quatation/list').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(toast.showError).toHaveBeenCalledOnceWith('Your session has ended. Sign in again.');
    expect(auth.clearSession).toHaveBeenCalledTimes(1);
  });

  it('a wrong password on sign in raises no session toast', () => {
    http.post('/api/login', {}).subscribe({ error: () => undefined });
    backend.expectOne('/api/login').flush({ message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });
    expect(toast.showError).not.toHaveBeenCalled();
  });
});
