// toast.service.ts
import { Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  // Suppress identical error toasts fired in quick succession (e.g. the
  // shared status-0 interceptor handler and a component's own else-branch
  // both reporting the same API message).
  private lastErrorMessage = '';
  private lastErrorAt = 0;

  constructor(private messageService: MessageService) {}

  showSuccess(message: string) {
    this.messageService.add({
      severity: 'success',
      summary: 'Success',
      detail: message,
    });
  }

  showError(message: string) {
    const now = Date.now();
    if (message && message === this.lastErrorMessage && now - this.lastErrorAt < 1500) {
      return;
    }
    this.lastErrorMessage = message;
    this.lastErrorAt = now;
    this.messageService.add({
      severity: 'error',
      summary: 'Error',
      detail: message,
    });
  }

  showInfo(message: string) {
    this.messageService.add({
      severity: 'info',
      summary: 'Info',
      detail: message,
    });
  }

  showWarning(message: string) {
    this.messageService.add({
      severity: 'warn',
      summary: 'Warning',
      detail: message,
    });
  }
}
