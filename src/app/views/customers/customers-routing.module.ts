import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CustomersComponent } from './customers.component';
import { DetailsComponent } from './details/details.component';
import { DetailResolver } from './details/detail.resolver';
import { CustomerListResolver } from './customer-list.resolver';
const routes: Routes = [
  {
    path: '',
    resolve: { list: CustomerListResolver },
    component: CustomersComponent,
    data: {
      title: `Customers`,
    },
  },
  {
    path: 'edit/:id',
    resolve: { data: DetailResolver },
    component: DetailsComponent,
    data: { edit: true },
  },
  {
    path: 'add',
    component: DetailsComponent,
    data: { edit: false },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CustomersRoutingModule {}
