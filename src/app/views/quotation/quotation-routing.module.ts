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
import { SubQuotationDetailResolver } from './sub-quotation/sub-quotation-detail/sub-quotation-detail.resolver';
import { ProfileCategoryResolver } from 'src/app/shared/resolver/profile-category.resolver';
import { ProductTypeResolver } from 'src/app/shared/resolver/product-type.resolver';
import { GlassDropdownResolver } from 'src/app/shared/resolver/glass-dropdown.resolver';
import { HandleResolver } from 'src/app/shared/resolver/handle.resolver';
import { MullionResolver } from 'src/app/shared/resolver/mullion.resolver';
import { ProfileListResolver } from 'src/app/shared/resolver/profile-list.resolver';
import { DetailComponent } from './sub-quotation/detail/detail.component';
import { CasementTypeResolver } from 'src/app/shared/resolver/casement-type.resolver';
import { HingesResolver } from 'src/app/shared/resolver/hinges.resolver';
import { SliddingTypesResolver } from 'src/app/shared/resolver/slidding-types.resolver';
import { VentilationTypeResolver } from 'src/app/shared/resolver/ventilation-type.resolver';
import { PallaTypeResolver } from 'src/app/shared/resolver/palla-type.resolver';
import { ProfileColorResolver } from 'src/app/shared/resolver/profile-color.resolver';
import { OpenDirectionResolver } from 'src/app/shared/resolver/open-direction.resolver';
import { DesignComponent } from './sub-quotation/design/design.component';
import { AllDropdownsResolver } from 'src/app/shared/resolver/all-dropdowns.resolver';
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
  {
    path: 'detail/:id/add',
    component: DesignComponent,
    resolve: {
      dropdowns: AllDropdownsResolver,
      profileList: ProfileListResolver,
    },
    data: { edit: false },
  },
  {
    path: 'detail/:id/edit/:subId',
    component: DesignComponent,
    resolve: {
      details: SubQuotationDetailResolver,
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
