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
    this.form = this._initForm();
    if (this.editable && data['data']) {
      this.form.patchValue(data['data']);
    }
  }

  get f() {
    return this.form.controls;
  }

  // These four factors reprice the ENTIRE catalogue server-side; the API
  // rejects anything that is not > 0 and <= 1,000,000 (audit H5). Mirror
  // that here so a typo of 0 is caught before it is ever sent.
  private _initForm(): FormGroup {
    const priceValidators = [
      Validators.required,
      Validators.pattern(/^\d+(\.\d{1,4})?$/),
      Validators.min(0.0001),
      Validators.max(1000000),
    ];
    return this._fb.group({
      per_kg: ['', priceValidators],
      rate_bar: ['', priceValidators],
      color_per_kg: ['', priceValidators],
      color_rate_bar: ['', priceValidators],
    });
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
