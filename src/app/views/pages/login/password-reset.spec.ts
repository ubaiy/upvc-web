import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { PasswordResetService } from './password-reset.service';
import { ResetPasswordComponent } from './reset-password/reset-password.component';

describe('Password reset pages', () => {
  let reset: jasmine.SpyObj<PasswordResetService>;
  let messages: jasmine.SpyObj<MessageService>;
  let query: Record<string, string>;

  beforeEach(async () => {
    query = { token: 'tok-123', email: 'owner@example.com' };
    reset = jasmine.createSpyObj<PasswordResetService>('PasswordResetService', ['requestLink', 'setPassword']);
    messages = jasmine.createSpyObj<MessageService>('MessageService', ['clear', 'add']);
    await TestBed.configureTestingModule({
      declarations: [AuthLayoutComponent, ForgotPasswordComponent, ResetPasswordComponent],
      imports: [ReactiveFormsModule, RouterTestingModule, SharedComponentsModule],
      providers: [
        { provide: PasswordResetService, useValue: reset },
        { provide: MessageService, useValue: messages },
        { provide: ActivatedRoute, useValue: { snapshot: { get queryParamMap() { return convertToParamMap(query); } } } },
      ],
    }).compileComponents();
  });

  function page<T>(type: new (...args: any[]) => T) {
    const fixture = TestBed.createComponent(type);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const submit = () => {
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
    };
    return { fixture, component: fixture.componentInstance, el, submit };
  }

  describe('forgot password', () => {
    it('has one email field, one primary button and a link back to sign in', () => {
      const { el } = page(ForgotPasswordComponent);
      expect(el.querySelector('h1')!.textContent).toBe('Forgot your password?');
      expect(el.querySelectorAll('.btn-primary').length).toBe(1);
      expect(el.querySelector('.btn-primary')!.textContent!.trim()).toBe('Send reset link');
      expect(el.querySelector('.back a')!.getAttribute('href')).toBe('/auth/login');
      expect(TestBed.inject(Title).getTitle()).toBe('Forgot password · UPVC');
    });

    it('sends nothing for an empty or malformed email', () => {
      const { component, el, submit } = page(ForgotPasswordComponent);
      submit();
      expect(el.querySelector('#forgotEmailError')!.textContent).toContain('Enter your email');
      component.form.setValue({ email: 'not-an-email' });
      submit();
      expect(el.querySelector('#forgotEmailError')!.textContent).toContain('Enter a full email');
      expect(reset.requestLink).not.toHaveBeenCalled();
    });

    it('says the same thing whatever the address, and never that an account exists', () => {
      reset.requestLink.and.returnValue(of('If that email has an account, a link to set a new password has been sent.'));
      const texts = ['owner@example.com', 'nobody@example.com'].map((email) => {
        const { component, el, submit } = page(ForgotPasswordComponent);
        component.form.setValue({ email });
        submit();
        expect(el.querySelector('form')).toBeNull();
        return el.querySelector('[role="status"]')!.textContent!.replace(email, '<email>').replace(/\s+/g, ' ');
      });
      expect(reset.requestLink.calls.allArgs()).toEqual([['owner@example.com'], ['nobody@example.com']]);
      expect(texts[0]).toBe(texts[1]);
      expect(texts[0]).toContain('If <email> has an account');
    });

    it('keeps the form and offers "Try again" when the server cannot be reached', () => {
      reset.requestLink.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      const { component, el, submit } = page(ForgotPasswordComponent);
      component.form.setValue({ email: 'owner@example.com' });
      submit();
      expect(el.querySelector('form')).not.toBeNull();
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('We could not reach UPVC');
      expect(el.querySelector('[role="alert"] button')!.textContent).toContain('Try again');
      expect(messages.clear).toHaveBeenCalled();
    });

    it('says to wait after too many requests', () => {
      reset.requestLink.and.returnValue(throwError(() => new HttpErrorResponse({ status: 429 })));
      const { component, el, submit } = page(ForgotPasswordComponent);
      component.form.setValue({ email: 'owner@example.com' });
      submit();
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('Too many attempts');
    });
  });

  describe('set a new password', () => {
    it('reads the token and email of the link and names the account', () => {
      const { el } = page(ResetPasswordComponent);
      expect(el.querySelector('h1')!.textContent).toBe('Set a new password');
      expect(el.textContent).toContain('owner@example.com');
      expect(el.querySelectorAll('.btn-primary').length).toBe(1);
      expect(TestBed.inject(Title).getTitle()).toBe('Set a new password · UPVC');
    });

    it('asks for a new link when the address carries no token', () => {
      query = {};
      const { el } = page(ResetPasswordComponent);
      expect(el.querySelector('form')).toBeNull();
      expect(el.querySelector('.btn-primary')!.getAttribute('href')).toBe('/auth/forgot-password');
    });

    it('checks the length and that the two passwords match before sending', () => {
      const { component, el, submit } = page(ResetPasswordComponent);
      component.form.setValue({ password: 'short', confirm_password: 'short' });
      submit();
      expect(el.querySelector('#resetPasswordHint')!.textContent).toContain('at least 8 characters');
      component.form.setValue({ password: 'long-enough-1', confirm_password: 'long-enough-2' });
      submit();
      expect(el.querySelector('#resetConfirmError')!.textContent).toContain('do not match');
      expect(reset.setPassword).not.toHaveBeenCalled();
    });

    it('saves the password and goes to sign in', () => {
      reset.setPassword.and.returnValue(of('Password updated successfully'));
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      const { component, submit } = page(ResetPasswordComponent);
      component.form.setValue({ password: 'New-Pass-2026!', confirm_password: 'New-Pass-2026!' });
      submit();
      expect(reset.setPassword).toHaveBeenCalledOnceWith({
        email: 'owner@example.com',
        token: 'tok-123',
        password: 'New-Pass-2026!',
        confirm_password: 'New-Pass-2026!',
      });
      // The email goes along, so the sign-in page can fill it in (m20).
      expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], { queryParams: { reset: 1, email: 'owner@example.com' } });
    });

    it('shows the refusal of a used or expired link with a way to ask for a new one', () => {
      const refusal = 'This reset link is not valid or has expired. Ask for a new one.';
      reset.setPassword.and.returnValue(throwError(() => new Error(refusal)));
      const { component, el, submit } = page(ResetPasswordComponent);
      component.form.setValue({ password: 'New-Pass-2026!', confirm_password: 'New-Pass-2026!' });
      submit();
      const alert = el.querySelector('[role="alert"]')!;
      expect(alert.textContent).toContain(refusal);
      expect(alert.querySelector('a')!.getAttribute('href')).toBe('/auth/forgot-password');
    });
  });
});
