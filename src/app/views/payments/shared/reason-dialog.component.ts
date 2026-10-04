import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';

import { keepFocusInside } from './focus-trap';

/**
 * A small "are you sure" dialog that also takes a reason: cancelling an
 * order, cancelling a wrong payment entry. The reason is optional; the api
 * keeps it on the record.
 */
@Component({
  selector: 'app-reason-dialog',
  template: `
    <div class="backdrop" (click)="close()"></div>
    <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="reason-title" (ngSubmit)="submit()">
      <div class="dialog-head">
        <h2 id="reason-title">{{ title }}</h2>
        <p class="muted" *ngIf="text">{{ text }}</p>
      </div>
      <div class="dialog-body">
        <app-callout tone="danger" *ngIf="error">{{ error }}</app-callout>
        <label class="field">
          <span class="label">{{ label }}</span>
          <textarea
            #reasonBox
            class="input reason"
            name="reason"
            rows="3"
            maxlength="191"
            [(ngModel)]="reason"
            [disabled]="busy"
          ></textarea>
          <span class="hint">Optional. Kept on the record.</span>
        </label>
      </div>
      <div class="dialog-foot">
        <button type="button" class="btn btn-secondary btn-lg" [disabled]="busy" (click)="close()">{{ keepLabel }}</button>
        <button type="submit" class="btn btn-danger btn-lg" [disabled]="busy">
          {{ busy ? 'Working…' : confirmLabel }}
        </button>
      </div>
    </form>
  `,
  styles: [
    `
      :host { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center; padding: var(--s-4); overflow-y: auto; }
      .backdrop { position: fixed; inset: 0; background: rgba(20, 24, 28, 0.4); }
      .dialog { position: relative; }
      h2 { margin: 0 0 var(--s-1); font-size: var(--fs-16); }
      p { margin: 0; }
      .reason { height: auto; padding-block: var(--s-2); resize: vertical; }
      app-callout { margin-block-end: var(--s-3); }
    `,
  ],
})
export class ReasonDialogComponent implements AfterViewInit {
  @Input() title = '';
  @Input() text = '';
  @Input() label = 'Reason';
  @Input() confirmLabel = 'Cancel it';
  @Input() keepLabel = 'Keep it';
  /** True while the request runs: the buttons wait. */
  @Input() busy = false;
  /** The api's refusal, shown in the dialog so the reason typed is not lost. */
  @Input() error = '';

  @Output() confirmed = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('reasonBox') reasonBox?: ElementRef<HTMLTextAreaElement>;

  reason = '';

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    setTimeout(() => this.reasonBox?.nativeElement.focus());
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

  submit(): void {
    if (!this.busy) {
      this.confirmed.emit(this.reason.trim());
    }
  }
}
