import { inject, NgModule } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterModule, Routes } from '@angular/router';
import { QuotationComponent } from './quotation.component';
import { SubQuotationComponent } from './sub-quotation/sub-quotation.component';
import { SubQuotationResolver } from './sub-quotation/sub-quotation.resolver';
import { ProfileListResolver } from 'src/app/shared/resolver/profile-list.resolver';
import { AllDropdownsResolver } from 'src/app/shared/resolver/all-dropdowns.resolver';
import { SubQuotationDesignComponent } from './sub-quotation/sub-quotation-design/sub-quotation-design.component';
import { MullionResolver } from '../../shared/resolver/mullion.resolver';
import { SubQuotationDesignResolver } from './sub-quotation/sub-quotation-design/sub-quotation-design.resolver';
import { SuperSystemComponent } from './sub-quotation/super-system/super-system.component';

/**
 * "New quotation" and "edit quotation" are dialogs on the list now, not
 * pages. The old addresses still work: they land on the list with the
 * dialog open, so links from Home and from the quotation page keep working.
 */
export const openNewQuotationDialog = () => inject(Router).createUrlTree(['/quotation'], { queryParams: { new: 1 } });
export const openEditQuotationDialog = (route: ActivatedRouteSnapshot) =>
  inject(Router).createUrlTree(['/quotation'], { queryParams: { edit: route.params['id'] } });

const routes: Routes = [
  {
    // The list loads its own data, so it can show a skeleton and an inline error.
    path: '',
    component: QuotationComponent,
  },
  {
    path: 'add',
    canActivate: [openNewQuotationDialog],
    component: QuotationComponent,
  },
  {
    path: 'edit/:id',
    canActivate: [openEditQuotationDialog],
    component: QuotationComponent,
  },
  {
    path: 'detail/:id',
    component: SubQuotationComponent,
    resolve: { data: SubQuotationResolver },
    data: { edit: false },
  },
  {
    path: 'detail/:id/add/:index',
    component: SubQuotationDesignComponent,
    resolve: {
      profileList: ProfileListResolver,
      dropdowns: AllDropdownsResolver,
      mullionList: MullionResolver,
    },
    data: { edit: false },
  },
  {
    path: 'detail/:id/super-system',
    component: SuperSystemComponent,
    // resolve: {
    //   profileList: ProfileListResolver,
    //   dropdowns: AllDropdownsResolver,
    //   mullionList: MullionResolver,
    // },
    data: { edit: false },
  },
  {
    path: 'detail/:id/edit/:subId/:index',
    component: SubQuotationDesignComponent,
    resolve: {
      details: SubQuotationDesignResolver,
      profileList: ProfileListResolver,
      dropdowns: AllDropdownsResolver,
      mullionList: MullionResolver,
    },
    data: { edit: true },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class QuotationRoutingModule {}
