import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProfileColorRoutingModule } from './profile-color-routing.module';
import { ListComponent } from './list/list.component';
import { DetailComponent } from './detail/detail.component';

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
import { IconModule } from '@coreui/icons-angular';
import { TableModule } from 'primeng/table';
import { PaginatorModule } from 'primeng/paginator';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { InputTextModule } from 'primeng/inputtext';
@NgModule({
  declarations: [ListComponent, DetailComponent],
  imports: [
    CommonModule,
    ProfileColorRoutingModule,
    IconModule,
    TableModule,
    PaginatorModule,
    ButtonModule,
    ConfirmDialogModule,
    ToastModule,
    InputTextModule,
    ReactiveFormsModule,
    FormsModule,
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
  ],
})
export class ProfileColorModule {}
