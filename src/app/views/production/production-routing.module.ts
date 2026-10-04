import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ProductionComponent } from './production.component';

// No resolver: the page loads its own job, so it can show a skeleton while
// it waits and an inline error with "Try again" when it fails.
const routes: Routes = [
  {
    // The quotation's id, the same one as /quotation/detail/:id.
    path: ':quotationId',
    component: ProductionComponent,
    data: { title: 'Production' },
  },
  { path: '', redirectTo: '/quotation', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ProductionRoutingModule {}
