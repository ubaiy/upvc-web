import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { AdminLayoutComponent } from './admin-layout.component';
import { AdminRoutingModule } from './admin-routing.module';
import { CompaniesComponent } from './companies.component';
import { CompanyComponent } from './company.component';
import { NewCompanyComponent } from './new-company.component';
import { NotAllowedComponent } from './not-allowed.component';
import { PlansComponent } from './plans.component';

/**
 * The platform admin's area (card T119), at /admin: the product owner's screens for the
 * customer companies, their plans, payments entered by hand and limits. It has its own
 * frame, not the company shell: a platform admin has no company, and the api refuses
 * them every company route.
 */
@NgModule({
  imports: [CommonModule, FormsModule, DialogModule, SharedComponentsModule, AdminRoutingModule, NewCompanyComponent],
  declarations: [AdminLayoutComponent, CompaniesComponent, CompanyComponent, NotAllowedComponent, PlansComponent],
})
export class AdminModule {}
