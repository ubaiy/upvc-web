import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs';

import { PasswordResetService, resetFailure } from '../password-reset.service';

function samePassword(group: AbstractControl): ValidationErrors | null {
  const { password, confirm_password } = group.value;
  return password && confirm_password && password !== confirm_password ? { mismatch: true } : null;
}

/**
 * "Set a new password": the page the reset email links to
 * (/auth/reset-password?token=…&email=…). Asks for the password twice, saves
 * it, then sends the user to sign in with it.
 */
@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['../forgot-password/forgot-password.component.scss'],
})
export class ResetPasswordComponent implements OnInit {
  form: FormGroup;
  email = '';
  token = '';
  /** The link is an invitation to a team (`invite=1`, card T117): the same form, other words. */
  invite = false;
  /** The company the invitation is to, when the link names it. */
  company = '';
  submitted = false;
  busy = false;
  show = false;
  error: { text: string; retry: boolean } | null = null;

  @ViewChild('passwordInput') passwordInput?: ElementRef<HTMLInputElement>;

  constructor(
    fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private reset: PasswordResetService,
    private messages: MessageService
  ) {
    this.form = fb.group(
      {
        // Minimum 8 matches the API password policy (audit H3).
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirm_password: ['', [Validators.required]],
      },
      { validators: samePassword }
    );
  }

  ngOnInit(): void {
    const query = this.route.snapshot.queryParamMap;
    this.token = query.get('token') ?? '';
    this.email = query.get('email') ?? '';
    this.invite = query.get('invite') === '1';
    this.company = (query.get('company') ?? '').trim().slice(0, 80);
  }

  /** False when the address was opened without the two values the email carries. */
  get hasLink(): boolean {
    return !!this.token && !!this.email;
  }

  get heading(): string {
    if (!this.invite) {
      return 'Set a new password';
    }
    return this.company ? `Set your password to join ${this.company}` : 'Set your password to join the team';
  }

  get passwordError(): string {
    const control = this.form.controls['password'];
    if (!(control.invalid && (this.submitted || (control.touched && !!control.value)))) {
      return '';
    }
    return control.errors?.['required'] ? (this.invite ? 'Enter a password' : 'Enter a new password') : 'Password must be at least 8 characters';
  }

  get confirmError(): string {
    const control = this.form.controls['confirm_password'];
    if (!(this.submitted || (control.touched && !!control.value))) {
      return '';
    }
    if (control.errors?.['required']) {
      return 'Enter the password again';
    }
    return this.form.errors?.['mismatch'] ? 'The two passwords do not match' : '';
  }

  submit(): void {
    this.submitted = true;
    if (this.busy) {
      return;
    }
    if (this.form.invalid) {
      this.passwordInput?.nativeElement.focus();
      return;
    }
    this.busy = true;
    this.error = null;
    const { password, confirm_password } = this.form.getRawValue();
    this.reset
      .setPassword({ email: this.email, token: this.token, password, confirm_password })
      .pipe(finalize(() => (this.busy = false)))
      .subscribe({
        next: () => this.router.navigate(['/auth/login'], { queryParams: this.invite ? { reset: 1, invite: 1, email: this.email } : { reset: 1, email: this.email } }),
        error: (err) => {
          // The shared interceptor also raises a toast; the reason is on the page already.
          this.messages.clear();
          this.error = resetFailure(err, this.invite ? 'Something went wrong on our side. Your password was not set.' : 'Something went wrong on our side. Your password was not changed.');
        },
      });
  }
}
