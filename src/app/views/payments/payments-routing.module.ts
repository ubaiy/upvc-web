import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { OutstandingComponent } from './outstanding/outstanding.component';
import { BillPaymentsComponent } from './pages/bill-payments.component';
import { PaymentsRegisterComponent } from './pages/payments-register.component';

// No resolver: each page loads its own data, so it can show a skeleton while
// it waits and an inline error with "Try again" when it fails.
const routes: Routes = [
  { path: '', component: PaymentsRegisterComponent, data: { title: 'Payments' } },
  { path: 'outstanding', component: OutstandingComponent, data: { title: 'Outstanding' } },
  // The bill's id, the same one as in bill/list.
  { path: 'bill/:billId', component: BillPaymentsComponent, data: { title: 'Bill payments' } },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PaymentsRoutingModule {}
