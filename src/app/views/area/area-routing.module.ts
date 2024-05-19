import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AreaResolver } from './area.resolver';
import { AreaComponent } from './area.component';
const routes: Routes = [
  {
    path: '',
    resolve: { list: AreaResolver },
    component: AreaComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AreaRoutingModule {}
