import { WriteDirective } from 'src/app/shared/access/write.directive';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { of, throwError } from 'rxjs';
import { finalize, switchMap } from 'rxjs/operators';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { errorText } from '../quotation-list.model';
import { QuotationService } from '../quotation.service';
import { SiteAddressComponent } from './site-address.component';

/**
 * "Change" beside the site address on the quotation page: choose another of
 * the customer's addresses or type a new one. The api then works out the
 * place of supply again from the state of the new address.
 *
 *   <app-site-address-dialog [visible]="open" [quotationId]="q.id" [customerId]="q.customer.id"
 *     [addressId]="q.customer.addressId" (closed)="open = false" (saved)="reload()"></app-site-address-dialog>
 */
@Component({
  selector: 'app-site-address-dialog',
  standalone: true,
  imports: [WriteDirective, CommonModule, DialogModule, ButtonModule, SharedComponentsModule, SiteAddressComponent],
  template: `
    <p-dialog
      closeAriaLabel="Close"
      header="Site address"
      [visible]="visible"
      (visibleChange)="$event ? null : close()"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [closable]="!saving"
      [style]="{ width: '480px', maxWidth: '100vw' }"
    >
      <form class="u-col" style="gap: var(--s-4)" (ngSubmit)="submit()" novalidate *ngIf="visible">
        <p class="muted small" style="margin: 0">
          Where the windows go. Its state decides CGST + SGST or IGST on this quotation.
        </p>
        <app-site-address [customerId]="customerId" [selectedId]="addressId" [collapsed]="false"></app-site-address>
        <app-callout tone="danger" *ngIf="saveError">{{ saveError }}</app-callout>
        <!-- Lets Enter submit the form; the visible buttons are in the dialog footer. -->
        <button type="submit" hidden appWrite="quotations.write"></button>
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" [outlined]="true" [disabled]="saving" (onClick)="close()"></p-button>
        <p-button label="Use this address" [loading]="saving" appWrite="quotations.write" (onClick)="submit()"></p-button>
      </ng-template>
    </p-dialog>
  `,
})
export class SiteAddressDialogComponent {
  @Input() visible = false;
  @Input() quotationId: number | null = null;
  @Input() customerId: number | null = null;
  /** The customer address the quotation was written to, when it says. */
  @Input() addressId: number | null = null;

  @Output() closed = new EventEmitter<void>();
  /** The site address was changed. */
  @Output() saved = new EventEmitter<void>();

  @ViewChild(SiteAddressComponent) site?: SiteAddressComponent;

  saving = false;
  saveError = '';

  constructor(private service: QuotationService) {}

  close(): void {
    if (!this.saving) {
      this.saveError = '';
      this.closed.emit();
    }
  }

  submit(): void {
    const site = this.site;
    const quotationId = this.quotationId;
    const customerId = this.customerId;
    this.saveError = '';
    if (!site || !quotationId || !customerId || this.saving || site.hasProblem()) {
      return;
    }
    this.saving = true;
    site
      .resolve(customerId)
      .pipe(
        switchMap((addressId) => {
          if (!addressId) {
            return throwError(() => 'Choose an address, or type a new one.');
          }
          // Nothing changed: nothing to save.
          return addressId === this.addressId ? of({ success: true } as any) : this.service.setSiteAddress(quotationId, customerId, addressId);
        }),
        switchMap((res) => (res?.success ? of(res) : throwError(() => res?.message || ''))),
        finalize(() => (this.saving = false))
      )
      .subscribe({
        next: () => this.saved.emit(),
        error: (err) => (this.saveError = errorText(err, 'We could not change the site address. Try again.')),
      });
  }
}
