import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { SettingsAdapter, SettingsRefusal, errorText } from '../settings.adapter';
import {
  CompanySettings,
  DOCUMENT_DEFAULTS,
  DocumentSettings,
  NumberSeries,
  SeriesChange,
  SeriesKey,
  SettingsSnapshot,
  seriesExample,
} from '../settings.model';

export const IFSC_PATTERN = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
// The three below mirror the API's rules (CompanySettingsController::rules).
export const UPI_PATTERN = /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9.-]{1,}$/;
export const PREFIX_PATTERN = /^[A-Za-z0-9/-]*$/;
// A bank account number in India is 9 to 18 digits; spaces and hyphens between groups are let through.
export const ACCOUNT_PATTERN = /^(?:[ -]*\d){9,18}[ -]*$/;
export const MAX_SERIES_NUMBER = 9999999;

/**
 * Settings → Documents: what the quotation and the bill print besides the
 * windows (gaps G2, G3). The preview on the right redraws as the form changes.
 */
@Component({
  selector: 'app-settings-documents',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, SharedComponentsModule],
  templateUrl: './documents-tab.component.html',
  styleUrls: ['../settings-tab.scss', './documents-tab.component.scss'],
})
export class DocumentsTabComponent implements OnInit {
  state: 'loading' | 'error' | 'ready' = 'loading';
  company: CompanySettings | null = null;
  /** False against an API older than card A4, which cannot keep these fields; saving is then off. */
  stored = false;
  form: FormGroup;
  submitted = false;
  saving = false;
  saveError = '';
  /** The five number series, in the order they are shown. Empty against an older api. */
  series: NumberSeries[] = [];
  /** The api's sentence for one series ("order": "Next order number must be 3 or more…"). */
  seriesErrors: Partial<Record<SeriesKey, string>> = {};
  readonly today = new Date();

  constructor(private fb: FormBuilder, private adapter: SettingsAdapter, private toast: ToastService) {
    this.form = this.fb.group({
      numberPrefix: [DOCUMENT_DEFAULTS.numberPrefix, [Validators.maxLength(10), Validators.pattern(PREFIX_PATTERN)]],
      validityDays: [
        DOCUMENT_DEFAULTS.validityDays,
        [Validators.required, Validators.min(1), Validators.max(365), Validators.pattern(/^\d+$/)],
      ],
      terms: ['', [Validators.maxLength(5000)]],
      bankName: ['', [Validators.maxLength(191)]],
      bankAccountName: ['', [Validators.maxLength(191)]],
      bankAccount: ['', [Validators.maxLength(40), Validators.pattern(ACCOUNT_PATTERN)]],
      bankIfsc: ['', [Validators.pattern(IFSC_PATTERN)]],
      upiId: ['', [Validators.pattern(UPI_PATTERN)]],
      signatory: ['', [Validators.maxLength(191)]],
    });
  }

  get f() {
    return this.form.controls;
  }

  /** The form as the preview reads it. */
  get doc(): DocumentSettings {
    const { series, ...doc } = this.form.getRawValue();
    return doc as DocumentSettings;
  }

  /** The prefix and next number typed for one series. */
  seriesGroup(key: SeriesKey): FormGroup {
    return this.form.get(['series', key]) as FormGroup;
  }

  /** "INV/26-27/0251": the next number of a series as it will print, with what is typed. */
  exampleOf(series: NumberSeries): string {
    const value = this.seriesGroup(series.key)?.value ?? {};
    const prefix = String(value.prefix ?? '').trim();
    const next = Number(value.next);
    if (!prefix || !Number.isFinite(next) || next < 1) {
      return series.example;
    }
    return seriesExample(series, prefix, next);
  }

  /** The quotation number the preview prints: the next one of its series, as typed. */
  get quotationExample(): string {
    const quotation = this.series.find((s) => s.key === 'quotation');
    return quotation ? this.exampleOf(quotation) : `${this.doc.numberPrefix}0014`;
  }

  /** What is wrong with a series as typed, or '' when it can be saved. */
  seriesProblem(series: NumberSeries): string {
    const group = this.seriesGroup(series.key);
    if (!group || !(group.touched || group.dirty || this.submitted)) {
      return '';
    }
    if (group.get('prefix')?.invalid) {
      return 'A prefix has up to 10 letters, digits, "/" or "-".';
    }
    const next = group.get('next');
    if (next?.hasError('min')) {
      return series.lastUsed
        ? `Use ${series.minNext} or more: numbers up to ${series.lastUsed} are already used${series.yearly ? ' this year' : ''}.`
        : `Use ${series.minNext} or more.`;
    }
    if (next?.invalid) {
      return `Enter a whole number from ${series.minNext} to 99,99,999.`;
    }
    return this.seriesErrors[series.key] ?? '';
  }

