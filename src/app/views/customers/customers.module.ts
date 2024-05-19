import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CustomersRoutingModule } from './customers-routing.module';
import { CustomersComponent } from './customers.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import {
  AvatarModule,
  ButtonGroupModule,
  CardModule,
  FormModule,
  GridModule,
  NavModule,
  ProgressModule,
  TabsModule,
  ModalModule,
  AlertModule,
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { ChartjsModule } from '@coreui/angular-chartjs';
import { TableModule } from 'primeng/table';
import { PaginatorModule } from 'primeng/paginator';
import { ButtonModule } from 'primeng/button';
import { WidgetsModule } from '../widgets/widgets.module';
import { DetailsComponent } from './details/details.component';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
@NgModule({
  imports: [
    CustomersRoutingModule,
    ToastModule,
    CardModule,
    PaginatorModule,
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
    ChartjsModule,
    AvatarModule,
    TableModule,
    WidgetsModule,
    ModalModule,
    AlertModule,
    ConfirmDialogModule,
    FormsModule,
    DialogModule,
    InputTextModule,
  ],
  declarations: [CustomersComponent, DetailsComponent],
})
export class CustomersModule {}
