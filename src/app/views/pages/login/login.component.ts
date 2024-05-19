import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/shared/services/auth.service';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  form: FormGroup;
  public visibleAlert = false;
  alertMessage: string = '';
  alertType: string = 'dark';
  constructor(
    private _fb: FormBuilder,
    private _router: Router,
    private _authService: AuthService,
    private _toastService: ToastService
  ) {
    this.form = this._initForm();
  }

  get f() {
    return this.form.controls;
  }

  public submit() {
    if (this.form.valid) {
      this._authService.login(this.form.getRawValue()).subscribe(
        (res) => {
          if (res.success) {
            this._toastService.showSuccess(res.message);
            this._router.navigate(['']);
          } else {
            this._toastService.showError(res.message);
          }
        },
        (error) => {
          this._toastService.showError(error.error.message);
        }
      );
    }
  }

  onVisibleAlertChange(eventValue: boolean) {
    this.visibleAlert = eventValue;
  }

  private _initForm(): FormGroup {
    let fg = this._fb.group({
      email: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });
    return fg;
  }
}
