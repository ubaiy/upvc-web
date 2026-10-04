import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MenuModule } from 'primeng/menu';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { AccountPaymentsComponent } from './shared/account-payments.component';
import { DocumentPreviewComponent } from './shared/document-preview.component';
import { ReasonDialogComponent } from './shared/reason-dialog.component';
import { RecordPaymentComponent } from './shared/record-payment.component';

const COMPONENTS = [AccountPaymentsComponent, DocumentPreviewComponent, ReasonDialogComponent, RecordPaymentComponent];

/**
 * The pieces of Payments another screen can place on its own page, without
 * the payments routes: <app-account-payments> (the payments of an order or a
 * bill, with "Record payment"), <app-record-payment> (the dialog alone),
 * <app-document-preview> and <app-reason-dialog>. The order page imports this.
 */
@NgModule({
  declarations: COMPONENTS,
  imports: [CommonModule, FormsModule, RouterModule, MenuModule, SharedComponentsModule],
  exports: COMPONENTS,
})
export class PaymentsSharedModule {}
