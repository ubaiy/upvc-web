import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { OrderCreateComponent } from './create/order-create.component';
import { OrdersListComponent } from './list/orders-list.component';
import { OrderPageComponent } from './page/order-page.component';

// No resolver: each page loads its own data, so it can show a skeleton while
// it waits and an inline error with "Try again" when it fails.
const routes: Routes = [
  // ?view=board for the board, ?stage=<stage> for a tab.
  { path: '', component: OrdersListComponent, data: { title: 'Orders' } },
  // ?quotation=<id>: where "Create order" on the quotation page lands.
  { path: 'new', component: OrderCreateComponent, data: { title: 'Create order' } },
  { path: ':id', component: OrderPageComponent, data: { title: 'Order' } },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrdersRoutingModule {}
