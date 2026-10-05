import { NgModule } from '@angular/core';
import { RouterModule, Routes, TitleStrategy } from '@angular/router';

import { PageTitleStrategy, ShellComponent } from './containers';
import { Page404Component } from './views/pages/page404/page404.component';
import { Page500Component } from './views/pages/page500/page500.component';
import { AuthGuard } from './shared/guards/auth.guard';
import { CompanyAreaGuard } from './views/admin/platform.guard';
import { AbilityGuard } from './shared/access/ability.guard';
import { NoAccessComponent } from './shared/access/no-access.component';
import { ProfileComponent } from './views/profile/profile.component';
import { ProfileResolver } from './views/profile/profile.resolver';
import { BulkPriceUploadComponent } from './views/bulk-price-upload/bulk-price-upload.component';
import { BulkPriceUpdateResolver } from './views/bulk-price-upload/bulk-price-update.resolver';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: '',
    component: ShellComponent,
    // Nothing inside the shell is shown without a session. The guard sends the
    // visitor to sign in with ?returnUrl=, so they come back to this address.
    // The platform admin (the product owner) has no company: every address of the shell leads them to /admin.
    canActivate: [AuthGuard, CompanyAreaGuard],
    children: [
      // Menu entries of the shell. Catalogue and Settings are one page each
      // (cards U5 and U7), still served at their old addresses.
      { path: 'catalogue', redirectTo: 'masters/profile', pathMatch: 'full' },
      { path: 'settings', redirectTo: 'profile', pathMatch: 'full' },
      {
        path: 'dashboard',
        // A page needs one ability of GET me (card T117); a workshop user opens on Orders.
        canActivate: [AuthGuard, AbilityGuard],
        data: { ability: 'quotations.view' },
        loadChildren: () =>
          import('./views/dashboard/dashboard.module').then(
            (m) => m.DashboardModule
          ),
      },
      // A page the role does not have: one plain line (card T117).
      { path: 'no-access', component: NoAccessComponent, title: 'Not for your role' },
      {
        path: 'profile',
        canActivate: [AuthGuard],
        component: ProfileComponent,
        resolve: { data: ProfileResolver },
      },
      {
        path: 'customers',
        canActivate: [AbilityGuard],
        data: { ability: 'quotations.view' },
        loadChildren: () =>
          import('./views/customers/customers.module').then(
            (m) => m.CustomersModule
          ),
      },
      {
        path: 'bulk-price-update',
        component: BulkPriceUploadComponent,
        canActivate: [AbilityGuard],
        data: { edit: true, ability: 'catalogue.write' },
        resolve: { data: BulkPriceUpdateResolver },
      },
      {
        path: 'bills',
        canActivate: [AbilityGuard],
        data: { ability: 'quotations.view' },
        loadChildren: () =>
          import('./views/bills/bills.module').then((m) => m.BillsModule),
      },
      {
        // Orders and payments (card T75).
        path: 'orders',
        canActivate: [AbilityGuard],
        data: { ability: 'orders.view' },
        loadChildren: () =>
          import('./views/orders/orders.module').then((m) => m.OrdersModule),
      },
      {
        path: 'payments',
        canActivate: [AbilityGuard],
        data: { ability: 'payments.view' },
        loadChildren: () =>
          import('./views/payments/payments.module').then(
            (m) => m.PaymentsModule
          ),
      },
      {
        path: 'quotation',
        canActivate: [AbilityGuard],
        data: { ability: 'quotations.view' },
        loadChildren: () =>
          import('./views/quotation/quotation.module').then(
            (m) => m.QuotationModule
          ),
      },
      {
        // Production documents of one quotation: /production/:quotationId (card T69). No menu item; opened from the quotation page.
        path: 'production',
        canActivate: [AbilityGuard],
        data: { ability: 'production.view' },
        loadChildren: () =>
          import('./views/production/production.module').then(
            (m) => m.ProductionModule
          ),
      },
      {
        path: 'type-margin',
        canActivate: [AbilityGuard],
        data: { ability: 'prices.view_cost' },
        loadChildren: () =>
          import('./views/type-margin/type-margin.module').then(
            (m) => m.TypeMarginModule
          ),
      },
      {
        path: 'area',
        canActivate: [AbilityGuard],
        data: { ability: 'catalogue.view' },
        loadChildren: () =>
          import('./views/area/area.module').then((m) => m.AreaModule),
      },
      {
        path: 'payment-terms',
        canActivate: [AbilityGuard],
        data: { ability: 'catalogue.view' },
        loadChildren: () =>
          import('./views/payment-terms/payment-terms.module').then(
            (m) => m.PaymentTermsModule
          ),
      },
      {
        path: 'crm',
        canActivate: [AbilityGuard],
        data: { ability: 'quotations.view' },
        loadChildren: () =>
          import('./views/crm/crm.module').then((m) => m.CrmModule),
      },
      // A 3D structure is designed inside a quotation and saved as one of its lines (card T123):
      // quotation/detail/:id/structure. The old addresses of the separate area lead to the quotations.
      { path: 'structures', redirectTo: 'quotation', pathMatch: 'full' },
      { path: 'structure-designer', redirectTo: 'quotation', pathMatch: 'full' },
      {
        path: 'masters',
        canActivate: [AbilityGuard],
        data: { ability: 'catalogue.view' },
        loadChildren: () =>
          import('./views/masters/masters.module').then((m) => m.MastersModule),
      },
    ],
  },
  {
    // The platform admin's area (card T119): companies, plans, payments entered by hand. Its own guard
    // lets in the platform admin only; a company's user is shown "not allowed".
    path: 'admin',
    loadChildren: () =>
      import('./views/admin/admin.module').then((m) => m.AdminModule),
  },
  {
    path: 'auth',
    loadChildren: () =>
      import('./views/pages/pages.module').then((m) => m.PagesModule),
  },
  {
    // Dev-only playground for the standalone design canvas (Phase 1, T36).
    path: 'design-lab',
    loadChildren: () =>
      import('./views/design-lab/design-lab.module').then(
        (m) => m.DesignLabModule
      ),
    title: 'Design lab',
  },
  {
    // Every shared component and themed control on one page, for review (card U0).
    path: 'ui',
    loadChildren: () =>
      import('./views/ui-gallery/ui-gallery.module').then(
        (m) => m.UiGalleryModule
      ),
    title: 'Components',
  },
  {
    path: '404',
    component: Page404Component,
    title: 'Page not found',
  },
  {
    path: '500',
    component: Page500Component,
    title: 'Something went wrong',
  },
  {
    path: '**',
    component: Page404Component,
    title: 'Page not found',
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      scrollPositionRestoration: 'top',
      anchorScrolling: 'enabled',
      initialNavigation: 'enabledBlocking',
      // relativeLinkResolution: 'legacy'
    }),
  ],
  exports: [RouterModule],
  // Every browser tab title is built in one place: containers/shell/page-title.strategy.ts.
  providers: [{ provide: TitleStrategy, useExisting: PageTitleStrategy }],
})
export class AppRoutingModule {}
