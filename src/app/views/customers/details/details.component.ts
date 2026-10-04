import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, concat, forkJoin, Observable, of, switchMap, toArray } from 'rxjs';
import { Crumb } from 'src/app/shared/components/page-header/page-header.component';
import { IResponseDto } from 'src/app/shared/model/common/response.model';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ConfirmationDialogService } from '../../../shared/services/confirmationdialog.service';
import { BillRow, billsOf, toBillRows } from '../../bills/bills.adapter';
import { BillsService } from '../../bills/bills.service';
import {
  AddressValue,
  CustomerFormValue,
  CustomerQuotationRow,
  GstState,
  gstinStateCode,
  isBlankAddress,
  isValidGstin,
  normaliseGstin,
  quotationsOf,
  toAddressPayload,
  toAddressValues,
  toCustomerPayload,
} from '../customer.adapter';
import { CustomerService } from '../customer.service';

/** A block that has anything in it needs the whole address; an empty one is fine. */
function addressComplete(group: AbstractControl): ValidationErrors | null {
  const value = group.value as AddressValue;
  if (!value.id && isBlankAddress(value)) {
    return null;
  }
  const errors: ValidationErrors = {};
  if (!value.address.trim()) errors['address'] = true;
  if (!value.city.trim()) errors['city'] = true;
  if (!value.state_code) errors['state_code'] = true;
  if (!/^[1-9][0-9]{5}$/.test(value.zip_code.trim())) errors['zip_code'] = true;
  return Object.keys(errors).length ? errors : null;
}

function gstin(control: AbstractControl): ValidationErrors | null {
  return !normaliseGstin(control.value) || isValidGstin(control.value) ? null : { gstin: true };
}

@Component({
  selector: 'app-details',
  templateUrl: './details.component.html',
  styleUrls: ['./details.component.scss'],
})
export class DetailsComponent implements OnInit {
  state: 'loading' | 'error' | 'ready' = 'loading';
  historyState: 'loading' | 'error' | 'ready' = 'loading';
  editable = false;
  customerId: number | null = null;
  customerName = '';
  submitted = false;
  saving = false;

  states: GstState[] = [];
  companyStateCode = '';
  form: FormGroup = this._initForm();
  quotations: CustomerQuotationRow[] = [];
  bills: BillRow[] = [];

  constructor(
    private _activeRoute: ActivatedRoute,
    private _router: Router,
    private _fb: FormBuilder,
    private _dataService: CustomerService,
    private _billsService: BillsService,
    private _confirm: ConfirmationDialogService,
    private _toastService: ToastService
  ) {}

  ngOnInit(): void {
    const id = Number(this._activeRoute.snapshot.params['id']);
    this.editable = !!this._activeRoute.snapshot.data['edit'];
    this.customerId = this.editable && id ? id : null;
    this.load();
  }

  get title(): string {
    return this.editable ? this.customerName || 'Customer' : 'New customer';
  }

  get crumbs(): Crumb[] {
    return [{ label: 'Customers', link: '/customers' }, { label: this.title }];
  }

  get addresses(): FormArray {
    return this.form.get('addresses') as FormArray;
  }

  /** The state a valid GSTIN names; the first address must agree with it. */
  get gstinState(): string {
    return gstinStateCode(this.form.get('gstin')?.value);
  }

  get stateMismatch(): boolean {
    const first = this.addresses.at(0)?.value as AddressValue | undefined;
    return !!this.gstinState && !!first?.state_code && first.state_code !== this.gstinState;
  }

  load(): void {
    this.state = 'loading';
    forkJoin({
      states: this._dataService.getStates(),
      // The company's state only pre-selects the list; the form works without it.
      settings: this._dataService.getCompanySettings().pipe(catchError(() => of(null))),
      customer: this.customerId ? this._dataService.getCustomerDetail(this.customerId) : of(null),
    }).subscribe({
      next: ({ states, settings, customer }) => {
        if (!states.success || (customer && !customer.success)) {
          this.state = 'error';
          return;
        }
        this.states = states.data || [];
        this.companyStateCode = settings?.data?.state_code || '';
        this._fill(customer?.data);
        this.state = 'ready';
      },
      error: () => (this.state = 'error'),
    });
    if (this.customerId) {
      this.loadHistory();
    }
  }

  /** This customer's quotations and bills. Its own state: a failure here leaves the form usable. */
  loadHistory(): void {
    const id = this.customerId as number;
    this.historyState = 'loading';
    forkJoin({
      quotations: this._billsService.getQuotations(),
      bills: this._billsService.getBillsList(),
    }).subscribe({
      next: ({ quotations, bills }) => {
        if (!quotations.success || !bills.success) {
          this.historyState = 'error';
          return;
        }
        this.quotations = quotationsOf(id, quotations.data);
        this.bills = billsOf(id, toBillRows(bills.data, quotations.data));
        this.historyState = 'ready';
      },
      error: () => (this.historyState = 'error'),
    });
  }

  setPriceList(value: 'retail' | 'dealer'): void {
    this.form.get('price_list')?.setValue(value);
    this.form.markAsDirty();
  }

