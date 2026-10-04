import { NgModule } from '@angular/core';

import { PaymentTermsRoutingModule } from './payment-terms-routing.module';

/** Only a redirect now: see PaymentTermsCardComponent, drawn by Settings → Pricing and tax. */
@NgModule({
  imports: [PaymentTermsRoutingModule],
})
export class PaymentTermsModule {}
