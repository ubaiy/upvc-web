import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { finalize } from 'rxjs/operators';

import { QuotationService } from '../quotation.service';
import { errorText, QuotationRow } from '../quotation-list.model';
import { CustomerOption } from './quotation-dialog.component';

/** What the dialog tells the list about the copy the API made. */
export interface DuplicatedQuotation {
  id: number;
  /** The copy is priced at today's rates and they differ from the original. */
  pricesChanged: boolean;
}

/**
 * "Duplicate" from a quotation's row menu: the same windows for the same or
 * another customer. The API makes the copy (\`quatation/copy/{id}\`) as a new
 * draft with a new number, priced again at today's rates; a window that cannot
 * be priced again is copied at the price it had.
 */
@Component({
  selector: 'app-duplicate-quotation-dialog',
  templateUrl: './duplicate-quotation-dialog.component.html',
})
export class DuplicateQuotationDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() quotation: QuotationRow | null = null;

  @Output() closed = new EventEmitter<void>();

  @Output() saved = new EventEmitter<DuplicatedQuotation>();

  form: FormGroup;
  customers: CustomerOption[] = [];
  loadError = '';
  submitted = false;
  copying = false;
  saveError = '';

  constructor(private _fb: FormBuilder, private _dataService: QuotationService) {
    this.form = this._fb.group({
      customer_id: [null],
      quatation_name: [''],
    });
  }

  get customerError(): string {
    return this.submitted && !this.form.controls['customer_id'].value ? 'Choose a customer.' : '';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.quotation) {
      this.load();
    }
  }

  load(): void {
    const source = this.quotation;
    if (!source) {
      return;
    }
    this.submitted = false;
    this.saveError = '';
    this.loadError = '';
    this.form.reset({ customer_id: source.customerId, quatation_name: `${source.name} (Copy)` });
    // The same customer is offered at once; the rest of the list arrives behind it.
    this.customers = source.customerId ? [{ id: source.customerId, name: source.customerName, phone: source.phone }] : [];
    this._dataService.getCustomerOptions().subscribe({
      next: (res) => {
        if (res?.success) {
          this.customers = (res.data || [])
            .map((c: any) => ({ id: Number(c.id), name: (c.name || '').toString(), phone: (c.phone || '').toString() }))
            .sort((a: CustomerOption, b: CustomerOption) => a.name.localeCompare(b.name));
        }
      },
      // The copy for the same customer still works.
      error: () => (this.loadError = 'We could not load your other customers.'),
    });
  }

  close(): void {
    if (!this.copying) {
      this.closed.emit();
    }
  }

  submit(): void {
    this.submitted = true;
    this.saveError = '';
    const source = this.quotation;
    if (this.copying || this.customerError || !source) {
      return;
    }
    const value = this.form.getRawValue();
    this.copying = true;
    this._dataService
      .copyQuotation(source.id, {
        customer_id: Number(value.customer_id),
        quatation_name: (value.quatation_name || '').trim() || `${source.name} (Copy)`,
      })
      .pipe(finalize(() => (this.copying = false)))
      .subscribe({
        next: (res) => {
          if (!res?.success || !res.data?.id) {
            this.saveError = res?.message || 'We could not copy the quotation. Try again.';
            return;
          }
          this.saved.emit({ id: Number(res.data.id), pricesChanged: !!res.data.copy?.prices_changed });
        },
        error: (err) => (this.saveError = errorText(err, 'We could not copy the quotation. Try again.')),
      });
  }
}