  /** A valid GSTIN names its state, so the first address follows it. */
  onGstinChange(): void {
    const control = this.form.get('gstin');
    control?.setValue(normaliseGstin(control.value), { emitEvent: false });
    if (this.gstinState) {
      this.addresses.at(0)?.get('state_code')?.setValue(this.gstinState);
    }
  }

  addAddress(): void {
    this.addresses.push(this._addressGroup());
  }

  removeAddress(index: number): void {
    const value = this.addresses.at(index).value as AddressValue;
    if (!value.id) {
      this.addresses.removeAt(index);
      return;
    }
    this._confirm.confirm(
      'Remove this address?',
      'Quotations already written to this address keep it.',
      'pi-exclamation-triangle',
      () => {
        this._dataService.deleteCustomerAddress(value.id as number).subscribe({
          next: (res) => {
            if (res.success) {
              this.addresses.removeAt(index);
              this._toastService.showSuccess('Address removed');
            } else {
              this._toastService.showError(res.message);
            }
          },
          error: (err) => this._toastService.showError(err?.error?.message || 'Could not remove the address'),
        });
      },
      () => {}
    );
  }

  invalid(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.invalid && (control.touched || this.submitted);
  }

  addressInvalid(index: number, field: string): boolean {
    const group = this.addresses.at(index);
    return !!group.errors?.[field] && (!!group.get(field)?.touched || this.submitted);
  }

  cancel(): void {
    if (!this.form.dirty) {
      this._router.navigate(['/customers']);
      return;
    }
    this._confirm.confirm(
      'Discard your changes?',
      'What you typed on this page will not be saved.',
      'pi-exclamation-triangle',
      () => this._router.navigate(['/customers']),
      () => {}
    );
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid || this.stateMismatch || this.saving) {
      return;
    }
    const value = this.form.getRawValue() as CustomerFormValue;
    const isNew = !this.customerId;
    const payload = toCustomerPayload(value, this.states, isNew);
    const save: Observable<IResponseDto<any>> = isNew
      ? this._dataService.addCustomer(payload)
      : this._dataService.editCustomer({ ...payload, id: this.customerId });

    this.saving = true;
    save
      .pipe(
        switchMap((res) => {
          if (!res.success) {
            throw { error: { message: res.message } };
          }
          const id: number = res.data?.id ?? this.customerId;
          return concat(...this._addressCalls(value.addresses, id, isNew)).pipe(
            toArray(),
            switchMap((results) => {
              const failed = results.find((result) => !result.success);
              if (failed) {
                throw { error: { message: failed.message } };
              }
              return of(id);
            })
          );
        })
      )
      .subscribe({
        next: (id) => {
          this.saving = false;
          this.form.markAsPristine();
          this._toastService.showSuccess(isNew ? `${value.name.trim()} added` : 'Customer saved');
          if (isNew) {
            this._router.navigate(['/customers/edit', id]);
          } else {
            this.submitted = false;
            this.load();
          }
        },
        error: (err) => {
          this.saving = false;
          this._toastService.showError(err?.error?.message || 'Could not save the customer');
        },
      });
  }

  trackByIndex(index: number): number {
    return index;
  }

  /**
   * The first address of a new customer travels with the customer. Every
   * other address is saved through its own endpoint: changed ones are
   * updated, new ones added. The first block is the default.
   */
  private _addressCalls(addresses: AddressValue[], customerId: number, isNew: boolean): Observable<IResponseDto<any>>[] {
    const calls: Observable<IResponseDto<any>>[] = [];
    addresses.forEach((address, index) => {
      const body = toAddressPayload(address, customerId, index === 0, this.states);
      if (address.id) {
        if (this.addresses.at(index).dirty) {
          calls.push(this._dataService.editCustomerAddress(body));
        }
      } else if (!isBlankAddress(address) && !(isNew && index === 0)) {
        calls.push(this._dataService.addCustomerAddress(body));
      }
    });
    return calls;
  }

  private _fill(customer: any): void {
    this.form = this._initForm();
    const addresses = customer ? toAddressValues(customer, this.states) : [];
    if (customer) {
      this.customerName = customer.name || '';
      this.form.patchValue({
        name: customer.name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        gstin: customer.gstin || '',
        price_list: Number(customer.is_dealer) ? 'dealer' : 'retail',
      });
    }
    if (!addresses.length) {
      this.addresses.push(this._addressGroup());
    }
    addresses.forEach((address) => this.addresses.push(this._addressGroup(address)));
  }

  private _initForm(): FormGroup {
    return this._fb.group({
      name: ['', [Validators.required, Validators.maxLength(191)]],
      phone: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      email: ['', [Validators.email]],
      gstin: ['', [gstin]],
      price_list: ['retail'],
      addresses: this._fb.array([]),
    });
  }

  private _addressGroup(address?: AddressValue): FormGroup {
    return this._fb.group(
      {
        id: [address?.id ?? null],
        address: [address?.address ?? ''],
        address_line2: [address?.address_line2 ?? ''],
        city: [address?.city ?? ''],
        // A new address starts in the fabricator's own state.
        state_code: [address ? address.state_code : this.companyStateCode],
        zip_code: [address?.zip_code ?? ''],
      },
      { validators: addressComplete }
    );
  }
}
