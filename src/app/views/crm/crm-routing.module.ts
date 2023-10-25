import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'footer',
    loadChildren: () =>
      import('./footer/footer.module').then((m) => m.FooterModule),
  },
  {
    path: 'header',
    loadChildren: () =>
      import('./header/header.module').then((m) => m.HeaderModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CrmRoutingModule {}
