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
import { PaginatorModule } from 'primeng/paginator';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { InputTextModule } from 'primeng/inputtext';
import { SubQuotationComponent } from './sub-quotation/sub-quotation.component';
import { AddComponent } from './add/add.component';
import { SubQuotationDetailComponent } from './sub-quotation/sub-quotation-detail/sub-quotation-detail.component';
import { CheckboxModule } from 'primeng/checkbox';
import { PrintQuotationPdfComponent } from './sub-quotation/print-quotation-pdf/print-quotation-pdf.component';
import { DialogService, DynamicDialogModule } from 'primeng/dynamicdialog';
import { DetailComponent } from './sub-quotation/detail/detail.component';
import { DialogModule } from 'primeng/dialog';
import { DesignComponent } from './sub-quotation/design/design.component';
import { InputNumberModule } from 'primeng/inputnumber';

@NgModule({
  declarations: [
    QuotationComponent,
    SubQuotationComponent,
    AddComponent,
    SubQuotationDetailComponent,
    PrintQuotationPdfComponent,
    DetailComponent,
    DesignComponent,
  ],
  imports: [
    QuotationRoutingModule,
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
    WidgetsModule,
    ModalModule,
    AlertModule,
    FormsModule,
    InputTextModule,
    CheckboxModule,
    DynamicDialogModule,
    DialogModule,
    InputNumberModule,
  ],
  providers: [DialogService],
})
export class QuotationModule {}
