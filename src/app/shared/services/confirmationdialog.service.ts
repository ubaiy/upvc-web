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
    reject: () => void
  ) {
    this.confirmationService.confirm({
      
      header: header,
      message: message,
      icon: `pi ${icon}`,
      accept: accept,
      reject: reject,
    });
  }
}
