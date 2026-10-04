import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { PagesRoutingModule } from './pages-routing.module';
import { AuthLayoutComponent } from './auth-layout/auth-layout.component';
import { LoginComponent } from './login/login.component';
import { ForgotPasswordComponent } from './login/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './login/reset-password/reset-password.component';
import { Page404Component } from './page404/page404.component';
import { Page500Component } from './page500/page500.component';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
@NgModule({
  declarations: [
    AuthLayoutComponent,
    LoginComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    Page404Component,
    Page500Component,
  ],
  imports: [
    CommonModule,
    PagesRoutingModule,
    // Card U1 owns this module but not pages-routing.module.ts, so its one
    // new route (/auth/forgot-password) is registered here.
    RouterModule.forChild([
      { path: 'forgot-password', component: ForgotPasswordComponent, data: { title: 'Forgot password' } },
      // The reset email links here: /auth/reset-password?token=…&email=… (ACCOUNT_RESET_URL in the API).
      { path: 'reset-password', component: ResetPasswordComponent, data: { title: 'Set a new password' } },
    ]),
    // SharedCommonModule is deliberately not imported: it provides MessageService,
    // and a second copy in this lazy module would cut these pages off from the
    // app's one toast outlet.
    SharedComponentsModule,
    ReactiveFormsModule,
    FormsModule,
  ],
})
export class PagesModule {}
