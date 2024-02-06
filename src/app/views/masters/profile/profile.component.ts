import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import { IProductListDto } from 'src/app/shared/model/profile/productList.model';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { BulkPriceUpdateService } from '../../bulk-price-upload/bulk-price-update.service';
import { ProfileService } from './profile.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent {
  profileList: IProductListDto[] = [];
  inputValue: string = '';
  form: FormGroup;
  submitted: boolean = false;
  data: any;
  constructor(
    private _activeRoute: ActivatedRoute,
    private _fb: FormBuilder,
    private confirmationDialogService: ConfirmationDialogService,
    private _toastService: ToastService,
    private _dataService: BulkPriceUpdateService,
    private _profileService: ProfileService
  ) {
    this.profileList = this._activeRoute.snapshot.data['list'];
    this.form = this._initForm();
    this.data = this._activeRoute.snapshot.data['data'];
    this.form.patchValue(this._activeRoute.snapshot.data['data']);
  }

  get f() {
    return this.form.controls;
  }

  private _initForm(): FormGroup {
    let fg = this._fb.group({
      per_kg: [
        '',
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)],
      ],
      rate_bar: [
        '',
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)],
      ],
      color_per_kg: [
        '',
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)],
      ],
      color_rate_bar: [
        '',
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)],
      ],
    });
    return fg;
  }

  public toggleWarningModal() {
    if (this.form.dirty && this.form.touched) {
      this.confirmationDialogService.confirm(
        'Are you sure!',
        'Are you sure you want to Cancel ? ',
        'pi-info-circle',
        () => {
          this.form.patchValue(this.data);
        },
        () => {
          console.log('Action rejected');
        }
      );
    } else {
      this.form.patchValue(this.data);
    }
  }

  public submit() {
    this.submitted = true;
    if (this.form.valid) {
      this._dataService
        .postBulkPrice(this.form.getRawValue())
        .subscribe((res) => {
          if (res.success) {
            this._toastService.showSuccess(res.message);
            this._profileService.getProductList().subscribe((res) => {
              console.log(res);
              if (res.success) {
                this.profileList = res.data;
              }
            });
          } else {
            this._toastService.showError(res.message);
          }
        });
    }
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

  clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }
}
