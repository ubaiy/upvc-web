import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
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

import { WidgetsModule } from '../widgets/widgets.module';
import { TypeMarginRoutingModule } from './type-margin-routing.module';
import { TypeMarginComponent } from './type-margin.component';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { PaginatorModule } from 'primeng/paginator';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { InputTextModule } from 'primeng/inputtext';
import { SharedComponentsModule } from '../../shared/components/shared-components.module';
@NgModule({
  imports: [
    TypeMarginRoutingModule,
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
    ChartjsModule,
    AvatarModule,
    WidgetsModule,
    ModalModule,
    AlertModule,
    FormsModule,
    TableModule,
    TooltipModule,
    PaginatorModule,
    ButtonModule,
    ConfirmDialogModule,
    ToastModule,
    InputTextModule
  ],
  declarations: [TypeMarginComponent],
})
export class TypeMarginModule {}
