import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MastersComponent } from './masters.component';
import { GlassResolver } from './glass.resolver';
import { HardwareResolver } from './hardware.resolver';
import { DetailComponent } from './detail/detail.component';
import { DetailResolver } from './detail/detail.resolver';
import { CostheadListResolver } from 'src/app/shared/resolver/costhead-list.resolver';
import { ProfileCategoryResolver } from 'src/app/shared/resolver/profile-category.resolver';
import { UnitResolver } from 'src/app/shared/resolver/unit.resolver';
const routes: Routes = [
  {
    path: 'profile',
    loadChildren: () =>
      import('./profile/profile.module').then((m) => m.ProfileModule),
  },
  {
    path: 'profile-color',
    loadChildren: () =>
      import('./profile-color/profile-color.module').then(
        (m) => m.ProfileColorModule
      ),
  },
  {
    path: 'glass',
    component: MastersComponent,
    title: 'Glazzing',
    resolve: { list: GlassResolver },
  },
  {
    path: 'hardware',
    component: MastersComponent,
    title: 'Hardware',
    resolve: { list: HardwareResolver },
  },
  {
    path: 'Glazzing',
    component: DetailComponent,
    resolve: {
      costheadList: CostheadListResolver,
      category: ProfileCategoryResolver,
      unitList: UnitResolver,
    },
    title: 'Glazzing Add',
  },
  {
    path: 'Glazzing/:id',
    component: DetailComponent,
    resolve: {
      data: DetailResolver,
      costheadList: CostheadListResolver,
      category: ProfileCategoryResolver,
      unitList: UnitResolver,
    },
    title: 'Glazzing Edit',
  },
  {
    path: 'Hardware',
    component: DetailComponent,
    resolve: {
      costheadList: CostheadListResolver,
      category: ProfileCategoryResolver,
      unitList: UnitResolver,
    },
    title: 'Hardware add',
  },
  {
    path: 'Hardware/:id',
    component: DetailComponent,
    resolve: {
      data: DetailResolver,
      costheadList: CostheadListResolver,
      category: ProfileCategoryResolver,
      unitList: UnitResolver,
    },
    title: 'Hardware Edit',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MastersRoutingModule {}
