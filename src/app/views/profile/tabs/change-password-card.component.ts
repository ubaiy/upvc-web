import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ProfileService } from '../profile.service';

/**
 * Settings → Your profile → Change password, while signed in. The api checks
 * the current password, keeps this device signed in and signs out every
 * other one (phase 30 log, section 8).
 */
@Component({
  selector: 'app-change-password-card',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SharedComponentsModule],
  styleUrls: ['../settings-tab.scss'],
  template: `
    <section class="card" aria-labelledby="h-password">
      <div class="card-head">
        <div>
          <h2 id="h-password">Change password</h2>
          <p>Your other devices are signed out when the password changes. This one stays signed in.</p>
        </div>
      </div>
      <form class="card-pad stack-6" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field span-2 current">
            <label class="label" for="pw-current">Current password</label>
            <input
              class="input"
              id="pw-current"
              [type]="shown ? 'text' : 'password'"
              formControlName="current_password"
              autocomplete="current-password"
              [class.is-invalid]="invalid('current_password') || !!currentError"
              [attr.aria-invalid]="invalid('current_password') || !!currentError"
              aria-describedby="pw-current-err"
            />
            <span class="error" id="pw-current-err" role="alert" *ngIf="invalid('current_password') || currentError">
              {{ currentError || 'Enter the password you sign in with now.' }}
            </span>
          </div>
          <div class="field">
            <label class="label" for="pw-new">New password</label>
            <input
              class="input"
              id="pw-new"
              [type]="shown ? 'text' : 'password'"
              formControlName="password"
              autocomplete="new-password"
              [class.is-invalid]="invalid('password') || sameAsCurrent"
              [attr.aria-invalid]="invalid('password') || sameAsCurrent"
              aria-describedby="pw-new-help"
            />
            <span id="pw-new-help">
              <span class="error" *ngIf="sameAsCurrent">Choose a password different from the current one.</span>
              <span class="error" *ngIf="invalid('password') && !sameAsCurrent">Use 8 characters or more.</span>
              <span class="hint" *ngIf="!invalid('password') && !sameAsCurrent">8 characters or more.</span>
            </span>
          </div>
          <div class="field">
            <label class="label" for="pw-repeat">New password again</label>
            <input
              class="input"
              id="pw-repeat"
              [type]="shown ? 'text' : 'password'"
              formControlName="confirm_password"
              autocomplete="new-password"
              [class.is-invalid]="mismatch"
              [attr.aria-invalid]="mismatch"
              aria-describedby="pw-repeat-err"
            />
            <span class="error" id="pw-repeat-err" *ngIf="mismatch">The two new passwords are not the same.</span>
          </div>
        </div>

        <app-callout tone="danger" *ngIf="saveError">{{ saveError }}</app-callout>

        <div class="form-foot">
          <!-- Secondary: the page's one primary button is "Save changes" above. -->
          <button type="submit" class="btn btn-secondary" [disabled]="saving">
            {{ saving ? 'Changing…' : 'Change password' }}
          </button>
          <label class="show"><input type="checkbox" [checked]="shown" (change)="shown = !shown" /> Show passwords</label>
        </div>
      </form>
    </section>
  `,
  styles: [
    `
      :host { display: block; }
      .current { max-width: 50%; }
      .show { display: inline-flex; align-items: center; gap: var(--s-2); min-height: 44px; color: var(--c-text-2); font-size: var(--fs-13); cursor: pointer; }
      @media (max-width: 640px) { .current { max-width: none; } }
    `,
  ],
})
export class ChangePasswordCardComponent {
  form: FormGroup;
  submitted = false;
  saving = false;
  shown = false;
  /** The api's refusal of the current password, under that field. */
  currentError = '';
  saveError = '';

  constructor(private fb: FormBuilder, private profile: ProfileService, private toast: ToastService) {
    this.form = this.fb.group({
      current_password: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm_password: ['', [Validators.required]],
    });
    this.form.get('current_password')?.valueChanges.subscribe(() => (this.currentError = ''));
  }

  invalid(name: string): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted);
  }

  /** The repeat box was used and does not match. */
  get mismatch(): boolean {
    const { password, confirm_password } = this.form.value;
    const repeat = this.form.controls['confirm_password'];
    return (repeat.touched || this.submitted) && password !== confirm_password;
  }

  get sameAsCurrent(): boolean {
    const { current_password, password } = this.form.value;
    return !!password && password === current_password && (this.form.controls['password'].touched || this.submitted);
  }

  save(): void {
    this.submitted = true;
    this.saveError = '';
    this.currentError = '';
    const value = this.form.value;
    if (this.form.invalid || this.saving || value.password !== value.confirm_password || value.password === value.current_password) {
      return;
    }
    this.saving = true;
    this.profile.changePassword(value).subscribe({
      next: (res: any) => {
        this.saving = false;
        if (res?.success) {
          this.submitted = false;
          this.form.reset({ current_password: '', password: '', confirm_password: '' });
          this.toast.showSuccess('Password changed. Your other devices were signed out.');
          return;
        }
        this.refused(res);
      },
      error: (err) => {
        this.saving = false;
        this.refused(err?.error);
      },
    });
  }

  /** A wrong current password is said under its field, in plain words; anything else above the button. */
  private refused(res: any): void {
    const errors = res?.data?.errors || {};
    if (errors.current_password || /old password/i.test(res?.message || '')) {
      this.currentError = 'That is not your current password.';
      return;
    }
    this.saveError = errors.password || errors.confirm_password || res?.message || 'The password was not changed. Please try again.';
  }
}
