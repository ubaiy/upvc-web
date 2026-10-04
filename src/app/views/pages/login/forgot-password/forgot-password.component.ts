import { Component } from '@angular/core';

/**
 * A plain page behind "Forgot password?". The API has no reset-by-email yet
 * (no forgot-password or reset-password route), so this says who can set a
 * new password today. When the API supports it, this becomes the "email me a
 * reset link" form.
 */
@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent {}
