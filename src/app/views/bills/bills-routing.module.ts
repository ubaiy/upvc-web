import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListComponent } from './list/list.component';

// No resolver: the list loads its own data, so it can show a skeleton
// while it waits and an inline error with "Try again" when it fails.
const routes: Routes = [
  {
    path: '',
    component: ListComponent,
    data: { title: 'Bills' },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BillsRoutingModule {}
