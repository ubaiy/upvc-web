import { inject, NgModule } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterModule, Routes } from '@angular/router';
import { QuotationComponent } from './quotation.component';
import { SubQuotationComponent } from './sub-quotation/sub-quotation.component';
import { ProfileListResolver } from 'src/app/shared/resolver/profile-list.resolver';
import { AllDropdownsResolver } from 'src/app/shared/resolver/all-dropdowns.resolver';
import { SubQuotationDesignComponent } from './sub-quotation/sub-quotation-design/sub-quotation-design.component';
import { MullionResolver } from '../../shared/resolver/mullion.resolver';
import { SubQuotationDesignResolver } from './sub-quotation/sub-quotation-design/sub-quotation-design.resolver';

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
    // The quotation page loads its own data: skeleton, inline error, "Try again".
    path: 'detail/:id',
    component: SubQuotationComponent,
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
  {
    // A 3D structure as a line of this quotation (card T123): the shape cards, then the designer.
    // The designer and three.js are their own chunk, loaded only here.
    path: 'detail/:id/structure',
    title: '3D structure',
    loadComponent: () =>
      import('../structure-designer/structure-designer.component').then((m) => m.StructureDesignerComponent),
  },
  {
    // "Edit" on a structure line: the designer opens with the document the api keeps for that line.
    path: 'detail/:id/structure/:lineId',
    title: '3D structure',
    loadComponent: () =>
      import('../structure-designer/structure-designer.component').then((m) => m.StructureDesignerComponent),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class QuotationRoutingModule {}
