import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { QuotationService } from '../../quotation.service';
import { errorText } from '../../quotation-list.model';
import { QuotationView } from './quotation-detail.model';

interface Choice {
  id: number;
  label: string;
}

type DiscountType = 'none' | 'percent' | 'amount';

/**
 * "Change" under the total in the Summary card: price list (margin), payment
 * terms, discount, validity and whether prices include GST. This is the only
 * place they are decided; the PDF and the bill ask nothing (flow gaps G1, G4,
 * G12, G21). The API works out the new total; nothing is calculated here.
 *
 *   <app-summary-dialog [visible]="open" [quotation]="view"
 *     (closed)="open = false" (saved)="reload()"></app-summary-dialog>
 */
@Component({
  selector: 'app-summary-dialog',
  templateUrl: './summary-dialog.component.html',
})
export class SummaryDialogComponent implements OnChanges {
  @Input() visible = false;

  @Input() quotation: QuotationView | null = null;

  @Output() closed = new EventEmitter<void>();

  /** The quotation with its new totals, as the API returned it. */
  @Output() saved = new EventEmitter<any>();

  margins: Choice[] = [];
  terms: Choice[] = [];
  loading = false;
  loadError = '';
  saving = false;
  saveError = '';
  submitted = false;

  marginId: number | null = null;
  termId: number | null = null;
  discountType: DiscountType = 'none';
  discountValue: number | null = null;
  validUntil = '';
  pricesIncludeGst = false;

  constructor(private _dataService: QuotationService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.quotation) {
      this._reset(this.quotation);
      this.load();
    }
  }

  /** Today, for the earliest validity date the picker offers. */
  get today(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  get discountError(): string {
    if (!this.submitted || this.discountType === 'none') {
      return '';
    }
    const value = Number(this.discountValue);
    if (this.discountValue === null || !Number.isFinite(value) || value < 0) {
      return 'Enter the discount as a number, or choose "None".';
    }
    if (this.discountType === 'percent' && value > 100) {
      return 'A discount cannot be more than 100%.';
    }
    return '';
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    forkJoin([this._dataService.getMarginOptions(), this._dataService.getPaymentTermOptions()])
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ([margins, terms]) => {
          if (!margins?.success || !terms?.success) {
            this.loadError = 'We could not load your price lists and payment terms.';
            return;
          }
          this.margins = (margins.data || []).map((m: any) => ({
            id: m.id,
            label: `${m.name} (${Number(m.mark_up) || 0}%)`,
          }));
          this.terms = (terms.data || []).map((t: any) => ({ id: t.id, label: t.name }));
        },
        error: () => (this.loadError = 'We could not load your price lists and payment terms.'),
      });
  }

  setDiscountType(type: DiscountType): void {
    this.discountType = type;
    if (type === 'none') {
      this.discountValue = null;
    }
  }

  close(): void {
    if (!this.saving) {
      this.closed.emit();
    }
  }

  submit(): void {
    this.submitted = true;
    this.saveError = '';
    if (this.discountError || this.saving || !this.quotation) {
      return;
    }
    const discounted = this.discountType !== 'none' && Number(this.discountValue) > 0;
    const body: any = {
      // "discount_value: 0" removes the discount; the API wants a type beside it.
      discount_type: discounted ? this.discountType : 'percent',
      discount_value: discounted ? Number(this.discountValue) : 0,
      prices_include_gst: this.pricesIncludeGst,
    };
    if (this.marginId) {
      body.order_type_margin_id = this.marginId;
    }
    if (this.termId) {
      body.payment_term_id = this.termId;
    }
    if (this.validUntil) {
      body.valid_until = this.validUntil;
    }
    this.saving = true;
    this._dataService
      .saveQuotationSummary(this.quotation.id, body)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (res) => {
          if (res?.success) {
            this.saved.emit(res.data);
          } else {
            this.saveError = res?.message || 'The summary was not saved. Try again.';
          }
        },
        error: (err) => (this.saveError = errorText(err, 'The summary was not saved. Check your connection.')),
      });
  }

  private _reset(q: QuotationView): void {
    this.submitted = false;
    this.saveError = '';
    this.marginId = q.marginId;
    this.termId = q.paymentTermId;
    this.discountType = q.discountType && q.discountValue > 0 ? q.discountType : 'none';
    this.discountValue = this.discountType === 'none' ? null : q.discountValue;
    this.validUntil = q.validUntilIso;
    this.pricesIncludeGst = q.pricesIncludeGst;
  }
}
