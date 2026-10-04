import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { finalize } from 'rxjs/operators';

import { QuotationService } from '../../quotation.service';
import { errorText } from '../../quotation-list.model';
import { QuotationView } from './quotation-detail.model';

export interface DuplicateResult {
  id: number;
  number: string;
  /** The copy is priced at today's rates and they differ from the source. */
  pricesChanged: boolean;
}

/**
 * "Duplicate" from the quotation page (flow gap G19): the customer (the same
 * one unless changed) and a name. The API makes the copy as a new draft with
 * a new number at today's prices; the page then opens it.
 *
 *   <app-duplicate-dialog [visible]="open" [quotation]="view"
 *     (closed)="open = false" (saved)="openCopy($event)"></app-duplicate-dialog>
 */
@Component({
  selector: 'app-duplicate-dialog',
  templateUrl: './duplicate-dialog.component.html',
})
export class DuplicateDialogComponent implements OnChanges {
  @Input() visible = false;

  @Input() quotation: QuotationView | null = null;

  @Output() closed = new EventEmitter<void>();

  @Output() saved = new EventEmitter<DuplicateResult>();

  customers: { id: number; name: string; phone: string }[] = [];
  loading = false;
  customerId: number | null = null;
  name = '';
  saving = false;
  saveError = '';

  constructor(private _dataService: QuotationService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.quotation) {
      const q = this.quotation;
      this.saveError = '';
      this.customerId = q.customer.id;
      this.name = `${q.name} (Copy)`;
      // The same customer is offered at once; the rest of the list arrives behind it.
      this.customers = q.customer.id ? [{ id: q.customer.id, name: q.customer.name, phone: q.customer.phone }] : [];
      this._loadCustomers();
    }
  }

  close(): void {
    if (!this.saving) {
      this.closed.emit();
    }
  }

  submit(): void {
    if (this.saving || !this.quotation) {
      return;
    }
    this.saveError = '';
    const body: any = {};
    if (this.customerId) {
      body.customer_id = this.customerId;
    }
    if (this.name.trim()) {
      body.quatation_name = this.name.trim();
    }
    this.saving = true;
    this._dataService
      .copyQuotation(this.quotation.id, body)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (res) => {
          if (res?.success && res.data?.id) {
            this.saved.emit({
              id: res.data.id,
              number: res.data.number || 'a new draft',
              pricesChanged: !!res.data.copy?.prices_changed,
            });
          } else {
            this.saveError = res?.message || 'The quotation was not duplicated. Try again.';
          }
        },
        error: (err) => (this.saveError = errorText(err, 'The quotation was not duplicated. Check your connection.')),
      });
  }

  private _loadCustomers(): void {
    this.loading = true;
    this._dataService
      .getCustomerChoices()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res) => {
          if (res?.success && Array.isArray(res.data) && res.data.length) {
            this.customers = res.data.map((c: any) => ({ id: c.id, name: c.name, phone: c.phone || '' }));
          }
        },
        // The same customer is already offered; the copy can still be made.
        error: () => undefined,
      });
  }
}
