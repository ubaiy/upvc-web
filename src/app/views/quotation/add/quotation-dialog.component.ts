import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Dropdown } from 'primeng/dropdown';
import { Observable, of, throwError } from 'rxjs';
import { finalize, map, switchMap } from 'rxjs/operators';

import { QuotationService } from '../quotation.service';
import { defaultQuotationName, errorText, QuotationRow } from '../quotation-list.model';
import { SiteAddressComponent } from '../site-address/site-address.component';

export interface CustomerOption {
  id: number;
  name: string;
  phone: string;
  /** The price list a new quotation for this customer takes (`default_order_type_margin_id`). */
  marginId?: number | null;
}

export interface MarginOption {
  id: number;
  label: string;
}

/** Ten digits, after an optional +91 or leading 0 and any spaces or dashes. */
export function normalisePhone(value: string): string {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * "New quotation" in one dialog (flow gap G5): pick a customer or type a new
 * name and phone, and a quotation name that is filled in for you. The same
 * dialog renames a quotation or moves it to another customer.
 *
 *   <app-quotation-dialog [visible]="open" [quotation]="rowOrNull"
 *     (closed)="open = false" (saved)="goTo($event)"></app-quotation-dialog>
 */
@Component({
  selector: 'app-quotation-dialog',
  templateUrl: './quotation-dialog.component.html',
  styleUrls: ['./quotation-dialog.component.scss'],
})
export class QuotationDialogComponent implements OnChanges {
  @Input() visible = false;

  /** The quotation to rename or move. Leave out to make a new one. */
  @Input() quotation: QuotationRow | null = null;

  /** A customer to start the new quotation for (from the customer page). */
  @Input() customerId: number | null = null;

  @Output() closed = new EventEmitter<void>();

  /** Id of the quotation that was created or changed. */
  @Output() saved = new EventEmitter<number>();

  @ViewChild('customerDropdown') customerDropdown?: Dropdown;
  /** The site address of a new quotation; absent while editing and until a customer is chosen. */
  @ViewChild(SiteAddressComponent) site?: SiteAddressComponent;

  form: FormGroup;
  customers: CustomerOption[] = [];
  /** The company's price lists; the field is hidden when there is none. */
  margins: MarginOption[] = [];
  loadingCustomers = false;
  customersFailed = false;
  /** 'existing' picks from the list; 'new' types a name and phone. */
  mode: 'existing' | 'new' = 'existing';
  submitted = false;
  saving = false;
  saveError = '';
  filterText = '';
  /** Until the user types a quotation name, it follows the customer. */
  private nameEdited = false;
  /** Until the user picks a price list, it follows the customer. */
  private marginEdited = false;

  constructor(private _fb: FormBuilder, private _dataService: QuotationService) {
    this.form = this._fb.group({
      customer_id: [null],
      customer_name: [''],
      customer_phone: [''],
      quatation_name: [''],
      order_type_margin_id: [null],
    });
    this.form.controls['customer_id'].valueChanges.subscribe(() => {
      this._fillName();
      this._fillMargin();
    });
    this.form.controls['customer_name'].valueChanges.subscribe(() => this._fillName());
  }

  /** The customer picked from the list, for the site address choices. */
  get selectedCustomerId(): number | null {
    return Number(this.form.controls['customer_id'].value) || null;
  }

  get editing(): boolean {
    return !!this.quotation;
  }

  get title(): string {
    return this.editing ? 'Edit quotation' : 'New quotation';
  }

  get customerError(): string {
    if (!this.submitted || this.mode !== 'existing' || this._value('customer_id')) {
      return '';
    }
    return 'Choose a customer, or add a new one.';
  }

  get newNameError(): string {
    if (!this.submitted || this.mode !== 'new' || this._newName()) {
      return '';
    }
    return 'Enter the customer’s name.';
  }

  get phoneError(): string {
    if (!this.submitted || this.mode !== 'new') {
      return '';
    }
    return normalisePhone(this._value('customer_phone')).length === 10 ? '' : 'Enter a 10-digit phone number.';
  }

  get quotationNameError(): string {
    const name = this._value('quatation_name').trim();
    return this.submitted && name.length > 191 ? 'Use 191 characters or fewer.' : '';
  }

  /** An existing customer with the name or phone being typed, so it is not added twice. */
  get duplicate(): CustomerOption | null {
    if (this.mode !== 'new') {
      return null;
    }
    const name = this._newName().toLowerCase();
    const phone = normalisePhone(this._value('customer_phone'));
    return (
      this.customers.find(
        (c) => (name && c.name.trim().toLowerCase() === name) || (phone.length === 10 && normalisePhone(c.phone) === phone)
      ) || null
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this._open();
    }
  }

  loadCustomers(): void {
    this.loadingCustomers = true;
    this.customersFailed = false;
    this._dataService
      .getCustomerOptions()
      .pipe(finalize(() => (this.loadingCustomers = false)))
      .subscribe({
        next: (res) => {
          if (!res?.success) {
            this.customersFailed = true;
            return;
          }
          this.customers = (res.data || [])
            .map((c: any) => ({
              id: Number(c.id),
              name: (c.name || '').toString(),
              phone: (c.phone || '').toString(),
              marginId: c.default_order_type_margin_id != null ? Number(c.default_order_type_margin_id) : null,
            }))
            .sort((a: CustomerOption, b: CustomerOption) => a.name.localeCompare(b.name));
          // A fabricator with no customers yet starts by typing the first one.
          if (!this.customers.length && !this.editing) {
            this.mode = 'new';
          }
          this._fillName();
          this._fillMargin();
        },
        error: () => (this.customersFailed = true),
      });
  }

  onFilter(event: { filter?: string }): void {
    this.filterText = (event?.filter || '').trim();
  }

  /** Switch to typing a new customer; the search text becomes the name. */
  startNewCustomer(): void {
    this.customerDropdown?.hide();
    this.mode = 'new';
    this.form.patchValue({ customer_id: null, customer_name: this.filterText, customer_phone: '' });
    this.filterText = '';
    this.saveError = '';
    this.focusFirst();
  }

  chooseExisting(customer?: CustomerOption | null): void {
    this.mode = 'existing';
    this.form.patchValue({ customer_id: customer ? customer.id : null, customer_name: '', customer_phone: '' });
    this.saveError = '';
    this.focusFirst();
  }

  /** Put the keyboard on the first field: the picker, or the new customer's name. */
  focusFirst(): void {
    setTimeout(() => {
      const id = this.mode === 'new' ? (this._newName() ? 'nq-new-phone' : 'nq-new-name') : 'nq-customer';
      document.getElementById(id)?.focus();
    });
  }

  onMarginChange(): void {
    this.marginEdited = true;
  }

  onNameInput(): void {
    this.nameEdited = this._value('quatation_name').trim() !== '';
  }

  close(): void {
    if (this.saving) {
      return;
    }
    this.closed.emit();
  }

  submit(): void {
    this.submitted = true;
    this.saveError = '';
    // Asked first, so a half-typed site address shows its messages with the others.
    const siteProblem = !!this.site?.hasProblem();
    if (this.saving || siteProblem || this.customerError || this.newNameError || this.phoneError || this.quotationNameError) {
      return;
    }
    // A new customer takes the typed address with it (its first, so its default);
    // for an existing one the address chosen, or typed and saved to the customer, is sent by id.
    const site = this.mode === 'existing' ? this.site : undefined;
    this.saving = true;
    this._customerId()
      .pipe(
        switchMap((customerId) => (site ? site.resolve(customerId) : of(null)).pipe(map((addressId) => ({ customerId, addressId })))),
        switchMap(({ customerId, addressId }) => {
          const body: any = { customer_id: customerId, quatation_name: this._value('quatation_name').trim() };
          if (addressId && !this.quotation) {
            body.customer_address_id = addressId;
          }
          // Left out, the API applies the customer's own price list.
          const marginId = Number(this._value('order_type_margin_id'));
          if (!this.quotation && marginId) {
            body.order_type_margin_id = marginId;
          }
          return this.quotation
            ? this._dataService.editQuotationDetail({ ...body, id: this.quotation.id })
            : this._dataService.addQuotationDetail(body);
        }),
        switchMap((res) => (res?.success ? of(res) : throwError(() => res?.message || ''))),
        finalize(() => (this.saving = false))
      )
      .subscribe({
        next: (res) => this.saved.emit(Number(res.data?.id ?? this.quotation?.id)),
        error: (err) =>
          (this.saveError = errorText(
            err,
            this.editing ? 'We could not save the quotation. Try again.' : 'We could not create the quotation. Try again.'
          )),
      });
  }

  /** The chosen customer's id; a new customer is saved first. */
  private _customerId(): Observable<number> {
    if (this.mode === 'existing') {
      return of(Number(this._value('customer_id')));
    }
    return this._dataService
      .addCustomerInline(this._newCustomer())
      .pipe(
        switchMap((res) => {
          if (!res?.success || !res.data?.id) {
            return throwError(() => res?.message || 'We could not add the customer. Try again.');
          }
          // The customer now exists. If the next step fails, a second try
          // must reuse it instead of adding it again.
          const added: CustomerOption = { id: Number(res.data.id), name: res.data.name, phone: res.data.phone || '' };
          this.customers = [...this.customers, added].sort((a, b) => a.name.localeCompare(b.name));
          this.mode = 'existing';
          this.form.patchValue({ customer_id: added.id }, { emitEvent: false });
          return of(added.id);
        })
      );
  }

  /** Name and phone; with the site address typed in the dialog, and its state, when there is one. */
  private _newCustomer(): { name: string; phone: string; state_code?: string; address?: any } {
    const customer = { name: this._newName(), phone: normalisePhone(this._value('customer_phone')) };
    const address = this.site?.newAddressPayload();
    const stateCode = this.site?.newAddress()?.state_code;
    return address ? { ...customer, ...(stateCode ? { state_code: stateCode } : {}), address } : customer;
  }

  private _newName(): string {
    return this._value('customer_name').trim();
  }

  /** Read from the control, not form.value: inside valueChanges the parent value is still the old one. */
  private _value(name: string): any {
    return this.form.controls[name].value ?? '';
  }

  private _open(): void {
    this.submitted = false;
    this.saving = false;
    this.saveError = '';
    this.filterText = '';
    this.mode = 'existing';
    this.nameEdited = this.editing;
    this.marginEdited = false;
    this.form.reset(
      {
        customer_id: this.quotation?.customerId ?? this.customerId ?? null,
        customer_name: '',
        customer_phone: '',
        quatation_name: this.quotation?.name ?? '',
        order_type_margin_id: null,
      },
      { emitEvent: false }
    );
    this.loadCustomers();
    if (!this.editing) {
      this._loadMargins();
    }
  }

  /** The price lists; without them the field stays hidden and the API applies the customer's own. */
  private _loadMargins(): void {
    this._dataService.getMarginOptions().subscribe({
      next: (res) => {
        this.margins = res?.success
          ? (res.data || []).map((m: any) => ({ id: Number(m.id), label: `${m.name} (${Number(m.mark_up)}%)` }))
          : [];
        this._fillMargin();
      },
      error: () => (this.margins = []),
    });
  }

  /** Pre-selects the price list of the chosen customer, until the user picks one. */
  private _fillMargin(): void {
    if (this.marginEdited || this.editing) {
      return;
    }
    const chosen = this.customers.find((c) => c.id === Number(this.form.controls['customer_id'].value));
    const id = this.mode === 'existing' && chosen?.marginId && this.margins.some((m) => m.id === chosen.marginId) ? chosen.marginId : null;
    this.form.controls['order_type_margin_id'].setValue(id, { emitEvent: false });
  }

  private _fillName(): void {
    if (this.nameEdited) {
      return;
    }
    const customer =
      this.mode === 'new'
        ? this._newName()
        : this.customers.find((c) => c.id === Number(this.form.controls['customer_id'].value))?.name || '';
    this.form.controls['quatation_name'].setValue(defaultQuotationName(customer), { emitEvent: false });
  }
}
