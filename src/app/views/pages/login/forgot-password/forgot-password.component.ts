import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs';

import { PasswordResetService, resetFailure } from '../password-reset.service';

/**
 * "Forgot password?": an email field and "Send reset link". The page says the
 * same thing whether or not the address has an account, so it cannot be used
 * to find out who has one.
 */
@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent {
  form: FormGroup;
  submitted = false;
  busy = false;
  /** The address the link was asked for; set once the API has answered. */
  sentTo = '';
  error: { text: string; retry: boolean } | null = null;

  @ViewChild('emailInput') emailInput?: ElementRef<HTMLInputElement>;

  constructor(fb: FormBuilder, private reset: PasswordResetService, private messages: MessageService) {
    this.form = fb.group({ email: ['', [Validators.required, Validators.email]] });
  }

  get invalid(): boolean {
    const control = this.form.controls['email'];
    return control.invalid && (this.submitted || (control.touched && !!control.value));
  }

  submit(): void {
    this.submitted = true;
    if (this.busy) {
      return;
    }
    if (this.form.invalid) {
      this.emailInput?.nativeElement.focus();
      return;
    }
    const email = String(this.form.value.email).trim();
    this.busy = true;
    this.error = null;
    this.reset
      .requestLink(email)
      .pipe(finalize(() => (this.busy = false)))
      .subscribe({
        next: () => (this.sentTo = email),
        error: (err) => {
          // The shared interceptor also raises a toast; the reason is on the page already.
          this.messages.clear();
          this.error = resetFailure(err, 'Something went wrong on our side. No link was sent.');
        },
      });
  }

  /** Back to the form, to try another address. */
  again(): void {
    this.sentTo = '';
    this.submitted = false;
  }
}
