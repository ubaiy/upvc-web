import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListComponent } from './list/list.component';
import { BillsResolver } from './bills.resolver';

const routes: Routes = [
  {
    path: '',
    component: ListComponent,
    resolve: { list: BillsResolver },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BillsRoutingModule {}
