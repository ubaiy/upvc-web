import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuModule } from 'primeng/menu';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { ConfirmDialogComponent } from '../bills/confirm-dialog.component';
import { PaymentsSharedModule } from '../payments/payments-shared.module';
import { OrderCreateComponent } from './create/order-create.component';
import { OrdersListComponent } from './list/orders-list.component';
import { OrdersRoutingModule } from './orders-routing.module';
import { OrderPageComponent } from './page/order-page.component';

@NgModule({
  declarations: [OrdersListComponent, OrderPageComponent, OrderCreateComponent],
  imports: [CommonModule, FormsModule, MenuModule, OrdersRoutingModule, SharedComponentsModule, PaymentsSharedModule, ConfirmDialogComponent],
})
export class OrdersModule {}
