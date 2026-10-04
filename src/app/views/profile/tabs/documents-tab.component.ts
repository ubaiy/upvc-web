import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { SettingsAdapter, errorText } from '../settings.adapter';
import { CompanySettings, DOCUMENT_DEFAULTS, DocumentSettings } from '../settings.model';

export const IFSC_PATTERN = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
// The three below mirror the API's rules (CompanySettingsController::rules).
export const UPI_PATTERN = /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9.-]{1,}$/;
export const PREFIX_PATTERN = /^[A-Za-z0-9/-]*$/;
export const ACCOUNT_PATTERN = /^[0-9A-Za-z -]+$/;

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
    return this.form.getRawValue() as DocumentSettings;
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
        this.form.reset(snapshot.documents);
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
    const documents: DocumentSettings = {
      ...value,
      validityDays: Number(value.validityDays),
      bankIfsc: (value.bankIfsc || '').toUpperCase(),
    };
    this.saving = true;
    this.adapter.saveDocuments(documents, this.stored).subscribe({
      next: (snapshot) => {
        this.saving = false;
        this.submitted = false;
        this.form.reset(snapshot.documents);
        this.toast.showSuccess('Document settings saved');
      },
      error: (err) => {
        this.saving = false;
        this.saveError = errorText(err);
      },
    });
  }
}
