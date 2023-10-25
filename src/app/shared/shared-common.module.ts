import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthGuard } from './guards/auth.guard';
import { LogoutGuard } from './guards/logout.guard';
import { SharedPipesModule } from './pipes/shared-pipes.module';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmationDialogService } from './services/confirmationdialog.service';
import { ToastService } from './services/toast.service';
@NgModule({
  declarations: [],
  imports: [CommonModule, ConfirmDialogModule, ToastModule],
  providers: [
    AuthGuard,
    LogoutGuard,
    SharedPipesModule,
    ConfirmationService,
    MessageService,
    ConfirmationDialogService,
    ToastService,
  ],
  exports: [],
})
export class SharedCommonModule {}
