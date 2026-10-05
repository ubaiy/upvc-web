// toast.service.ts
import { Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';

/**
 * What a toast may show. The api's own text is passed on, but never an empty
 * line, "undefined", "null" or "[object Object]", and never the api's old
 * spelling "Quatation".
 */
export function toastText(message: unknown, fallback: string): string {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text || /^(undefined|null|\[object Object\])$/i.test(text)) {
    return fallback;
  }
  return text.replace(/quatation/gi, (found) => (found[0] === 'Q' ? 'Quotation' : 'quotation'));
}

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
    message = toastText(message, 'Saved');
    this.messageService.add({
      severity: 'success',
      summary: 'Success',
      detail: message,
    });
  }

  showError(message: string) {
    message = toastText(message, 'That did not work. Try again.');
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
    message = toastText(message, '');
    if (!message) {
      return;
    }
    this.messageService.add({
      severity: 'info',
      summary: 'Info',
      detail: message,
    });
  }

  showWarning(message: string) {
    message = toastText(message, '');
    if (!message) {
      return;
    }
    this.messageService.add({
      severity: 'warn',
      summary: 'Warning',
      detail: message,
    });
  }
}
