import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IAreaDto } from 'src/app/shared/model/area/area.model';
import { ICustomerDto } from 'src/app/shared/model/customer/customer.model';
import { ICustomerAdddressDto } from 'src/app/shared/model/customer/customerAddress.model';
import { CustomerService } from '../../customers/customer.service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { IQuotationDetailDto } from 'src/app/shared/model/quotation/quotation-detail.model';
import { QuotationService } from '../quotation.service';
import { ToastService } from 'src/app/shared/services/toast.service';
@Component({
  selector: 'app-add',
  templateUrl: './add.component.html',
  styleUrls: ['./add.component.scss'],
})
export class AddComponent {
  customerList: ICustomerDto[] = [];
  customerAddressList: ICustomerAdddressDto[] = [];
  areaList: IAreaDto[] = [];
  quotationDetail: IQuotationDetailDto;
  editable: boolean = false;
  form: FormGroup;
  submitted: boolean = false;
  constructor(
    private _activeRoute: ActivatedRoute,
    private _customerService: CustomerService,
    private confirmationDialogService: ConfirmationDialogService,
    private _router: Router,
    private _fb: FormBuilder,
    private _dataService: QuotationService,
    private _toastService: ToastService
  ) {
    let data = this._activeRoute.snapshot.data;
    this.form = this._initFrom();
    this.customerList = data['customerList'];
    this.areaList = data['areaList'];
    this.editable = data['edit'];
    if (this.editable) {
      this.quotationDetail = data['detail'];
      this.quotationDetail.customer_address = JSON.parse(
        data['detail'].customer_address
      );
      let detail = {
        id: this.quotationDetail.id,
        area_id: this.quotationDetail.area_id,
        customer_id: this.quotationDetail.customer_id,
        customer_address_id: this.quotationDetail.customer_address.id,
        quatation_name: this.quotationDetail.quatation_name
      };
      this.form.patchValue(detail);
    }
  }

  get f() {
    return this.form.controls;
  }

  public submit() {
    this.submitted = true;
    if (this.form.valid) {
      if (this.editable) {
        this._dataService
          .editQuotationDetail(this.form.getRawValue())
          .subscribe((res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._router.navigate([`quotation/detail/${res.data.id}`]);
            } else {
              this._toastService.showError(res.message);
            }
          });
      } else {
        this._dataService
          .addQuotationDetail(this.form.getRawValue())
          .subscribe((res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._router.navigate([`quotation/detail/${res.data.id}`]);
            } else {
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
          this._router.navigate(['/quotation']);
        },
        () => {
          console.log('Action rejected');
        }
      );
    } else {
      this._router.navigate(['/quotation']);
    }
  }

  private _initFrom(): FormGroup {
    let fg = this._fb.group({
      id: [''],
      area_id: ['', [Validators.required]],
      customer_id: ['', [Validators.required]],
      customer_address_id: ['', [Validators.required]],
      quatation_name: ['', Validators.required],
    });
    fg.controls.customer_id.valueChanges.subscribe((res) => {
      if (res) {
        let query = {
          customer_id: res,
        };
        this._customerService
          .getCustomerAddressList(query)
          .subscribe((list) => {
            if (list.success) {
              this.customerAddressList = list.data;
            }
          });
      }
    });
    return fg;
  }
}
