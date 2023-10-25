import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from 'src/app/shared/services/toast.service';
import { SortEvent } from 'primeng/api';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ProfileColorService } from '../profile-color.service';
@Component({
  selector: 'app-details',
  templateUrl: './detail.component.html',
  styleUrls: ['./detail.component.scss'],
})
export class DetailComponent {
  editable: boolean = false;
  form: FormGroup;
  submitted: boolean = false;
  constructor(
    private _activeRoute: ActivatedRoute,
    private _router: Router,
    private _fb: FormBuilder,
    private _dataService: ProfileColorService,
    private confirmationDialogService: ConfirmationDialogService,
    private _toastService: ToastService
  ) {
    let data = this._activeRoute.snapshot.data;
    this.editable = data['edit'];
    this.form = this._initForm();
    if (this.editable) {
      this.form.patchValue(data['data']);
      if (data['data'].is_default === 1) {
        this.form.disable();
      }
    }
  }

  get f() {
    return this.form.controls;
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
          this._router.navigate(['/masters/profile-color']);
        },
        () => {
          console.log('Action rejected');
        }
      );
    } else {
      this._router.navigate(['/masters/profile-color']);
    }
  }

  public closeModal() {
    this._router.navigate(['/masters/profile-color']);
  }

  public submit() {
    this.submitted = true;
    if (this.form.valid) {
      if (this.editable) {
        this._dataService
          .updateColor(this.form.getRawValue())
          .subscribe((res: any) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._router.navigate(['/masters/profile-color']);
            } else {
              this._toastService.showError(res.message);
            }
          });
      } else {
        this._dataService
          .addColor(this.form.getRawValue())
          .subscribe((res: any) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._router.navigate(['/masters/profile-color']);
            } else {
              this._toastService.showError(res.message);
            }
          });
      }
    }
  }

  private _initForm(): FormGroup {
    let fg = this._fb.group({
      id: [''],
      color_name: ['', [Validators.required]],
      color_code: ['', [Validators.required]],
      is_default: [''],
    });
    return fg;
  }
}
