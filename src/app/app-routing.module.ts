import { NgModule } from '@angular/core';
import { RouterModule, Routes, TitleStrategy } from '@angular/router';

import { PageTitleStrategy, ShellComponent } from './containers';
import { Page404Component } from './views/pages/page404/page404.component';
import { Page500Component } from './views/pages/page500/page500.component';
import { AuthGuard } from './shared/guards/auth.guard';
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
    canActivate: [AuthGuard],
    children: [
      // Menu entries of the shell. Catalogue and Settings are one page each
      // (cards U5 and U7), still served at their old addresses.
      { path: 'catalogue', redirectTo: 'masters/profile', pathMatch: 'full' },
      { path: 'settings', redirectTo: 'profile', pathMatch: 'full' },
      {
        path: 'dashboard',
        canActivate: [AuthGuard],
        loadChildren: () =>
          import('./views/dashboard/dashboard.module').then(
            (m) => m.DashboardModule
          ),
      },
      {
        path: 'profile',
        canActivate: [AuthGuard],
        component: ProfileComponent,
        resolve: { data: ProfileResolver },
      },
      {
        path: 'customers',
        loadChildren: () =>
          import('./views/customers/customers.module').then(
            (m) => m.CustomersModule
          ),
      },
      {
        path: 'bulk-price-update',
        component: BulkPriceUploadComponent,
        data: { edit: true },
        resolve: { data: BulkPriceUpdateResolver },
      },
      {
        path: 'bills',
        loadChildren: () =>
          import('./views/bills/bills.module').then((m) => m.BillsModule),
      },
      {
        path: 'quotation',
        loadChildren: () =>
          import('./views/quotation/quotation.module').then(
            (m) => m.QuotationModule
          ),
      },
      {
        path: 'type-margin',
        loadChildren: () =>
          import('./views/type-margin/type-margin.module').then(
            (m) => m.TypeMarginModule
          ),
      },
      {
        path: 'area',
        loadChildren: () =>
          import('./views/area/area.module').then((m) => m.AreaModule),
      },
      {
        path: 'payment-terms',
        loadChildren: () =>
          import('./views/payment-terms/payment-terms.module').then(
            (m) => m.PaymentTermsModule
          ),
      },
      {
        path: 'crm',
        loadChildren: () =>
          import('./views/crm/crm.module').then((m) => m.CrmModule),
      },
      {
        path: 'masters',
        loadChildren: () =>
          import('./views/masters/masters.module').then((m) => m.MastersModule),
      },
      {
        path: 'theme',
        loadChildren: () =>
          import('./views/theme/theme.module').then((m) => m.ThemeModule),
      },
      {
        path: 'base',
        loadChildren: () =>
          import('./views/base/base.module').then((m) => m.BaseModule),
      },
      {
        path: 'buttons',
        loadChildren: () =>
          import('./views/buttons/buttons.module').then((m) => m.ButtonsModule),
      },
      {
        path: 'forms',
        loadChildren: () =>
          import('./views/forms/forms.module').then((m) => m.CoreUIFormsModule),
      },
      {
        path: 'charts',
        loadChildren: () =>
          import('./views/charts/charts.module').then((m) => m.ChartsModule),
      },
      {
        path: 'icons',
        loadChildren: () =>
          import('./views/icons/icons.module').then((m) => m.IconsModule),
      },
      {
        path: 'notifications',
        loadChildren: () =>
          import('./views/notifications/notifications.module').then(
            (m) => m.NotificationsModule
          ),
      },
      {
        path: 'widgets',
        loadChildren: () =>
          import('./views/widgets/widgets.module').then((m) => m.WidgetsModule),
      },
    ],
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
