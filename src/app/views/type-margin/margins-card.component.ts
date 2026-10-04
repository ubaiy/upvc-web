import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ITypeMarginDto } from 'src/app/shared/model/type-margin/typeMargin.model';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { TypeMarginService } from './type-margin.service';


/**
 * The "Margins" card of Settings → Pricing and tax: the mark-up added to cost
 * for each kind of customer (Retail, Dealer…). Two fields: name and percent.
 */
@Component({
  selector: 'app-margins-card',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SharedComponentsModule, DialogModule],
  templateUrl: './margins-card.component.html',
  styleUrls: ['../profile/settings-tab.scss'],
})
export class MarginsCardComponent implements OnInit {
  state: 'loading' | 'error' | 'ready' = 'loading';
  margins: ITypeMarginDto[] = [];
  dialogOpen = false;
  editing: ITypeMarginDto | null = null;
  form: FormGroup;
  submitted = false;
  saving = false;
  saveError = '';

  constructor(
    private fb: FormBuilder,
    private service: TypeMarginService,
    private toast: ToastService,
    private confirm: ConfirmationDialogService
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(191)]],
      // Mirrors the API guard: numeric, 0..1000 (audit H5).
      mark_up: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/), Validators.max(1000)]],
    });
  }

  get f() {
    return this.form.controls;
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.service.getTypeMarginList().subscribe({
      next: (res) => {
        if (res?.success) {
          this.margins = res.data ?? [];
          this.state = 'ready';
        } else {
          this.state = 'error';
        }
      },
      error: () => (this.state = 'error'),
    });
  }

  invalid(name: string): boolean {
    const control = this.f[name];
    return control.invalid && (control.touched || this.submitted);
  }

  open(margin?: ITypeMarginDto): void {
    this.editing = margin ?? null;
    this.submitted = false;
    this.saveError = '';
    this.form.reset({ name: margin?.name ?? '', mark_up: margin?.mark_up ?? '' });
    this.dialogOpen = true;
  }

  save(): void {
    this.submitted = true;
    this.saveError = '';
    if (this.form.invalid || this.saving) {
      return;
    }
    const value = this.form.getRawValue();
    const body = {
      id: this.editing?.id,
      name: String(value.name).trim(),
      mark_up: String(value.mark_up),
      // `pricing` is not sent: the api keeps the stored note on an edit and saves none for a new margin.
    } as ITypeMarginDto;
    this.saving = true;
    const request = this.editing ? this.service.editTypeMargin(body) : this.service.addTypeMargin(body);
    request.subscribe({
      next: (res) => {
        this.saving = false;
        if (res?.success) {
          this.dialogOpen = false;
          this.toast.showSuccess(this.editing ? 'Margin updated' : 'Margin added');
          this.load();
        } else {
          this.saveError = res?.message || 'The margin could not be saved. Please try again.';
        }
      },
      error: (err) => {
        this.saving = false;
        this.saveError = err?.error?.message || 'The margin could not be saved. Please try again.';
      },
    });
  }

  remove(margin: ITypeMarginDto): void {
    this.confirm.confirm(
      `Delete "${margin.name}"?`,
      'Quotations already made keep their totals. New quotations can no longer use this margin.',
      'pi-info-circle',
      () => {
        this.service.deleteTypeMarginDetail(margin.id).subscribe({
          next: (res) => {
            if (res?.success) {
              this.toast.showSuccess('Margin deleted');
              this.load();
            } else {
              this.toast.showError(res?.message || 'The margin could not be deleted.');
            }
          },
          error: (err) => this.toast.showError(err?.error?.message || 'The margin could not be deleted.'),
        });
      },
      () => undefined
    );
  }
}
