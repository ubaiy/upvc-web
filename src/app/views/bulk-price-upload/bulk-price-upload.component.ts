import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from 'src/app/shared/services/toast.service';
import { SortEvent } from 'primeng/api';

import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { BulkPriceUpdateService } from './bulk-price-update.service';
@Component({
  selector: 'app-bulk-price-upload',
  templateUrl: './bulk-price-upload.component.html',
  styleUrls: ['./bulk-price-upload.component.scss'],
})
export class BulkPriceUploadComponent {
  editable: boolean = false;
  form: FormGroup;
  submitted: boolean = false;
  constructor(
    private _activeRoute: ActivatedRoute,
    private _router: Router,
    private _fb: FormBuilder,
    private _dataService: BulkPriceUpdateService,
    private confirmationDialogService: ConfirmationDialogService,
    private _toastService: ToastService
  ) {
    let data = this._activeRoute.snapshot.data;
    this.editable = data['edit'];
    // this.form = this._initForm();
    console.log(data['data']);
    if (this.editable) {
      this.form.patchValue(data['data']);
      console.log(this.form);
    }
  }

  get f() {
    return this.form.controls;
  }
  public toggleWarningModal() {
    if (this.form.dirty && this.form.touched) {
      this.confirmationDialogService.confirm(
        'Are you sure!',
        'Are you sure you want to Cancel ? ',
        'pi-info-circle',
        () => {
          this._router.navigate(['/dashboard']);
        },
        () => {
          console.log('Action rejected');
        }
      );
    } else {
      this._router.navigate(['/dashboard']);
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
          } else {
            this._toastService.showError(res.message);
          }
        });
    }
  }
}
