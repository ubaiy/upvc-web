import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';

import { keepFocusInside } from './focus-trap';

/**
 * A small "are you sure" dialog that also takes a reason: cancelling an
 * order, cancelling a wrong payment entry. The api keeps the reason on the
 * record. It is optional unless the screen sets `required`.
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
            [attr.aria-required]="required ? 'true' : null"
            [attr.aria-invalid]="missing ? 'true' : null"
            (ngModelChange)="missing = false"
          ></textarea>
          <span class="hint field-error" role="alert" *ngIf="missing">Write the reason in a few words.</span>
          <span class="hint" *ngIf="!missing">{{ required ? 'Kept on the record.' : 'Optional. Kept on the record.' }}</span>
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
      :host { position: fixed; inset: 0; z-index: 1100; display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; padding: var(--s-4); overflow-y: auto; }
      .backdrop { position: fixed; inset: 0; background: rgba(20, 24, 28, 0.4); }
      .dialog { position: relative; }
      h2 { margin: 0 0 var(--s-1); font-size: var(--fs-16); }
      p { margin: 0; }
      .reason { height: auto; padding-block: var(--s-2); resize: vertical; }
      app-callout { margin-block-end: var(--s-3); }
      .field-error { color: var(--c-danger); }
    `,
  ],
})
export class ReasonDialogComponent implements AfterViewInit {
  @Input() title = '';
  @Input() text = '';
  @Input() label = 'Reason';
  @Input() confirmLabel = 'Cancel it';
  @Input() keepLabel = 'Keep it';
  /** True where the step is not taken without a reason (cancelling an order). */
  @Input() required = false;
  /** True while the request runs: the buttons wait. */
  @Input() busy = false;
  /** The api's refusal, shown in the dialog so the reason typed is not lost. */
  @Input() error = '';

  @Output() confirmed = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('reasonBox') reasonBox?: ElementRef<HTMLTextAreaElement>;

  reason = '';
  /** A required reason was left empty. */
  missing = false;

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
    if (this.busy) {
      return;
    }
    if (this.required && !this.reason.trim()) {
      this.missing = true;
      this.reasonBox?.nativeElement.focus();
      return;
    }
    this.confirmed.emit(this.reason.trim());
  }
}
