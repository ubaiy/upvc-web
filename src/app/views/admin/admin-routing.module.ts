import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AdminLayoutComponent } from './admin-layout.component';
import { CompaniesComponent } from './companies.component';
import { CompanyComponent } from './company.component';
import { NotAllowedComponent } from './not-allowed.component';
import { PlansComponent } from './plans.component';
import { PlatformAdminGuard } from './platform.guard';

const routes: Routes = [
  // Where a company's user lands when they type an admin address. Outside the guard, or it would lead to itself.
  { path: 'not-allowed', component: NotAllowedComponent, title: 'Not allowed' },
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [PlatformAdminGuard],
    children: [
      { path: '', redirectTo: 'companies', pathMatch: 'full' },
      { path: 'companies', component: CompaniesComponent, title: 'Companies' },
      { path: 'companies/:id', component: CompanyComponent, title: 'Company' },
      { path: 'plans', component: PlansComponent, title: 'Plans' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdminRoutingModule {}
