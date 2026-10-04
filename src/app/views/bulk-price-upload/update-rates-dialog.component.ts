import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, Subscription, of, timer } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { CatalogueAdapter } from '../masters/catalogue.adapter';
import {
  PriceFactors,
  ProfileRow,
  RateChangeMode,
  RatePreview,
  RateRequest,
  SAMPLE_WINDOW,
  SampleCost,
  fixSpelling,
  hasFactors,
  sampleCost,
} from '../masters/catalogue.model';

/** What the dialog tells the page after a save. */
export interface RatesUpdated {
  count: number;
}

/** Typing pauses this long before the API is asked for a preview. */
export const PREVIEW_DELAY_MS = 350;

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
 * The figures are the API's: `setting/change-rates` is asked with `dry_run`
 * for the preview and once more, without it, to save (card T76). The limits of
 * the API (audit H5) are checked here first.
 */
@Component({
  selector: 'app-update-rates-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule, ButtonModule, SharedComponentsModule],
  templateUrl: './update-rates-dialog.component.html',
  styleUrls: ['./update-rates-dialog.component.scss'],
})
export class UpdateRatesDialogComponent implements OnChanges, OnDestroy {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() profiles: ProfileRow[] = [];
  @Input() factors: PriceFactors | null = null;
  @Output() updated = new EventEmitter<RatesUpdated>();

  readonly fixSpelling = fixSpelling;
  readonly sample = SAMPLE_WINDOW;
  form: FormGroup = this.build();
  categories: { value: string; count: number }[] = [];
  submitted = false;
  saving = false;
  error = '';
  /** The API's answer to the change as typed; null until it arrives. */
  result: RatePreview | null = null;
  previewing = false;
  previewError = '';

  private asked = new Subject<RateRequest | null>();
  private subs = new Subscription();
  private formSub?: Subscription;

  constructor(private fb: FormBuilder, private adapter: CatalogueAdapter) {
    this.subs.add(
      this.asked
        .pipe(
          map((request) => (request ? JSON.stringify(request) : '')),
          distinctUntilChanged(),
          tap((key) => {
            this.result = null;
            this.previewError = '';
            this.previewing = !!key;
          }),
          // Each new entry drops the one before it, so only the last pause asks the API.
          switchMap((key) =>
            key
              ? timer(PREVIEW_DELAY_MS).pipe(
                  switchMap(() => this.adapter.changeRates(JSON.parse(key), true)),
                  catchError((err) => {
                    this.previewError = this.adapter.message(err, 'The preview could not be worked out.');
                    return of(null);
                  })
                )
              : of(null)
          )
        )
        .subscribe((result) => {
          this.result = result;
          this.previewing = false;
        })
    );
    this.watch();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.formSub?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['profiles']) {
      this.categories = this.listCategories();
    }
    // Opened from /bulk-price-update the dialog can show before the rates have
    // loaded; start again when they arrive, unless something was typed.
    const lateFactors = changes['factors'] && this.visible && this.form.pristine && !this.saving;
    if ((changes['visible'] && this.visible) || lateFactors) {
      this.submitted = false;
      this.saving = false;
      this.error = '';
      this.form = this.build();
      this.watch();
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

  /** Kept as one array between renders, so the options (and the choice made) are not redrawn. */
  private listCategories(): { value: string; count: number }[] {
    const counts = new Map<string, number>();
    this.profiles.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    return [...counts].map(([value, count]) => ({ value, count }));
  }

  get affected(): ProfileRow[] {
    const category = this.category;
    return category ? this.profiles.filter((p) => p.category === category) : this.profiles;
  }

  /** The change as typed, or null while the fields in use are not valid. */
  get change(): RateRequest | null {
    const v = this.form.value;
    if (this.mode === 'percent') {
      const percent = Number(v.percent);
      if (this.form.get('percent')?.invalid || !percent) {
        return null;
      }
      return { mode: 'percent', category: this.category, percent };
    }
    if (['per_kg', 'rate_bar', 'color_per_kg', 'color_rate_bar'].some((k) => this.form.get(k)?.invalid)) {
      return null;
    }
    return {
      mode: 'rate',
      category: this.category,
      factors: {
        per_kg: Number(v.per_kg),
        rate_bar: Number(v.rate_bar),
        color_per_kg: Number(v.color_per_kg),
        color_rate_bar: Number(v.color_rate_bar),
      },
    };
  }

  /** The stored rates per kg after the change; the API moves them only for every profile. */
  get nextFactors(): PriceFactors | null {
    return this.result?.factors.after ?? null;
  }

  /** The sample window at today's rates and at the rates the API answered. */
  get preview(): SampleCost | null {
    const result = this.result;
    if (!result) {
      return null;
    }
    const after = new Map(result.profiles.map((p) => [p.id, p.after]));
    return sampleCost(this.affected, (p) => after.get(p.id) ?? p);
  }

  /** How many profiles the API will change; the rows on the page until it answers. */
  get count(): number {
    return this.result?.count ?? this.affected.length;
  }

  /** Something is typed in the percentage box that cannot be used (-150, "abc"): said at once, not on Save. */
  get percentRefused(): boolean {
    const box = this.form.get('percent');
    return this.mode === 'percent' && !!box && String(box.value ?? '').trim() !== '' && box.invalid;
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
    if (!this.affected.length) {
      this.error = 'There are no profiles to update.';
      return;
    }

    this.saving = true;
    this.adapter.changeRates(change, false).subscribe({
      next: (saved) => {
        this.saving = false;
        this.updated.emit({ count: saved.count });
        this.visible = false;
        this.visibleChange.emit(false);
      },
      error: (err) => {
        this.saving = false;
        this.error = this.adapter.message(err, 'The rates were not updated. Try again.');
      },
    });
  }

  /** Asks for a new preview whenever what is typed changes. */
  private watch(): void {
    this.formSub?.unsubscribe();
    this.asked.next(null);
    this.formSub = this.form.valueChanges.subscribe(() => this.asked.next(this.visible ? this.change : null));
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
