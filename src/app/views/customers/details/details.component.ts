import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CustomerService } from '../customer.service';
import { ConfirmationDialogService } from '../../../shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ICustomerAdddressDto } from 'src/app/shared/model/customer/customerAddress.model';
import { SortEvent } from 'primeng/api';
@Component({
  selector: 'app-details',
  templateUrl: './details.component.html',
  styleUrls: ['./details.component.scss'],
})
export class DetailsComponent {
  editable: boolean = false;
  form: FormGroup;
  submitted: boolean = false;
  submittedAddress: boolean = false;
  customerAddresses: Array<ICustomerAdddressDto> = [];
  addressForm: FormGroup;
  visible: boolean = false;
  editAddress: boolean = false;
  customerId: number;
  constructor(
    private _activeRoute: ActivatedRoute,
    private _router: Router,
    private _fb: FormBuilder,
    private _dataService: CustomerService,
    private confirmationDialogService: ConfirmationDialogService,
    private _toastService: ToastService
  ) {
    let data = this._activeRoute.snapshot.data;
    this.editable = data['edit'];
    this.form = this._initForm();
    this.addressForm = this._initAddressForm();
    if (this.editable) {
      this.customerId = data['data'].id;
      this.customerAddresses = data['data'].addresses;
      this.form.patchValue(data['data']);
    }
  }

  get f() {
    return this.form.controls;
  }

  get af() {
    return this.addressForm.controls;
  }

  public customSort(event: SortEvent) {
    if (event.data) {
      event.data.sort((data1, data2) => {
        if (event.field && event.order) {
          let value1 = data1[event.field];
          let value2 = data2[event.field];
          let result = null;

          if (value1 == null && value2 != null) result = -1;
          else if (value1 != null && value2 == null) result = 1;
          else if (value1 == null && value2 == null) result = 0;
          else if (typeof value1 === 'string' && typeof value2 === 'string')
            result = value1.localeCompare(value2);
          else result = value1 < value2 ? -1 : value1 > value2 ? 1 : 0;

          return event.order * result;
        } else {
          return 0;
        }
      });
    }
  }

  public toggleWarningModal() {
    if (this.form.dirty && this.form.touched) {
      this.confirmationDialogService.confirm(
        'Are you sure!',
        'Are you sure you want to Cancel ? ',
        'pi-info-circle',
        () => {
          this._router.navigate(['/customers']);
        },
        () => {
          console.log('Action rejected');
        }
      );
    } else {
      this._router.navigate(['/customers']);
    }
  }

  public deleteCustomerAddress(customer: ICustomerAdddressDto) {
    this.confirmationDialogService.confirm(
      'Are you sure!',
      'Are you sure you want to Delete ? ',
      'pi-info-circle',
      () => {
        this._dataService.deleteCustomerAddress(customer.id).subscribe(
          (res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._dataService
                .getCustomerAddressList(this.customerId)
                .subscribe((res) => {
                  if (res.success) {
                    this.customerAddresses = res.data;
                  }
                });
            } else {
              this._toastService.showError(res.message);
            }
          },
          (err) => {
            this._toastService.showError(err.error.message);
          }
        );
      },
      () => {
        console.log('Action rejected');
      }
    );
  }

  public toggleAddressWarningModal() {
    if (this.addressForm.dirty && this.addressForm.touched) {
      this.confirmationDialogService.confirm(
        'Are you sure!',
        'Are you sure you want to Cancel ? ',
        'pi-info-circle',
        () => {
          this.visible = false;
        },
        () => {
          console.log('Action rejected');
        }
      );
    } else {
      this.visible = false;
    }
  }

  public closeModal() {
    this._router.navigate(['/customers']);
  }

  public submit() {
    this.submitted = true;
    if (this.form.valid) {
      if (this.editable) {
        this._dataService
          .editCustomer(this.form.getRawValue())
          .subscribe((res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this.customerId = res.data.id;
            } else {
              this._toastService.showError(res.message);
            }
          });
      } else {
        this._dataService
          .addCustomer(this.form.getRawValue())
          .subscribe((res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this.customerId = res.data.id;
              this._router.navigate([`customers/edit/${this.customerId}`]);
            } else {
              this._toastService.showError(res.message);
            }
          });
      }
    }
  }

  public submitAddress() {
    console.log(this.addressForm.value);
    this.addressForm.get('customer_id')?.patchValue(this.customerId);
    this.submittedAddress = true;
    if (this.addressForm.valid) {
      if (this.editAddress) {
        this._dataService
          .editCustomerAddress(this.addressForm.getRawValue())
          .subscribe((res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this.visible = false;

              let query = {
                customer_id: this.customerId,
              };
              this._dataService
                .getCustomerAddressList(query)
                .subscribe((res) => {
                  if (res.success) {
                    this.customerAddresses = res.data;
                  }
                });
            } else {
              this._toastService.showError(res.message);
            }
          });
      } else {
        this._dataService
          .addCustomerAddress(this.addressForm.getRawValue())
          .subscribe((res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this.visible = false;
              let query = {
                customer_id: this.customerId,
              };
              this._dataService
                .getCustomerAddressList(query)
                .subscribe((res) => {
                  if (res.success) {
                    this.customerAddresses = res.data;
                  }
                });
            } else {
              this._toastService.showError(res.message);
            }
          });
      }
    }
  }

  public addressAddEdit(address?: ICustomerAdddressDto) {
    this.visible = !this.visible;
    if (address) {
      this.editAddress = true;
      this.addressForm = this._initAddressForm();
      this.addressForm.patchValue(address);
    } else {
      this.editAddress = false;
      this.addressForm = this._initAddressForm();
    }
  }

  public handleFormModal(event: any) {
    this.visible = event;
  }

  private _initForm(): FormGroup {
    let fg = this._fb.group({
      id: [''],
      name: ['', [Validators.required]],
      is_dealer: [false],
      phone: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      email: ['', [Validators.email]],
      identity: ['Auto Generated'],
    });
    fg.controls.identity.disable();
    return fg;
  }

  private _initAddressForm(): FormGroup {
    let fg = this._fb.group({
      id: [''],
      name: ['Hitesh'],
      address: ['', [Validators.required]],
      is_default: [false],
      customer_id: ['', [Validators.required]],
      flat_no: ['1'],
      address_line2: [''],
      city: ['', [Validators.required]],
      state: ['', [Validators.required]],
      country: ['India'],
      zip_code: ['', [Validators.required]],
    });
    return fg;
  }
}
