import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ToastService } from 'src/app/shared/services/toast.service';
import { ProfileService } from '../profile.service';
import { ChangePasswordCardComponent } from './change-password-card.component';

describe('ChangePasswordCardComponent', () => {
  let fixture: ComponentFixture<ChangePasswordCardComponent>;
  let component: ChangePasswordCardComponent;
  let profile: jasmine.SpyObj<ProfileService>;
  let toast: jasmine.SpyObj<ToastService>;
  let el: HTMLElement;

  function type(id: string, value: string): void {
    const box = el.querySelector('#' + id) as HTMLInputElement;
    box.value = value;
    box.dispatchEvent(new Event('input'));
    box.dispatchEvent(new Event('blur'));
  }

  function fill(current: string, next: string, repeat = next): void {
    type('pw-current', current);
    type('pw-new', next);
    type('pw-repeat', repeat);
    fixture.detectChanges();
  }

  function submit(): void {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    profile = jasmine.createSpyObj('ProfileService', ['changePassword']);
    profile.changePassword.and.returnValue(of({ success: true, data: [], message: 'Password changed' } as any));
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    TestBed.configureTestingModule({
      imports: [ChangePasswordCardComponent],
      providers: [
        { provide: ProfileService, useValue: profile },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(ChangePasswordCardComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('has three named password fields and a secondary button', () => {
    expect(el.querySelector('h2')?.textContent).toContain('Change password');
    for (const id of ['pw-current', 'pw-new', 'pw-repeat']) {
      expect(el.querySelector(`label[for="${id}"]`)).not.toBeNull();
      expect((el.querySelector('#' + id) as HTMLInputElement).type).toBe('password');
    }
    expect(el.querySelector('button[type="submit"]')?.classList).toContain('btn-secondary');
    expect(el.querySelector('.btn-primary')).toBeNull();
  });

  it('sends the three fields, clears the form and says the other devices were signed out', () => {
    fill('Old-Pass-1', 'New-Pass-2026');
    submit();
    expect(profile.changePassword).toHaveBeenCalledOnceWith({ current_password: 'Old-Pass-1', password: 'New-Pass-2026', confirm_password: 'New-Pass-2026' });
    expect(toast.showSuccess).toHaveBeenCalledWith('Password changed. Your other devices were signed out.');
    expect((el.querySelector('#pw-current') as HTMLInputElement).value).toBe('');
  });

  it('sends nothing for an empty field, a short password, a mismatch or the same password', () => {
    submit();
    expect(el.textContent).toContain('Enter the password you sign in with now.');
    fill('Old-Pass-1', 'short');
    submit();
    expect(el.textContent).toContain('Use 8 characters or more.');
    fill('Old-Pass-1', 'New-Pass-2026', 'New-Pass-2027');
    submit();
    expect(el.textContent).toContain('The two new passwords are not the same.');
    fill('Old-Pass-1', 'Old-Pass-1');
    submit();
    expect(el.textContent).toContain('Choose a password different from the current one.');
    expect(profile.changePassword).not.toHaveBeenCalled();
  });

  it('says a wrong current password under its field, in plain words', () => {
    profile.changePassword.and.returnValue(
      of({ status: 0, message: 'Old password not match', data: { errors: { current_password: 'Old password not match' } } } as any)
    );
    fill('Wrong-Pass', 'New-Pass-2026');
    submit();
    expect(el.querySelector('#pw-current-err')?.textContent).toContain('That is not your current password.');
    expect(el.textContent).not.toContain('Old password not match');
    expect(toast.showSuccess).not.toHaveBeenCalled();
    type('pw-current', 'Old-Pass-1');
    fixture.detectChanges();
    expect(el.querySelector('#pw-current-err')).toBeNull();
  });

  it('shows any other refusal above the button and keeps what was typed', () => {
    profile.changePassword.and.returnValue(throwError(() => ({ error: { message: 'Too many attempts. Try again in a minute.' } })));
    fill('Old-Pass-1', 'New-Pass-2026');
    submit();
    expect(el.querySelector('app-callout')?.textContent).toContain('Too many attempts. Try again in a minute.');
    expect((el.querySelector('#pw-new') as HTMLInputElement).value).toBe('New-Pass-2026');
    expect(component.saving).toBeFalse();
  });

  it('shows the passwords on request', () => {
    (el.querySelector('.show input') as HTMLInputElement).click();
    fixture.detectChanges();
    expect((el.querySelector('#pw-new') as HTMLInputElement).type).toBe('text');
  });
});
