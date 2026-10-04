import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';

// `title` is the browser tab title; the product name is added by PageTitleStrategy.
// There is no sign-up page yet, so there is no route for one; /404 and /500 are
// routes of the app itself (app-routing.module.ts), not of /auth.
const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    title: 'Sign in',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PagesRoutingModule {}
