import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ProfileComponent } from './profile.component';
import { ProfileResolver } from './profile.resolver';
import { DetailComponent } from './detail/detail.component';
import { DetailResolver } from './detail/detail.resolver';
import { ProfileCategoryResolver } from 'src/app/shared/resolver/profile-category.resolver';
import { BulkPriceUpdateResolver } from '../../bulk-price-upload/bulk-price-update.resolver';
const routes: Routes = [
  {
    path: '',
    component: ProfileComponent,
    resolve: { list: ProfileResolver, data: BulkPriceUpdateResolver },
  },
  {
    path: 'add',
    component: DetailComponent,
    resolve: { category: ProfileCategoryResolver },
    data: { edit: false },
  },
  {
    path: 'edit/:id',
    component: DetailComponent,
    resolve: { data: DetailResolver, category: ProfileCategoryResolver },
    data: { edit: true },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ProfileRoutingModule {}