  get validUntil(): Date {
    const days = Math.min(365, Math.max(1, Math.floor(Number(this.doc.validityDays)) || DOCUMENT_DEFAULTS.validityDays));
    const date = new Date(this.today);
    date.setDate(date.getDate() + days);
    return date;
  }

  get termLines(): string[] {
    return (this.doc.terms || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  get initials(): string {
    const words = (this.company?.name ?? '').split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2)).toUpperCase();
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.adapter.load().subscribe({
      next: (snapshot) => {
        this.company = snapshot.company;
        this.stored = snapshot.documentsStored;
        this.show(snapshot);
        this.state = 'ready';
      },
      error: () => (this.state = 'error'),
    });
  }

  invalid(name: string): boolean {
    const control = this.f[name];
    return control.invalid && (control.touched || this.submitted);
  }

  save(): void {
    this.submitted = true;
    this.saveError = '';
    if (this.form.invalid || this.saving || !this.stored) {
      return;
    }
    const value = this.doc;
    const changes = this.seriesChanges();
    const documents: DocumentSettings = {
      ...value,
      // The quotation prefix lives in its series; the older field carries the same value.
      numberPrefix: changes.quotation?.prefix ?? this.series.find((s) => s.key === 'quotation')?.prefix ?? value.numberPrefix,
      validityDays: Number(value.validityDays),
      bankIfsc: (value.bankIfsc || '').toUpperCase(),
    };
    this.saving = true;
    this.seriesErrors = {};
    this.adapter.saveDocuments(documents, this.stored, changes).subscribe({
      next: (snapshot) => {
        this.saving = false;
        this.submitted = false;
        this.show(snapshot);
        this.toast.showSuccess('Document settings saved');
      },
      error: (err) => {
        this.saving = false;
        if (err instanceof SettingsRefusal && this.showSeriesErrors(err)) {
          return;
        }
        this.saveError = errorText(err);
      },
    });
  }

  /** The prefix and the next number of each series the user changed, and nothing else. */
  private seriesChanges(): Partial<Record<SeriesKey, SeriesChange>> {
    const changes: Partial<Record<SeriesKey, SeriesChange>> = {};
    for (const series of this.series) {
      const value = this.seriesGroup(series.key)?.value ?? {};
      const change: SeriesChange = {};
      const prefix = String(value.prefix ?? '').trim();
      if (prefix !== series.prefix) {
        change.prefix = prefix;
      }
      if (Number(value.next) !== series.next) {
        change.next = Number(value.next);
      }
      if (Object.keys(change).length) {
        changes[series.key] = change;
      }
    }
    return changes;
  }

  /** Puts `data.errors["number_series.order.next"]` under its series. True when one was placed. */
  private showSeriesErrors(refusal: SettingsRefusal): boolean {
    const errors = refusal.data?.errors ?? {};
    let placed = false;
    for (const field of Object.keys(errors)) {
      const match = /^number_series\.(\w+)\./.exec(field);
      const series = match && this.series.find((s) => s.key === match[1]);
      if (series) {
        this.seriesErrors[series.key] = refusal.fieldError(field);
        placed = true;
      }
    }
    return placed;
  }

  private show(snapshot: SettingsSnapshot): void {
    this.series = snapshot.numberSeries;
    this.seriesErrors = {};
    const groups: Record<string, FormGroup> = {};
    for (const series of this.series) {
      groups[series.key] = this.fb.group({
        prefix: [series.prefix, [Validators.maxLength(10), Validators.pattern(PREFIX_PATTERN)]],
        next: [
          series.next,
          [Validators.required, Validators.pattern(/^\d+$/), Validators.min(series.minNext), Validators.max(MAX_SERIES_NUMBER)],
        ],
      });
    }
    this.form.setControl('series', this.fb.group(groups));
    this.form.reset({ ...snapshot.documents, series: Object.fromEntries(this.series.map((s) => [s.key, { prefix: s.prefix, next: s.next }])) });
  }
}
