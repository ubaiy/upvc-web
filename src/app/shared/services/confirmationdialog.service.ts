// confirmation-dialog.service.ts
import { Injectable } from '@angular/core';
import { ConfirmationService } from 'primeng/api';

@Injectable({
  providedIn: 'root',
})
export class ConfirmationDialogService {
  constructor(private confirmationService: ConfirmationService) {}
  confirm(
    header: string,
    message: string,
    icon: string,
    accept: () => void,
    reject: () => void = () => {},
    labels: { accept: string; reject: string } = { accept: 'Yes', reject: 'Cancel' }
  ) {
    this.confirmationService.confirm({
      header: header,
      message: message,
      icon: `pi ${icon}`,
      accept: accept,
      reject: reject,
      acceptLabel: labels.accept,
      rejectLabel: labels.reject,
    });
  }

  /**
   * The one question asked before typed changes are thrown away. The title
   * says what happens, the buttons say what each one does.
   */
  discardChanges(accept: () => void) {
    this.confirm(
      'Discard your changes?',
      'What you typed here will not be saved.',
      'pi-info-circle',
      accept,
      () => {},
      { accept: 'Discard', reject: 'Keep editing' }
    );
  }
}
