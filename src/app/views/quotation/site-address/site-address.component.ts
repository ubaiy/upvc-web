import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

import { cityPin, pinOf } from 'src/app/shared/class/address-text';
import { AddressFieldsComponent } from 'src/app/shared/components/address-fields/address-fields.component';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import {
  AddressValue,
  GstState,
  addressErrors,
  isBlankAddress,
  stateCodeFor,
  stateName,
  toAddressPayload,
} from '../../customers/customer.adapter';
import { QuotationService } from '../quotation.service';

export interface SiteAddressOption {
  id: number;
  /** "14 Lake View, Adajan" */
  lines: string;
  /** "Surat - 395007, Gujarat" */
  place: string;
  isDefault: boolean;
}

/** A new address typed here follows the same rules as one typed on the customer page. */
function completeOrBlank(group: AbstractControl): ValidationErrors | null {
  return addressErrors(group.value as AddressValue);
}

let nextId = 0;

/**
 * The site (delivery) address of a quotation: one of the customer's saved
 * addresses, or a new one typed here, PIN code first. The state of the site
 * address is what the api takes the place of supply from.
 *
 *   <app-site-address #site [customerId]="customerId" [selectedId]="addressIdOnTheQuotation"></app-site-address>
 *   ...
 *   if (site.hasProblem()) return;
 *   site.resolve(customerId).subscribe((addressId) => save({ customer_address_id: addressId }));
 *
 * `customerId` null is a customer who is still being typed: only the new
 * address form shows, and `newAddress()` gives what to send with the customer.
 * Nothing here is required: with no address chosen or typed, `resolve` gives
 * null and the api uses the customer's default address.
 */
@Component({
  selector: 'app-site-address',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SharedComponentsModule, AddressFieldsComponent],
  templateUrl: './site-address.component.html',
  styleUrls: ['./site-address.component.scss'],
})
export class SiteAddressComponent implements OnChanges {
  @Input() customerId: number | null = null;
  /** The address the quotation has now; leave out for a new quotation (the default address is taken). */
  @Input() selectedId: number | null = null;
  /** True shows one line and a "Change" button until the user opens it; false shows the choices at once. */
  @Input() collapsed = true;

  readonly uid = `site-${nextId++}`;

  state: 'loading' | 'error' | 'ready' = 'ready';
  states: GstState[] = [];
  options: SiteAddressOption[] = [];
  /** An address id, 'new' for the form, or null when the customer has none and none is typed. */
  choice: number | 'new' | null = null;
  open = false;
  submitted = false;
  form: FormGroup;

  private companyState = '';

