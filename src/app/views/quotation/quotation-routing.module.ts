import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { QuotationComponent } from './quotation.component';
import { QuotationResolver } from './quotation.resolver';
import { AddComponent } from './add/add.component';
import { CustomerListResolver } from '../customers/customer-list.resolver';
import { AreaResolver } from '../area/area.resolver';
import { AddResolver } from './add/add.resolver';
import { SubQuotationComponent } from './sub-quotation/sub-quotation.component';
import { SubQuotationResolver } from './sub-quotation/sub-quotation.resolver';
import { ProfileCategoryResolver } from 'src/app/shared/resolver/profile-category.resolver';
import { ProfileListResolver } from 'src/app/shared/resolver/profile-list.resolver';
import { AllDropdownsResolver } from 'src/app/shared/resolver/all-dropdowns.resolver';
import { GlassDropdownResolver } from 'src/app/shared/resolver/glass-dropdown.resolver';
import { DesignComponent } from './sub-quotation/design/design.component';
import { SubQuotationDesignComponent } from './sub-quotation/sub-quotation-design/sub-quotation-design.component';
const routes: Routes = [
  {
    path: '',
    component: QuotationComponent,
    resolve: { list: QuotationResolver },
  },
  {
    path: 'add',
    component: AddComponent,
    resolve: { customerList: CustomerListResolver, areaList: AreaResolver },
    data: { edit: false },
  },
  {
    path: 'edit/:id',
    component: AddComponent,
    resolve: {
      detail: AddResolver,
      customerList: CustomerListResolver,
      areaList: AreaResolver,
    },
    data: { edit: true },
  },
  {
    path: 'detail/:id',
    component: SubQuotationComponent,
    resolve: { data: SubQuotationResolver },
    data: { edit: false },
  },
  // {
  //   path: 'detail/:id/add',
  //   component: DesignComponent,
  //   resolve: {
  //     profileList: ProfileListResolver,
  //     dropdowns: AllDropdownsResolver,
  //     glassList: GlassDropdownResolver,
  //     productCategory: ProfileCategoryResolver,
  //   },
  //   data: { edit: false },
  // },
  // {
  //   path: 'detail/:id/edit/:subId',
  //   component: DesignComponent,
  //   resolve: {
  //     details: SubQuotationResolver,
  //     profileList: ProfileListResolver,
  //     dropdowns: AllDropdownsResolver,
  //     glassList: GlassDropdownResolver,
  //     productCategory: ProfileCategoryResolver,
  //   },
  //   data: { edit: true },
  // },
  {
    path: 'detail/:id/add',
    component: SubQuotationDesignComponent,
    resolve: {
      profileList: ProfileListResolver,
      dropdowns: AllDropdownsResolver,
    },
    data: { edit: false },
  },
  {
    path: 'detail/:id/edit/:subId',
    component: SubQuotationDesignComponent,
    resolve: {
      details: SubQuotationResolver,
      profileList: ProfileListResolver,
      dropdowns: AllDropdownsResolver,
    },
    data: { edit: true },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class QuotationRoutingModule {}
