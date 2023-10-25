import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListResolver } from './list/list.resolver';
import { ListComponent } from './list/list.component';
import { DetailComponent } from './detail/detail.component';
import { DetailResolver } from './detail/detail.resolver';
const routes: Routes = [
  {
    path: '',
    component: ListComponent,
    resolve: { data: ListResolver },
  },
  {
    path: 'add',
    component: DetailComponent,
    data: { edit: false },
  },
  {
    path: 'edit/:id',
    component: DetailComponent,
    resolve: { data: DetailResolver },
    data: { edit: true },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ProfileColorRoutingModule {}
