import { Component } from '@angular/core';

import { saveBlob } from 'src/app/shared/class/download-file';
import { Crumb } from 'src/app/shared/components/page-header/page-header.component';
import { ToastService } from 'src/app/shared/services/toast.service';
import { BulkPriceUpdateService, PriceUpload } from './bulk-price-update.service';

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Price file, at `/bulk-price-update`: download the catalogue's rates as an
 * Excel file, type the supplier's new rates into it, upload it to see what
 * would change, then apply. Nothing is saved before "Apply", and nothing at
 * all while the file has a row the api cannot read. The api compares and
 * saves; this page only shows its answer.
 */
@Component({
  selector: 'app-bulk-price-upload',
  templateUrl: './bulk-price-upload.component.html',
  styleUrls: ['./bulk-price-upload.component.scss'],
})
export class BulkPriceUploadComponent {
  readonly crumbs: Crumb[] = [{ label: 'Catalogue', link: '/masters/profile' }, { label: 'Price file' }];

  downloading = false;
  /** 'preview' while the file is being read, 'apply' while it is being saved. */
  busy: 'preview' | 'apply' | null = null;
  file: File | null = null;
  /** What the api says the file would change. */
  preview: PriceUpload | null = null;
  /** What was saved, after "Apply". */
  applied: PriceUpload | null = null;
  error = '';
  /** Rows of the preview shown; the rest open with "Show all". */
  showAll = false;

  readonly firstRows = 50;

  constructor(private service: BulkPriceUpdateService, private toast: ToastService) {}

  get rows() {
    const changes = this.preview?.changes ?? [];
    return this.showAll ? changes : changes.slice(0, this.firstRows);
  }

  get canApply(): boolean {
    return !!this.preview && !this.preview.saved && !this.preview.errors.length && this.preview.changes.length > 0;
  }

  download(): void {
    if (this.downloading) {
      return;
    }
    this.downloading = true;
    this.error = '';
    this.service.downloadSheet().subscribe({
      next: (file) => {
        this.downloading = false;
        const name = file.fileName || 'Price-list.xlsx';
        saveBlob(file.blob, name);
        this.toast.showSuccess(`${name} downloaded`);
      },
      error: () => {
        this.downloading = false;
        this.error = 'The price list could not be downloaded. Check your connection.';
      },
    });
  }

  onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) {
      this.choose(file);
    }
  }

  /** Reads the file: a preview only, nothing is saved. */
  choose(file: File): void {
    this.error = '';
    this.preview = null;
    this.applied = null;
    this.showAll = false;
    this.file = null;
    if (!/\.xlsx$/i.test(file.name)) {
      this.error = `"${file.name}" is not an Excel file. Choose the .xlsx price list you downloaded here.`;
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error = `"${file.name}" is larger than 2 MB. Upload the price list as it was downloaded, with only the rates changed.`;
      return;
    }
    this.file = file;
    this.send(false);
  }

  /** "Apply": the same file again, this time saved. */
  apply(): void {
    if (this.canApply) {
      this.send(true);
    }
  }

  reset(): void {
    this.file = null;
    this.preview = null;
    this.applied = null;
    this.error = '';
  }

  private send(apply: boolean): void {
    const file = this.file;
    if (!file || this.busy) {
      return;
    }
    this.busy = apply ? 'apply' : 'preview';
    this.error = '';
    this.service.uploadSheet(file, apply).subscribe({
      next: (result) => {
        this.busy = null;
        if (apply && result.saved) {
          this.applied = result;
          this.preview = null;
          this.file = null;
          this.toast.showSuccess(`${result.summary.ratesChanged} ${result.summary.ratesChanged === 1 ? 'rate' : 'rates'} updated`);
          return;
        }
        this.preview = result;
        if (apply) {
          // The api did not save: its sentence says why.
          this.error = result.message || 'The rates were not saved.';
        }
      },
      error: (err) => {
        this.busy = null;
        this.error =
          err instanceof Error && err.message
            ? err.message
            : err?.error?.data?.errors?.file || err?.error?.message || 'The file could not be sent. Check your connection.';
      },
    });
  }
}
