import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuotationRoutingModule } from './quotation-routing.module';
import { QuotationComponent } from './quotation.component';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import {
  CardModule,
  NavModule,
  TabsModule,
  GridModule,
  ProgressModule,
  FormModule,
  ButtonGroupModule,
  AvatarModule,
  ModalModule,
  AlertModule,
} from '@coreui/angular';
import { ChartjsModule } from '@coreui/angular-chartjs';
import { IconModule } from '@coreui/icons-angular';
import { WidgetsModule } from '../widgets/widgets.module';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { PaginatorModule } from 'primeng/paginator';
// import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { InputTextModule } from 'primeng/inputtext';
import { SubQuotationComponent } from './sub-quotation/sub-quotation.component';
import { QuotationDialogComponent } from './add/quotation-dialog.component';
import { DuplicateQuotationDialogComponent } from './add/duplicate-quotation-dialog.component';
import { MenuModule } from 'primeng/menu';
import { CheckboxModule } from 'primeng/checkbox';
import { SendQuotationDialogComponent } from './sub-quotation/print-quotation-pdf/send-quotation-dialog.component';
import { DialogService, DynamicDialogModule } from 'primeng/dynamicdialog';
import { SummaryDialogComponent } from './sub-quotation/detail/summary-dialog.component';
import { DuplicateDialogComponent } from './sub-quotation/detail/duplicate-dialog.component';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { DropdownModule } from 'primeng/dropdown';
import { SubQuotationDesignComponent } from './sub-quotation/sub-quotation-design/sub-quotation-design.component';
import { ButtonModule } from '@coreui/angular';
import { SharedComponentsModule } from '../../shared/components/shared-components.module';
@NgModule({
  declarations: [
    QuotationComponent,
    SubQuotationComponent,
    QuotationDialogComponent,
    DuplicateQuotationDialogComponent,
    SendQuotationDialogComponent,
    SummaryDialogComponent,
    DuplicateDialogComponent,
    SubQuotationDesignComponent,
  ],
  imports: [
    QuotationRoutingModule,
    SharedComponentsModule,
    CardModule,
    NavModule,
    IconModule,
    TabsModule,
    CommonModule,
    GridModule,
    ProgressModule,
    ReactiveFormsModule,
    ButtonModule,
    FormModule,
    ButtonModule,
    ButtonGroupModule,
    PaginatorModule,
    ConfirmDialogModule,
    ToastModule,
    ChartjsModule,
    AvatarModule,
    TableModule,
    TooltipModule,
    WidgetsModule,
    ModalModule,
    AlertModule,
    FormsModule,
    InputTextModule,
    CheckboxModule,
    DynamicDialogModule,
    DialogModule,
    InputNumberModule,
    DropdownModule,
    ButtonModule,
    MenuModule,
  ],
  providers: [DialogService],
})
export class QuotationModule {}
