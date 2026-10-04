import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { CatalogueAdapter } from '../masters/catalogue.adapter';
import {
  PriceFactors,
  ProfileRates,
  ProfileRow,
  RateChange,
  RateChangeMode,
  SAMPLE_WINDOW,
  SampleCost,
  changedFactors,
  changedRates,
  fixSpelling,
  hasFactors,
  sampleCost,
} from '../masters/catalogue.model';

/** What the dialog tells the page after a save. */
export interface RatesUpdated {
  count: number;
  /** True when every profile was repriced, so the page reloads the list. */
  all: boolean;
  rows: ProfileRow[];
}

const FACTOR = [
  Validators.required,
  Validators.pattern(/^\d+(\.\d{1,4})?$/),
  Validators.min(0.0001),
  Validators.max(1000000),
];

/**
 * "Update rates" (card U5, gap G17): raise or lower profile rates by a
 * percentage, or set a new rate per kg, for every profile or one category,
 * with the effect on one sample window shown before anything is saved.
 *
 * This is the old Bulk Price page as a dialog. Its four factors are the fields
 * of "New rate per kg"; the API still rejects anything that is not above 0 and
 * at most 10,00,000 (audit H5), and the same limits are checked here first.
 */
@Component({
  selector: 'app-update-rates-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule, ButtonModule, SharedComponentsModule],
  templateUrl: './update-rates-dialog.component.html',
  styleUrls: ['./update-rates-dialog.component.scss'],
})
export class UpdateRatesDialogComponent implements OnChanges {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() profiles: ProfileRow[] = [];
  @Input() factors: PriceFactors | null = null;
  @Output() updated = new EventEmitter<RatesUpdated>();

  readonly fixSpelling = fixSpelling;
  readonly sample = SAMPLE_WINDOW;
  form: FormGroup = this.build();
  submitted = false;
  saving = false;
  done = 0;
  error = '';

  constructor(private fb: FormBuilder, private adapter: CatalogueAdapter) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Opened from /bulk-price-update the dialog can show before the rates have
    // loaded; start again when they arrive, unless something was typed.
    const lateFactors = changes['factors'] && this.visible && this.form.pristine && !this.saving;
    if ((changes['visible'] && this.visible) || lateFactors) {
      this.submitted = false;
      this.saving = false;
      this.done = 0;
      this.error = '';
      this.form = this.build();
    }
  }

  get mode(): RateChangeMode {
    return this.form.value.mode;
  }

  /** null = every profile. */
  get category(): string | null {
    return this.form.value.category || null;
  }

  /** A percentage needs something to move: stored factors, or rates on the rows. */
  get canUsePercent(): boolean {
    return hasFactors(this.factors);
  }

  get categories(): { value: string; count: number }[] {
    const counts = new Map<string, number>();
    this.profiles.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    return [...counts].map(([value, count]) => ({ value, count }));
  }

  get affected(): ProfileRow[] {
    const category = this.category;
    return category ? this.profiles.filter((p) => p.category === category) : this.profiles;
  }

  /** The change as typed, or null while the fields in use are not valid. */
  get change(): RateChange | null {
    const v = this.form.value;
    if (this.mode === 'percent') {
      const percent = Number(v.percent);
      if (this.form.get('percent')?.invalid || !percent || !this.factors) {
        return null;
      }
      return { mode: 'percent', category: this.category, percent, factors: this.factors };
    }
    if (['per_kg', 'rate_bar', 'color_per_kg', 'color_rate_bar'].some((k) => this.form.get(k)?.invalid)) {
      return null;
    }
    return {
      mode: 'rate',
      category: this.category,
      percent: 0,
      factors: {
        per_kg: Number(v.per_kg),
        rate_bar: Number(v.rate_bar),
        color_per_kg: Number(v.color_per_kg),
        color_rate_bar: Number(v.color_rate_bar),
      },
    };
  }

  /** The stored factors after the change; only a change to every profile moves them. */
  get nextFactors(): PriceFactors | null {
    const change = this.change;
    if (!change || change.category !== null) {
      return null;
    }
    return change.mode === 'rate' ? change.factors : this.factors ? changedFactors(this.factors, change) : null;
  }

  get preview(): SampleCost | null {
    const change = this.change;
    if (!change || !this.affected.length) {
      return null;
    }
    return sampleCost(this.affected, (p) => this.ratesFor(p, change));
  }

  bad(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.invalid && (this.submitted || control.touched);
  }

  setMode(mode: RateChangeMode): void {
    this.form.patchValue({ mode });
    this.form.markAsDirty();
    this.error = '';
  }

  close(): void {
    if (this.saving) {
      return;
    }
    this.visible = false;
    this.visibleChange.emit(false);
  }

  submit(): void {
    this.submitted = true;
    this.error = '';
    const change = this.change;
    if (this.saving) {
      return;
    }
    if (!change) {
      if (this.mode === 'percent' && Number(this.form.value.percent) === 0 && this.form.get('percent')?.valid) {
        this.error = 'Enter a percentage other than 0.';
      }
      return;
    }
    const rows = this.affected;
    if (!rows.length) {
      this.error = 'There are no profiles to update.';
      return;
    }

    this.saving = true;
    this.done = 0;
    const next = this.nextFactors;
    const save$: Observable<ProfileRow[]> = next
      ? this.adapter.updateAllRates(next).pipe(map(() => []))
      : this.adapter.saveProfileRates(rows, (p) => this.ratesFor(p, change), (done) => (this.done = done));
    save$.subscribe({
      next: (saved) => {
        this.saving = false;
        this.updated.emit({ count: rows.length, all: !!next, rows: saved });
        this.visible = false;
        this.visibleChange.emit(false);
      },
      error: (err) => {
        this.saving = false;
        const text = this.adapter.message(err, 'The rates were not updated. Try again.');
        this.error =
          !next && this.done
            ? `${text} ${this.done} of ${rows.length} profiles were updated before this; the rest are unchanged.`
            : text;
        if (!next && this.done) {
          this.updated.emit({ count: this.done, all: true, rows: [] });
        }
      },
    });
  }

  private ratesFor(profile: ProfileRow, change: RateChange): ProfileRates {
    return changedRates(profile, change, this.factors);
  }

  private build(): FormGroup {
    const fb = this.fb ?? new FormBuilder();
    const f = this.factors;
    return fb.group({
      category: [''],
      mode: [hasFactors(f) ? 'percent' : 'rate'],
      percent: [
        '',
        [Validators.required, Validators.pattern(/^[+-]?\d+(\.\d{1,2})?$/), Validators.min(-90), Validators.max(500)],
      ],
      per_kg: [f?.per_kg ?? '', FACTOR],
      rate_bar: [f?.rate_bar ?? '', FACTOR],
      color_per_kg: [f?.color_per_kg ?? '', FACTOR],
      color_rate_bar: [f?.color_rate_bar ?? '', FACTOR],
    });
  }
}
