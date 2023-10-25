import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MastersRoutingModule } from './masters-routing.module';
import { MastersComponent } from './masters.component';
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
import { TableModule } from 'primeng/table';
import { PaginatorModule } from 'primeng/paginator';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { DetailComponent } from './detail/detail.component';
import { InputTextModule } from 'primeng/inputtext';
@NgModule({
  declarations: [MastersComponent, DetailComponent],
  imports: [
    MastersRoutingModule,
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
    ModalModule,
    AlertModule,
    FormsModule,
    InputTextModule,
  ],
})
export class MastersModule {}