  constructor(private fb: FormBuilder, private service: QuotationService) {
    this.form = this.newForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['customerId']) {
      this.load();
    } else if (changes['selectedId'] && this.selectedId && this.options.some((o) => o.id === this.selectedId)) {
      this.choice = this.selectedId;
    }
  }

  get chosen(): SiteAddressOption | null {
    return this.options.find((option) => option.id === this.choice) ?? null;
  }

  /** The form shows when "Another address" is chosen, or there is no saved address to choose. */
  get typing(): boolean {
    return this.choice === 'new' || !this.options.length;
  }

  get expanded(): boolean {
    return !this.collapsed || this.open;
  }

  load(): void {
    this.submitted = false;
    this.open = false;
    this.options = [];
    this.choice = null;
    this.form = this.newForm();
    this.state = 'loading';
    forkJoin({
      states: this.states.length ? of(this.states) : this.service.getGstStates().pipe(map((res) => (res?.success ? res.data : []) as GstState[])),
      // The company's state only pre-selects the list of a new address.
      company: this.companyState
        ? of(this.companyState)
        : this.service.getCompanyState().pipe(catchError(() => of(''))),
      addresses: this.customerId ? this.service.getCustomerAddresses(this.customerId) : of({ success: true, data: [] as any[] }),
    }).subscribe({
      next: ({ states, company, addresses }) => {
        if (!addresses?.success) {
          this.state = 'error';
          return;
        }
        this.states = states || [];
        this.companyState = company || '';
        this.form.patchValue({ state_code: this.companyState });
        const rows: any[] = [...(addresses.data || [])]
          .filter((row) => !this.customerId || Number(row.customer_id) === Number(this.customerId))
          .sort((a, b) => Number(b.is_default) - Number(a.is_default) || Number(a.id) - Number(b.id));
        this.options = rows.map((row) => this.toOption(row));
        const current = this.options.find((option) => option.id === this.selectedId);
        this.choice = current?.id ?? this.options[0]?.id ?? null;
        this.state = 'ready';
      },
      error: () => (this.state = 'error'),
    });
  }

  choose(choice: number | 'new'): void {
    this.choice = choice;
    this.submitted = false;
  }

  /** True when a new address was started and is not complete; the messages then show beside its fields. */
  hasProblem(): boolean {
    if (this.state !== 'ready' || !this.typing) {
      return false;
    }
    this.submitted = true;
    if (this.form.invalid) {
      // A new address is only typed with the form open.
      this.open = true;
    }
    return this.form.invalid;
  }

  /** The new address typed here, or null when a saved one is chosen or nothing was typed. */
  newAddress(): AddressValue | null {
    if (this.state !== 'ready' || !this.typing) {
      return null;
    }
    const value = this.form.getRawValue() as AddressValue;
    return isBlankAddress(value) ? null : value;
  }

  /** Body of the nested `address` of customer/add, for a customer made together with the quotation. */
  newAddressPayload(): any | null {
    const value = this.newAddress();
    if (!value) {
      return null;
    }
    const body = toAddressPayload(value, 0, true, this.states);
    return {
      address: body.address,
      address_line2: body.address_line2 || null,
      city: body.city || null,
      district: body.district,
      state: body.state || null,
      zip_code: body.zip_code || null,
      pincode: body.pincode,
    };
  }

  /**
   * The id to send as `customer_address_id`. A new address is saved to the
   * customer first (as the default when it is the first one); null leaves the
   * choice to the api.
   */
  resolve(customerId: number): Observable<number | null> {
    const value = this.newAddress();
    if (!value) {
      return of(typeof this.choice === 'number' ? this.choice : null);
    }
    const body = toAddressPayload(value, customerId, !this.options.length, this.states);
    return this.service.addCustomerAddress(body).pipe(
      switchMap((res) => (res?.success && res.data?.id ? of(res.data) : throwError(() => res?.message || 'We could not save the site address. Try again.'))),
      tap((row) => {
        // Saved: a second try after a later failure must reuse it, not add it again.
        const option = this.toOption({ ...row, state: row.state || stateName(value.state_code, this.states) });
        this.options = [...this.options, option];
        this.choice = option.id;
        this.form = this.newForm();
        this.form.patchValue({ state_code: this.companyState });
        this.submitted = false;
      }),
      map((row) => Number(row.id))
    );
  }

  trackById(_: number, option: SiteAddressOption): number {
    return option.id;
  }

  private toOption(row: any): SiteAddressOption {
    const code = stateCodeFor(row.state_code, this.states) || stateCodeFor(row.state, this.states);
    return {
      id: Number(row.id),
      lines: [row.address, row.address_line2].map((part) => (part == null ? '' : String(part).trim())).filter(Boolean).join(', '),
      place: [cityPin(row.city, pinOf(row)), stateName(code, this.states) || row.state || ''].filter(Boolean).join(', '),
      isDefault: !!Number(row.is_default),
    };
  }

  private newForm(): FormGroup {
    return this.fb.group(
      {
        id: [null],
        address: [''],
        address_line2: [''],
        city: [''],
        district: [''],
        state_code: [this.companyState],
        zip_code: [''],
      },
      { validators: completeOrBlank }
    );
  }
}
