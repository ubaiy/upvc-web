import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { ConfirmDialogComponent } from '../bills/confirm-dialog.component';
import { ProductionRoutingModule } from './production-routing.module';
import { ProductionComponent } from './production.component';

/** Workshop documents of a quotation (roadmap card P5), at /production/:quotationId. */
@NgModule({
  declarations: [ProductionComponent],
  imports: [CommonModule, ProductionRoutingModule, SharedComponentsModule, ConfirmDialogComponent],
})
export class ProductionModule {}
