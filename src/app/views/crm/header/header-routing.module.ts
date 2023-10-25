import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HeaderComponent } from './header.component';
import { HeaderResolver } from './header.resolver';
import { DetailsResolver } from './details/details.resolver';
import { DetailsComponent } from './details/details.component';
const routes: Routes = [
  {
    path: '',
    component: HeaderComponent,
    // resolve: { list: HeaderResolver },
  },
  {
    path: 'edit/:id',
    // resolve: { data: DetailsResolver },
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
export class HeaderRoutingModule {}
