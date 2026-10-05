import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';

import { WriteDirective } from '../../shared/access/write.directive';
import { keepFocusInside } from '../payments/shared/focus-trap';

/**
 * A small "are you sure" before a step that cannot be taken back in one tap:
 * issuing a tax invoice, closing an order that still owes money, replacing a
 * production job. Standalone, so any page can import it:
 *
 *   <app-confirm-dialog *ngIf="asking" title="Create the bill for Q-0011?"
 *     confirmLabel="Create bill" (confirmed)="createBill()" (closed)="asking = false">
 *     <dl class="dl"> … number and total … </dl>
 *   </app-confirm-dialog>
 *
 * Focus starts on the safe button, Tab stays inside, Escape closes.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, WriteDirective],
  template: `
    <div class="backdrop" (click)="close()"></div>
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">
      <div class="dialog-head">
        <h2 id="confirm-title">{{ title }}</h2>
      </div>
      <div class="dialog-body" id="confirm-text">
        <p class="muted" *ngIf="text">{{ text }}</p>
        <ng-content></ng-content>
        <p class="refusal" role="alert" *ngIf="error">{{ error }}</p>
      </div>
      <div class="dialog-foot">
        <button #keep type="button" class="btn btn-secondary btn-lg" [disabled]="busy" (click)="close()">{{ keepLabel }}</button>
        <button
          type="button"
          class="btn btn-lg"
          [ngClass]="danger ? 'btn-danger' : 'btn-primary'"
          [disabled]="busy"
          [appWrite]="ability"
          (click)="confirm()"
        >
          {{ busy ? 'Working…' : confirmLabel }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host { position: fixed; inset: 0; z-index: 1100; display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; padding: var(--s-4); overflow-y: auto; }
      .backdrop { position: fixed; inset: 0; background: rgba(20, 24, 28, 0.4); }
      .dialog { position: relative; }
      h2 { margin: 0; font-size: var(--fs-16); }
      p { margin: 0; }
      .dialog-body { display: grid; gap: var(--s-3); }
      .refusal { color: var(--c-danger); }
    `,
  ],
})
export class ConfirmDialogComponent implements AfterViewInit {
  /** What the confirmed action needs ("orders.write"): off in a read-only account, like the button that opened the dialog. */
  @Input() ability: string | null = null;
  @Input() title = '';
  @Input() text = '';
  @Input() confirmLabel = 'Yes';
  @Input() keepLabel = 'Not now';
  /** Red confirm button, for a step that removes or cancels something. */
  @Input() danger = false;
  /** True while the request runs: the buttons wait. */
  @Input() busy = false;
  /** The api's refusal, shown in the dialog. */
  @Input() error = '';

  @Output() confirmed = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('keep') keep?: ElementRef<HTMLButtonElement>;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    setTimeout(() => this.keep?.nativeElement.focus());
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    keepFocusInside(event, this.host.nativeElement);
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (!this.busy) {
      this.closed.emit();
    }
  }

  confirm(): void {
    if (!this.busy) {
      this.confirmed.emit();
    }
  }
}
