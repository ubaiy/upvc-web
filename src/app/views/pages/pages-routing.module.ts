import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Page404Component } from './page404/page404.component';
import { Page500Component } from './page500/page500.component';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { LogoutGuard } from 'src/app/shared/guards/logout.guard';

// `title` is the browser tab title; the product name is added by PageTitleStrategy.
const routes: Routes = [
  {
    path: '404',
    component: Page404Component,
    title: 'Page not found',
  },
  {
    path: '500',
    component: Page500Component,
    title: 'Something went wrong',
  },
  {
    path: 'login',
    component: LoginComponent,
    title: 'Sign in',
  },
  {
    path: 'register',
    component: RegisterComponent,
    title: 'Start a free trial',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PagesRoutingModule {}
