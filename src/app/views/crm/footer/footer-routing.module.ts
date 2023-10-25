import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FooterComponent } from './footer.component';
import { DetailsResolver } from './details/details.resolver';
import { FooterResolver } from './footer.resolver';
import { DetailsComponent } from './details/details.component';
const routes: Routes = [
  {
    path: '',
    component: FooterComponent,
    // resolve: { list: FooterResolver },
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
export class FooterRoutingModule {}
