import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { PaymentTermsService } from './payment-terms.service';
import { IPaymentTypeDto } from 'src/app/shared/model/paymentTerms/paymentTerms.model';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';

@Component({
  selector: 'app-payment-terms',
  templateUrl: './payment-terms.component.html',
  styleUrls: ['./payment-terms.component.scss'],
})
export class PaymentTermsComponent {
  paymentTypes: IPaymentTypeDto[] = [];
  form: FormGroup;
  visible: boolean = false;
  edit: boolean = false;
  submitted: boolean = false;
  inputValue: string = '';
  constructor(
    private _activeRoute: ActivatedRoute,
    private _fb: FormBuilder,
    private _dataService: PaymentTermsService,
    private confirmationDialogService: ConfirmationDialogService,
    private _toastService: ToastService
  ) {
    this.paymentTypes = this._activeRoute.snapshot.data['list'];
    this.form = this._initForm();
  }

  get f() {
    return this.form.controls;
  }

  public submit() {
    this.submitted = true;
    if (this.form.valid) {
      if (this.edit) {
        this._dataService
          .editPaymentType(this.form.getRawValue())
          .subscribe((res) => {
            if (res.success) {
              this.visible = false;
              this.form.reset();
              this.submitted = false;
              this.form.markAsUntouched();
              this._dataService.getPaymentTypeList().subscribe((res) => {
                if (res.success) {
                  this.paymentTypes = res.data;
                }
              });
              this._toastService.showSuccess(res.message);
            } else {
              this.visible = false;
              this.form.reset();
              this.submitted = false;
              this.form.markAsUntouched();
              this._dataService.getPaymentTypeList().subscribe((res) => {
                if (res.success) {
                  this.paymentTypes = res.data;
                }
              });
              this._toastService.showError(res.message);
            }
          });
      } else {
        this._dataService
          .addPaymentType(this.form.getRawValue())
          .subscribe((res) => {
            if (res.success) {
              this.visible = false;
              this.form.reset();
              this.submitted = false;
              this.form.markAsUntouched();
              this._dataService.getPaymentTypeList().subscribe((res) => {
                if (res.success) {
                  this.paymentTypes = res.data;
                }
              });
              this._toastService.showSuccess(res.message);
            } else {
              this.visible = false;
              this.form.reset();
              this.submitted = false;
              this.form.markAsUntouched();
              this._dataService.getPaymentTypeList().subscribe((res) => {
                if (res.success) {
                  this.paymentTypes = res.data;
                }
              });
              this._toastService.showError(res.message);
            }
          });
      }
    }
  }

  public toggleWarningModal() {
    if (this.form.dirty && this.form.touched) {
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

  public handleFormModal(event: any) {
    this.visible = event;
  }

  public openModel(paymentType?: IPaymentTypeDto) {
    if (paymentType) {
      this.visible = true;
      this.edit = true;
      this.form = this._initForm(paymentType);
    } else {
      this.visible = true;
      this.edit = false;
      this.form = this._initForm();
    }
  }

  public deletePaymentTerms(data: IPaymentTypeDto) {
    this.confirmationDialogService.confirm(
      'Are you sure!',
      `Are you sure you want to Delete ${data.name}? `,
      'pi-info-circle',
      () => {
        this._dataService.deletePaymentTerms(data.id).subscribe(
          (res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._dataService.getPaymentTypeList().subscribe((res) => {
                if (res.success) {
                  this.paymentTypes = res.data;
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

  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }

  private _initForm(paymentType?: IPaymentTypeDto): FormGroup {
    let fg: FormGroup = this._fb.group({
      id: [''],
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
    });
    if (paymentType) {
      fg.patchValue(paymentType);
    }
    return fg;
  }
}
