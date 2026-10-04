import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { DropdownModule } from 'primeng/dropdown';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ConfirmDialogModule,
    ToastModule,
    DropdownModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  // Nothing is provided here. MessageService and ConfirmationService are
  // provided once, in AppModule: a module that provides them hands every lazy
  // module that imports it a private copy, cut off from the one <p-toast> and
  // <p-confirmDialog> in AppComponent. The guards and the two wrapper services
  // are `providedIn: 'root'`.
  providers: [],
  exports: [],
})
export class SharedCommonModule {}
