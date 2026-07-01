import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { BillsRoutingModule } from './bills-routing.module';
import { ListComponent } from './list/list.component';
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
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { InputTextModule } from 'primeng/inputtext';
import { SharedComponentsModule } from '../../shared/components/shared-components.module';

@NgModule({
  declarations: [ListComponent],
  imports: [
    CommonModule,
    BillsRoutingModule,
    SharedComponentsModule,
    CardModule,
    NavModule,
    IconModule,
    TabsModule,
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
  ],
})
export class BillsModule {}
