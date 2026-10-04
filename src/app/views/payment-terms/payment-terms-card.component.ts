import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { IPaymentTypeDto } from 'src/app/shared/model/paymentTerms/paymentTerms.model';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { PaymentTermsService } from './payment-terms.service';

/**
 * The "Payment terms" card of Settings → Pricing and tax: the sentences a
 * quotation can carry, such as "50% advance, 50% before dispatch".
 */
@Component({
  selector: 'app-payment-terms-card',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SharedComponentsModule, DialogModule],
  templateUrl: './payment-terms-card.component.html',
  styleUrls: ['../profile/settings-tab.scss'],
})
export class PaymentTermsCardComponent implements OnInit {
  state: 'loading' | 'error' | 'ready' = 'loading';
  terms: IPaymentTypeDto[] = [];
  dialogOpen = false;
  editing: IPaymentTypeDto | null = null;
  form: FormGroup;
  submitted = false;
  saving = false;
  saveError = '';

  constructor(
    private fb: FormBuilder,
    private service: PaymentTermsService,
    private toast: ToastService,
    private confirm: ConfirmationDialogService
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(191)]],
      description: ['', [Validators.required]],
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
    this.service.getPaymentTypeList().subscribe({
      next: (res) => {
        if (res?.success) {
          this.terms = res.data ?? [];
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

  open(term?: IPaymentTypeDto): void {
    this.editing = term ?? null;
    this.submitted = false;
    this.saveError = '';
    this.form.reset({ name: term?.name ?? '', description: term?.description ?? '' });
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
      description: String(value.description).trim(),
    } as IPaymentTypeDto;
    this.saving = true;
    const request = this.editing ? this.service.editPaymentType(body) : this.service.addPaymentType(body);
    request.subscribe({
      next: (res) => {
        this.saving = false;
        if (res?.success) {
          this.dialogOpen = false;
          this.toast.showSuccess(this.editing ? 'Payment term updated' : 'Payment term added');
          this.load();
        } else {
          this.saveError = res?.message || 'The payment term could not be saved. Please try again.';
        }
      },
      error: (err) => {
        this.saving = false;
        this.saveError = err?.error?.message || 'The payment term could not be saved. Please try again.';
      },
    });
  }

  remove(term: IPaymentTypeDto): void {
    this.confirm.confirm(
      `Delete "${term.name}"?`,
      'Quotations already made keep their terms. New quotations can no longer use this one.',
      'pi-info-circle',
      () => {
        this.service.deletePaymentTerms(term.id).subscribe({
          next: (res) => {
            if (res?.success) {
              this.toast.showSuccess('Payment term deleted');
              this.load();
            } else {
              this.toast.showError(res?.message || 'The payment term could not be deleted.');
            }
          },
          error: (err) => this.toast.showError(err?.error?.message || 'The payment term could not be deleted.'),
        });
      },
      () => undefined
    );
  }
}
