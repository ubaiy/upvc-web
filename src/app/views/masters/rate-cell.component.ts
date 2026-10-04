import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { formatInr } from '../../shared/pipes/inr.pipe';
import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { MAX_RATE, parseAmount } from './catalogue.model';

export type RateCellState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * A rate that is edited where it stands in the table (card U5, gap G17).
 *
 * At rest it reads like the mockup's text, "₹212.80 / m". Click or Tab into it
 * to type; Enter or leaving the box saves, Escape puts the old rate back.
 */
@Component({
  selector: 'app-rate-cell',
  standalone: true,
  imports: [CommonModule, SharedComponentsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="rate-cell" [class.is-invalid]="invalid || state === 'error'" [class.is-busy]="state === 'saving'">
      <input
        #box
        class="num"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        [attr.aria-label]="label"
        [attr.aria-invalid]="invalid || state === 'error' ? 'true' : null"
        [attr.title]="invalid ? hint : error || null"
        [disabled]="state === 'saving'"
        [value]="editing ? draft : shown"
        (focus)="begin(box)"
        (input)="draft = box.value; invalid = false"
        (keydown.enter)="box.blur()"
        (keydown.escape)="cancel(box)"
        (blur)="commit()"
      />
      <span class="per" aria-hidden="true">/ {{ unit }}</span>
      <span class="flag" aria-hidden="true">
        <app-icon *ngIf="state === 'saved'" name="check" [size]="14"></app-icon>
        <app-icon *ngIf="state === 'saving'" name="loader" [size]="14" class="spin"></app-icon>
        <app-icon *ngIf="state === 'error' || invalid" name="circle-alert" [size]="14"></app-icon>
      </span>
      <span class="sr-only" role="status">{{ state === 'saved' ? 'Saved' : state === 'error' ? error : invalid ? hint : '' }}</span>
    </span>
  `,
  styles: [
    `
      :host { display: inline-block; }
      .rate-cell { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; white-space: nowrap; }
      input {
        width: 88px; height: 28px; padding-inline: 6px; text-align: end; font: inherit; color: var(--c-text);
        background: transparent; border: 1px solid transparent; border-radius: var(--r-sm);
      }
      input:hover { border-color: var(--c-border-strong); background: var(--c-surface); }
      input:focus { outline: none; border-color: var(--c-accent); box-shadow: var(--focus-ring); background: var(--c-surface); }
      .is-invalid input { border-color: var(--c-danger); background: var(--c-surface); }
      .is-busy input { color: var(--c-text-3); }
      .per { color: var(--c-text-3); font-size: var(--fs-12); min-width: 36px; text-align: start; }
      .flag { width: 14px; display: inline-flex; color: var(--c-success); }
      .is-invalid .flag { color: var(--c-danger); }
      .is-busy .flag { color: var(--c-text-3); }
      .spin { animation: rate-spin 1s linear infinite; }
      @keyframes rate-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
      /* Touch: the rate box is the control of the row. */
      @media (max-width: 1024px), (pointer: coarse) { input { height: 44px; } }
    `,
  ],
})
export class RateCellComponent {
  @Input() value: number | null = null;
  /** What the rate is per: "m", "sq m", "unit". */
  @Input() unit = 'm';
  /** Accessible name, e.g. "Rate per metre for Sliding sash". */
  @Input() label = 'Rate';
  @Input() state: RateCellState = 'idle';
  /** The server's words when the save failed. */
  @Input() error = '';
  @Output() save = new EventEmitter<number>();

  editing = false;
  invalid = false;
  draft = '';
  readonly hint = 'Enter a rate above 0, up to 10,00,000.';

  get shown(): string {
    return formatInr(this.value);
  }

  begin(box: HTMLInputElement): void {
    if (this.editing) {
      return;
    }
    this.editing = true;
    this.draft = this.value == null ? '' : String(this.value);
    box.value = this.draft;
    box.select();
  }

  cancel(box: HTMLInputElement): void {
    this.draft = this.value == null ? '' : String(this.value);
    this.invalid = false;
    box.blur();
  }

  commit(): void {
    if (!this.editing) {
      return;
    }
    const amount = parseAmount(this.draft);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_RATE) {
      // Leaving the box empty or unchanged is not a mistake; a bad number is.
      this.invalid = this.draft.trim() !== '' && amount !== Number(this.value);
      this.editing = this.invalid;
      return;
    }
    this.editing = false;
    this.invalid = false;
    const rounded = Math.round(amount * 100) / 100;
    if (rounded !== Number(this.value)) {
      this.save.emit(rounded);
    }
  }
}
