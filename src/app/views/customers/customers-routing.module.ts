import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CustomersComponent } from './customers.component';
import { DetailsComponent } from './details/details.component';

// No resolvers: each page loads its own data, so it can show a skeleton
// while it waits and an inline error with "Try again" when it fails.
const routes: Routes = [
  {
    path: '',
    component: CustomersComponent,
    data: {
      title: `Customers`,
    },
  },
  {
    path: 'edit/:id',
    component: DetailsComponent,
    data: { edit: true, title: 'Customer' },
  },
  {
    path: 'add',
    component: DetailsComponent,
    data: { edit: false, title: 'New customer' },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CustomersRoutingModule {}
