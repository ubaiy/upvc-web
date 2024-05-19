import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TypeMarginResolver } from './type-margin.resolver';
import { TypeMarginComponent } from './type-margin.component';
const routes: Routes = [
  {
    path: '',
    resolve: { list: TypeMarginResolver },
    component: TypeMarginComponent,
    data: {
      title: `Type Margin`,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TypeMarginRoutingModule {}
