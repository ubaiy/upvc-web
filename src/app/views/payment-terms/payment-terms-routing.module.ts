import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PaymentTermsComponent } from './payment-terms.component';
import { PaymentTermsResolver } from './payment-terms.resolver';
const routes: Routes = [
  {
    path: '',
    resolve: { list: PaymentTermsResolver },
    component: PaymentTermsComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PaymentTermsRoutingModule {}
