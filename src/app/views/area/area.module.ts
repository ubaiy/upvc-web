import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AreaRoutingModule } from './area-routing.module';
import { AreaComponent } from './area.component';
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
@NgModule({
  declarations: [AreaComponent],
  imports: [
    AreaRoutingModule,
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
    ChartjsModule,
    AvatarModule,
    TableModule,
    WidgetsModule,
    ModalModule,
    AlertModule,
    FormsModule,
    PaginatorModule,
    ConfirmDialogModule,
    ToastModule,
    InputTextModule,
  ],
})
export class AreaModule {}
