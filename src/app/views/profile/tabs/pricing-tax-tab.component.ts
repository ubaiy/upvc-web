import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { WriteDirective } from 'src/app/shared/access/write.directive';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { PaymentTermsCardComponent } from '../../payment-terms/payment-terms-card.component';
import { MarginsCardComponent } from '../../type-margin/margins-card.component';
import { SettingsAdapter, errorText } from '../settings.adapter';
import { PricingExtrasCardComponent } from './pricing-extras-card.component';
import { GstRegistrationType, TaxSettings } from '../settings.model';

/** The sample price behind the "prices include GST" illustration. */
export const SAMPLE_PRICE = 10000;

/** Settings → Pricing and tax: GST defaults, margins, the rates of bars, bending and shaped glass, payment terms (gap G4). */
@Component({
  selector: 'app-settings-pricing-tax',
  standalone: true,
  imports: [WriteDirective, 
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    SharedComponentsModule,
    MarginsCardComponent,
    PaymentTermsCardComponent,
    PricingExtrasCardComponent,
  ],
  templateUrl: './pricing-tax-tab.component.html',
  styleUrls: ['../settings-tab.scss'],
})
export class PricingTaxTabComponent implements OnInit {
  readonly samplePrice = SAMPLE_PRICE;

  state: 'loading' | 'error' | 'ready' = 'loading';
  registrationType: GstRegistrationType = 'regular';
  form: FormGroup;
  submitted = false;
  saving = false;
  saveError = '';

  constructor(private fb: FormBuilder, private adapter: SettingsAdapter, private toast: ToastService) {
    this.form = this.fb.group({
      gstRate: [18, [Validators.required, Validators.min(0), Validators.max(100)]],
      hsnCode: ['', [Validators.pattern(/^[0-9 ]{4,10}$/)]],
      pricesIncludeGst: [false],
    });
  }

  get f() {
    return this.form.controls;
  }

  /** Composition and unregistered companies print no tax lines. */
  get chargesGst(): boolean {
    return this.registrationType === 'regular';
  }

  /** Illustration only: quotation totals always come from the API. */
  get sample(): { taxable: number; tax: number; total: number } {
    const rate = Number(this.f['gstRate'].value) || 0;
    if (this.f['pricesIncludeGst'].value) {
      const taxable = this.samplePrice / (1 + rate / 100);
      return { taxable, tax: this.samplePrice - taxable, total: this.samplePrice };
    }
    const tax = (this.samplePrice * rate) / 100;
    return { taxable: this.samplePrice, tax, total: this.samplePrice + tax };
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.adapter.load().subscribe({
      next: (snapshot) => {
        this.registrationType = snapshot.company.registrationType;
        this.form.reset(snapshot.tax);
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
    if (this.form.invalid || this.saving) {
      return;
    }
    const value = this.form.getRawValue();
    const tax: TaxSettings = {
      gstRate: Number(value.gstRate),
      hsnCode: value.hsnCode ?? '',
      pricesIncludeGst: !!value.pricesIncludeGst,
    };
    this.saving = true;
    this.adapter.saveTax(tax).subscribe({
      next: (snapshot) => {
        this.saving = false;
        this.submitted = false;
        this.form.reset(snapshot.tax);
        this.toast.showSuccess('GST settings saved');
      },
      error: (err) => {
        this.saving = false;
        this.saveError = errorText(err);
      },
    });
  }
}
