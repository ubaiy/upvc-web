import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ForgotPasswordComponent } from '../login/forgot-password/forgot-password.component';
import { AuthLayoutComponent } from './auth-layout.component';

@Component({
  template: `<app-auth-layout heading="Welcome back" lead="Sign in to your workshop." pageTitle="Sign in">
    <form id="projected"></form>
  </app-auth-layout>`,
})
class HostComponent {}

describe('AuthLayoutComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AuthLayoutComponent, ForgotPasswordComponent, HostComponent],
      imports: [RouterTestingModule, SharedComponentsModule],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('draws the brand, one h1, the lead and the projected form', () => {
    expect(el.querySelector('.brand')!.textContent).toContain('UPVC');
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('h1')!.textContent).toBe('Welcome back');
    expect(el.querySelector('.auth-form p')!.textContent).toBe('Sign in to your workshop.');
    expect(el.querySelector('.auth-form #projected')).not.toBeNull();
  });

  it('sets the browser tab title', () => {
    expect(TestBed.inject(Title).getTitle()).toBe('Sign in · UPVC');
  });

  it('shows the sample window with its price through the inr pipe', () => {
    const side = el.querySelector('.auth-side')!;
    expect(side.querySelector('svg[role="img"]')!.getAttribute('aria-label')).toBe('Three-pane casement window');
    expect(side.querySelector('.art-price .num')!.textContent).toBe('₹10,399.37');
  });

  it('forgot password: says what to do and has one primary button back to sign in', () => {
    const page = TestBed.createComponent(ForgotPasswordComponent);
    page.detectChanges();
    const root: HTMLElement = page.nativeElement;
    expect(root.querySelector('h1')!.textContent).toBe('Forgot your password?');
    expect(root.querySelectorAll('.btn-primary').length).toBe(1);
    expect(root.querySelector('.btn-primary')!.getAttribute('href')).toBe('/auth/login');
    expect(TestBed.inject(Title).getTitle()).toBe('Forgot password · UPVC');
  });
});
