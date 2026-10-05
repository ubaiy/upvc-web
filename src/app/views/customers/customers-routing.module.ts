import { NgModule } from '@angular/core';
import { CanDeactivateFn, RouterModule, Routes } from '@angular/router';
import { CustomersComponent } from './customers.component';
import { DetailsComponent } from './details/details.component';

/** A customer page with typed changes asks before it is left, by any link (breadcrumb, menu, back). */
const askBeforeLeaving: CanDeactivateFn<DetailsComponent> = (page) => page.canLeave();

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
    canDeactivate: [askBeforeLeaving],
  },
  {
    path: 'add',
    component: DetailsComponent,
    data: { edit: false, title: 'New customer' },
    canDeactivate: [askBeforeLeaving],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CustomersRoutingModule {}
