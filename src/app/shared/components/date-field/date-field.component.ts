import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, ViewChild, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** '2026-10-05' -> '05/10/2026'; anything else -> ''. */
export function isoToDisplay(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** '05/10/2026' (also 5-10-2026, 5.10.2026) -> '2026-10-05'; an incomplete or impossible date -> ''. */
export function displayToIso(text: string): string {
  const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec((text || '').trim());
  if (!m) {
    return '';
  }
  const day = +m[1];
  const month = +m[2];
  const year = +m[3];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return '';
  }
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The one date field of the app. It reads and writes the same value a native
 * date input does ('2026-10-05', or '' when empty) and always shows it as
 * dd/mm/yyyy, whatever the language of the browser. The date can be typed, or
 * picked from the browser's calendar with the button.
 *
 *   <app-date-field inputId="pay-date" name="date" [(ngModel)]="date" [max]="today" [invalid]="!!dateMessage"></app-date-field>
 *
 * Without a form: [date]="from" (dateChange)="setFrom($event)".
 *
 * A half-typed date changes nothing: the value stays what it was, and the
 * field goes back to it when the user leaves.
 */
@Component({
  selector: 'app-date-field',
  template: `
    <input
      #text
      class="input date-text"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      maxlength="10"
      placeholder="dd/mm/yyyy"
      [id]="inputId"
      [value]="shown"
      [disabled]="disabled"
      [class.is-invalid]="invalid"
      [attr.aria-invalid]="invalid ? 'true' : null"
      [attr.aria-describedby]="describedBy || null"
      (input)="onType(text)"
      (blur)="onLeave()"
    />
    <button type="button" class="date-pick" aria-label="Pick a date from the calendar" [disabled]="disabled" (click)="openPicker()">
      <app-icon name="calendar"></app-icon>
    </button>
    <input
      #native
      class="date-native"
      type="date"
      tabindex="-1"
      aria-hidden="true"
      [attr.min]="min || null"
      [attr.max]="max || null"
      [value]="value"
      [disabled]="disabled"
      (change)="onPicked(native.value)"
    />
  `,
  styles: [
    `
      :host { position: relative; display: block; }
      .date-text { padding-inline-end: var(--h-control); font-variant-numeric: tabular-nums; }
      .date-pick {
        position: absolute; inset-block: 1px; inset-inline-end: 1px; width: calc(var(--h-control) - 2px);
        display: inline-flex; align-items: center; justify-content: center;
        border: 0; border-radius: var(--r-sm); background: transparent; color: var(--c-text-2); cursor: pointer;
      }
      .date-pick:hover:not(:disabled) { color: var(--c-text); background: var(--c-surface-2); }
      .date-pick:focus-visible { outline: none; box-shadow: var(--focus-ring); }
      .date-pick:disabled { cursor: default; opacity: .5; }
      /* Only the browser's calendar is used from the native input; it is never seen or reached by Tab. */
      .date-native { position: absolute; inset-inline-end: 0; bottom: 0; width: 1px; height: 1px; padding: 0; border: 0; opacity: 0; pointer-events: none; }
    `,
  ],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateFieldComponent), multi: true }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateFieldComponent implements ControlValueAccessor {
  /** The id of the text box, for <label for>. */
  @Input() inputId = '';
  /** Earliest and latest day the calendar offers, as yyyy-mm-dd. The page still checks a typed date itself. */
  @Input() min: string | null = '';
  @Input() max: string | null = '';
  @Input() invalid: boolean | string | null = false;
  @Input() describedBy = '';
  @Input() disabled = false;

  /** For a field outside a form: the value in, and each new value out. */
  @Input() set date(value: string | null) {
    this.writeValue(value);
  }
  @Output() dateChange = new EventEmitter<string>();

  @ViewChild('native') private native?: ElementRef<HTMLInputElement>;

  /** yyyy-mm-dd, or ''. */
  value = '';
  /** What the text box shows. */
  shown = '';

  private changed: (value: string) => void = () => {};
  private touched: () => void = () => {};

  constructor(private cdr: ChangeDetectorRef) {}

  writeValue(value: string | null): void {
    this.value = displayToIso(isoToDisplay(value));
    this.shown = isoToDisplay(this.value);
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.changed = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.touched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    this.cdr.markForCheck();
  }

  onType(box: HTMLInputElement): void {
    // Digits only, with the two slashes put in for the user: 05102026 -> 05/10/2026.
    const typed = box.value;
    let text = typed.replace(/[.\-]/g, '/').replace(/[^\d/]/g, '');
    if (!text.includes('/')) {
      const d = text.slice(0, 8);
      text = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    }
    if (text !== typed) {
      box.value = text;
    }
    this.shown = text;
    const iso = displayToIso(text);
    if (iso || !text) {
      this.set(iso);
    }
  }

  onLeave(): void {
    // A half-typed date is dropped: the field shows the value it still has.
    this.shown = isoToDisplay(this.value);
    this.touched();
    this.cdr.markForCheck();
  }

  onPicked(iso: string): void {
    this.set(iso);
    this.shown = isoToDisplay(this.value);
    this.touched();
    this.cdr.markForCheck();
  }

  openPicker(): void {
    const input = this.native?.nativeElement as (HTMLInputElement & { showPicker?: () => void }) | undefined;
    if (!input) {
      return;
    }
    try {
      input.showPicker ? input.showPicker() : input.click();
    } catch {
      input.focus();
    }
  }

  private set(iso: string): void {
    if (iso === this.value) {
      return;
    }
    this.value = iso;
    this.changed(iso);
    this.dateChange.emit(iso);
  }
}
