import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs';
import { PRODUCT_NAME } from 'src/app/shared/configs/product';
import { AuthService } from 'src/app/shared/services/auth.service';

/** What went wrong with the last attempt, shown above the form. */
export interface SignInError {
  text: string;
  /** True when sending the same details again can work (network or server fault). */
  retry: boolean;
}

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, AfterViewInit {
  readonly product = PRODUCT_NAME;

  form: FormGroup;
  submitted = false;
  busy = false;
  showPassword = false;
  capsLock = false;
  error: SignInError | null = null;
  /** True when the user has just set a new password and is sent here to use it. */
  passwordChanged = false;

  @ViewChild('emailInput') emailInput?: ElementRef<HTMLInputElement>;
  @ViewChild('passwordInput') passwordInput?: ElementRef<HTMLInputElement>;

  constructor(
    private _fb: FormBuilder,
    private _router: Router,
    private _route: ActivatedRoute,
    private _authService: AuthService,
    private _messages: MessageService
  ) {
    this.form = this._initForm();
  }

  get f() {
    return this.form.controls;
  }

  ngOnInit(): void {
    this.passwordChanged = this._route.snapshot.queryParamMap.has('reset');
    // The reset page knows whose password was changed: the email is filled in, the cursor waits in Password.
    const email = this._route.snapshot.queryParamMap.get('email');
    if (email) {
      this.form.patchValue({ email });
    }
    // Someone who is already signed in has nothing to do here.
    if (this._authService.getToken()) {
      this._router.navigateByUrl(this._destination());
    }
  }

  ngAfterViewInit(): void {
    if (this.f['email'].value) {
      this.passwordInput?.nativeElement.focus();
    }
  }

  /**
   * True when the field's error should be on screen: after "Sign in" was
   * pressed, or once the user has typed something and left the field. Leaving
   * an empty field says nothing, so the page does not jump under a click on
   * "Forgot password?".
   */
  public invalid(name: 'email' | 'password'): boolean {
    const control = this.f[name];
    return control.invalid && (this.submitted || (control.touched && !!control.value));
  }

  public submit() {
    this.submitted = true;
    if (this.busy) {
      return;
    }
    if (this.form.invalid) {
      (this.f['email'].invalid ? this.emailInput : this.passwordInput)?.nativeElement.focus();
      return;
    }
    this.busy = true;
    this.error = null;
    const { email, password } = this.form.getRawValue();
    this._authService
      .login({ email, password })
      .pipe(finalize(() => (this.busy = false)))
      .subscribe({
        next: (res: any) => {
          if (res?.success) {
            this._router.navigateByUrl(this._destination());
          } else {
            this._fail(this._rejected(res?.message), false);
          }
        },
        error: (err) => {
          if (err?.status === 429) {
            this._fail('Too many attempts. Wait a minute, then try again.', false);
          } else if (err?.status === 0) {
            this._fail(`We could not reach ${PRODUCT_NAME}. Check your internet connection.`, true);
          } else {
            this._fail('Something went wrong on our side. Your details were not checked.', true);
          }
        },
      });
  }

  public togglePassword() {
    this.showPassword = !this.showPassword;
    this.passwordInput?.nativeElement.focus();
  }

  public onPasswordKey(event: KeyboardEvent) {
    this.capsLock = !!event.getModifierState && event.getModifierState('CapsLock');
  }

  private _fail(text: string, retry: boolean) {
    // The shared HTTP interceptor also raises a toast for a failed request.
    // The reason is already on the page, next to the form, so drop the copy.
    this._messages.clear();
    this.error = { text, retry };
    if (!retry) {
      const password = this.passwordInput?.nativeElement;
      password?.focus();
      password?.select();
    }
  }

  private _rejected(message?: string): string {
    if (!message || /invalid credentials/i.test(message)) {
      return 'That email and password do not match. Check both and try again.';
    }
    return message;
  }

  /**
   * Where to go after signing in: the page that sent the user here
   * (?returnUrl=/quotation), when it is a path inside this app, otherwise Home.
   */
  private _destination(): string {
    const url = this._route.snapshot.queryParamMap.get('returnUrl');
    if (url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/auth')) {
      return url;
    }
    return '/';
  }

  private _initForm(): FormGroup {
    let fg = this._fb.group({
      email: ['', [Validators.required, Validators.email]],
      // Minimum 8 matches the API password policy (audit H3).
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
    return fg;
  }
}
