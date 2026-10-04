import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { OutstandingComponent } from './outstanding/outstanding.component';
import { BillPaymentsComponent } from './pages/bill-payments.component';
import { PaymentsRegisterComponent } from './pages/payments-register.component';
import { PaymentsRoutingModule } from './payments-routing.module';
import { PaymentsSharedModule } from './payments-shared.module';

@NgModule({
  declarations: [OutstandingComponent, BillPaymentsComponent, PaymentsRegisterComponent],
  imports: [CommonModule, FormsModule, PaymentsRoutingModule, SharedComponentsModule, PaymentsSharedModule],
})
export class PaymentsModule {}
