import { ChangeDetectionStrategy, Component, HostListener } from '@angular/core';

import { UndoService } from '../../services/undo.service';

/**
 * The toast with "Undo" (see UndoService). One instance, in AppComponent.
 * Ctrl Z takes the action back too, unless the user is typing in a field.
 */
@Component({
  selector: 'app-undo-toast',
  template: `
    <div class="undo-live" role="status" aria-live="polite">
      <div
        class="toast undo-toast"
        *ngIf="undo.offer$ | async as offer"
        (mouseenter)="undo.hold()"
        (mouseleave)="undo.release()"
        (focusin)="undo.hold()"
        (focusout)="undo.release()"
      >
        <span class="grow">{{ offer.message }}</span>
        <button type="button" class="toast-action" (click)="undo.undo()">{{ offer.actionLabel }}</button>
        <button type="button" class="toast-close" aria-label="Dismiss" (click)="undo.flush()">
          <app-icon name="x"></app-icon>
        </button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UndoToastComponent {
  constructor(public undo: UndoService) {}

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.undo.open || event.key.toLowerCase() !== 'z' || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) {
      return; // the field's own undo
    }
    event.preventDefault();
    this.undo.undo();
  }
}
