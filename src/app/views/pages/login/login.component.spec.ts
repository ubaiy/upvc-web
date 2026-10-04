import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { MessageService } from 'primeng/api';
import { of, Subject, throwError } from 'rxjs';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { AuthService } from 'src/app/shared/services/auth.service';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let el: HTMLElement;
  let auth: jasmine.SpyObj<AuthService>;
  let messages: jasmine.SpyObj<MessageService>;
  let router: Router;
  let navigate: jasmine.Spy;
  let query: Record<string, string>;

  function create() {
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  function fill(email: string, password: string) {
    component.form.setValue({ email, password });
    fixture.detectChanges();
  }

  function submit() {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    query = {};
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['login', 'getToken']);
    auth.getToken.and.returnValue('');
    messages = jasmine.createSpyObj<MessageService>('MessageService', ['clear', 'add']);

    await TestBed.configureTestingModule({
      declarations: [LoginComponent, AuthLayoutComponent],
      imports: [ReactiveFormsModule, RouterTestingModule, SharedComponentsModule],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: MessageService, useValue: messages },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { get queryParamMap() { return convertToParamMap(query); } } },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
  });

  it('shows the two labelled fields and exactly one primary button', () => {
    create();
    expect(el.querySelector('h1')!.textContent).toContain('Welcome back');
    expect(el.querySelector('label[for="loginEmail"]')!.textContent).toContain('Work email');
    expect(el.querySelector('label[for="loginPassword"]')!.textContent).toContain('Password');
    expect(el.querySelectorAll('.btn-primary').length).toBe(1);
    expect(el.querySelector('.btn-primary')!.textContent).toContain('Sign in');
  });

  it('links to the forgot-password page and to sign up', () => {
    create();
    const links = Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/auth/forgot-password');
    expect(links).toContain('/auth/register');
  });

  it('gives every button and input an accessible name', () => {
    create();
    el.querySelectorAll('input').forEach((input) => {
      expect(el.querySelector(`label[for="${input.id}"]`)).withContext(input.id).not.toBeNull();
    });
    el.querySelectorAll('button').forEach((button) => {
      const name = button.getAttribute('aria-label') || button.textContent!.trim();
      expect(name).withContext(button.outerHTML).not.toBe('');
    });
  });

  it('sends nothing and says what is missing when the form is empty', () => {
    create();
    submit();
    expect(auth.login).not.toHaveBeenCalled();
    expect(el.querySelector('#loginEmailError')!.textContent).toContain('Enter your email');
    expect(el.querySelector('#loginPasswordError')!.textContent).toContain('Enter your password');
    expect(el.querySelector('#loginEmail')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('says nothing when an empty field loses focus, and flags a half-typed email on leaving it', () => {
    create();
    const email = el.querySelector('#loginEmail') as HTMLInputElement;
    email.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(el.querySelector('#loginEmailError')).toBeNull();

    email.value = 'demo@';
    email.dispatchEvent(new Event('input'));
    email.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(el.querySelector('#loginEmailError')!.textContent).toContain('Enter a full email');
  });

  it('rejects a malformed email and a password under 8 characters without calling the API', () => {
    create();
    fill('demo@', 'short');
    submit();
    expect(auth.login).not.toHaveBeenCalled();
    expect(el.querySelector('#loginEmailError')!.textContent).toContain('Enter a full email');
    expect(el.querySelector('#loginPasswordError')!.textContent).toContain('Password must be at least 8 characters');
  });

  it('signs in and goes to Home without a toast', () => {
    auth.login.and.returnValue(of({ success: true, message: 'Login successfully' } as any));
    create();
    fill('demo@upvc.local', 'Demo-Upvc-2026!');
    submit();
    expect(auth.login).toHaveBeenCalledOnceWith({ email: 'demo@upvc.local', password: 'Demo-Upvc-2026!' });
    expect(navigate).toHaveBeenCalledOnceWith('/');
    expect(messages.add).not.toHaveBeenCalled();
  });

  it('returns to the page that asked for sign-in when returnUrl is a path in this app', () => {
    query = { returnUrl: '/quotation' };
    auth.login.and.returnValue(of({ success: true } as any));
    create();
    fill('demo@upvc.local', 'Demo-Upvc-2026!');
    submit();
    expect(navigate).toHaveBeenCalledOnceWith('/quotation');
  });

  it('ignores a returnUrl that leaves the app or loops back to sign-in', () => {
    auth.login.and.returnValue(of({ success: true } as any));
    for (const returnUrl of ['//evil.example', 'https://evil.example', '/auth/login']) {
      query = { returnUrl };
      navigate.calls.reset();
      create();
      fill('demo@upvc.local', 'Demo-Upvc-2026!');
      submit();
      expect(navigate).withContext(returnUrl).toHaveBeenCalledOnceWith('/');
    }
  });

  it('disables the button and says "Signing in…" while the request runs', () => {
    const pending = new Subject<any>();
    auth.login.and.returnValue(pending);
    create();
    fill('demo@upvc.local', 'Demo-Upvc-2026!');
    submit();
    const button = el.querySelector('.btn-primary') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
    expect(button.textContent).toContain('Signing in');
    submit();
    expect(auth.login).toHaveBeenCalledTimes(1);
    pending.next({ success: true });
    pending.complete();
    fixture.detectChanges();
    expect(button.disabled).toBeFalse();
  });

  it('shows wrong details on the page, not in a toast, and offers no retry', () => {
    auth.login.and.returnValue(of({ status: 0, message: 'Invalid credentials' } as any));
    create();
    fill('demo@upvc.local', 'wrong-password');
    submit();
    const alert = el.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('That email and password do not match');
    expect(alert.querySelector('button')).toBeNull();
    expect(messages.clear).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.form.value.email).toBe('demo@upvc.local');
  });

  it('explains the lock after too many attempts', () => {
    auth.login.and.returnValue(throwError(() => ({ status: 429, error: { message: 'Too Many Attempts.' } })));
    create();
    fill('demo@upvc.local', 'wrong-password');
    submit();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Too many attempts. Wait a minute');
  });

  it('offers "Try again" when the server cannot be reached, and retries with the same details', () => {
    auth.login.and.returnValue(throwError(() => ({ status: 0 })));
    create();
    fill('demo@upvc.local', 'Demo-Upvc-2026!');
    submit();
    const alert = el.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('We could not reach UPVC');

    auth.login.and.returnValue(of({ success: true } as any));
    (alert.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(auth.login).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledOnceWith('/');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('offers "Try again" on a server fault', () => {
    auth.login.and.returnValue(throwError(() => ({ status: 500 })));
    create();
    fill('demo@upvc.local', 'Demo-Upvc-2026!');
    submit();
    const alert = el.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Something went wrong on our side');
    expect(alert.querySelector('button')!.textContent).toContain('Try again');
  });

  it('shows and hides the password', () => {
    create();
    const input = el.querySelector('#loginPassword') as HTMLInputElement;
    const toggle = el.querySelector('button[aria-label="Show password"]') as HTMLButtonElement;
    expect(input.type).toBe('password');
    toggle.click();
    fixture.detectChanges();
    expect(input.type).toBe('text');
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('sends a signed-in user straight to Home', () => {
    auth.getToken.and.returnValue('token');
    create();
    expect(navigate).toHaveBeenCalledOnceWith('/');
  });
});
