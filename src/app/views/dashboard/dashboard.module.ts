import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DashboardRoutingModule } from './dashboard-routing.module';
import { DashboardComponent } from './dashboard.component';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';

@NgModule({
  imports: [CommonModule, DashboardRoutingModule, SharedComponentsModule],
  declarations: [DashboardComponent],
})
export class DashboardModule {}
