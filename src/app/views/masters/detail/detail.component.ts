import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IMasterDetailDto } from 'src/app/shared/model/masters/masterDetail.model';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { DropdownService } from 'src/app/shared/services/dropdown.service';
import { MastersService } from '../masters.service';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-detail',
  templateUrl: './detail.component.html',
  styleUrls: ['./detail.component.scss'],
})
export class DetailComponent {
  title: string;
  form: FormGroup;
  submitted: boolean = false;
  editable: boolean = false;
  detail: IMasterDetailDto;
  costheadList: [];
  costheadTypeList: [];
  categoryList: [] = [];
  unitList: [] = [];
  constructor(
    private confirmationDialogService: ConfirmationDialogService,
    private _router: Router,
    private _activeRoute: ActivatedRoute,
    private _fb: FormBuilder,
    private _dropdownService: DropdownService,
    private _location: Location,
    private _dataService: MastersService,
    private _toastService: ToastService
  ) {
    let data = this._activeRoute.snapshot.data;
    this.detail = data['data'];
    this.form = this._initForm();
    this.costheadList = data['costheadList'];
    this.categoryList = data['category'];
    this.unitList = data['unitList'];
    if (this.detail) {
      this.editable = true;
      this.form.patchValue(this.detail);
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
          .editCostHeadDetail(this.form.getRawValue())
          .subscribe((res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._location.back();
            } else {
              this._toastService.showError(res.message);
            }
          });
      } else {
        this._dataService
          .addCostHeadDetail(this.form.getRawValue())
          .subscribe((res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._location.back();
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
          this._location.back();
        },
        () => {
          console.log('Action rejected');
        }
      );
    } else {
      this._location.back();
    }
  }

  private _initForm(): FormGroup {
    let fb = this._fb.group({
      id: [''],
      product_no: ['', [Validators.required]],
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      type: ['', [Validators.required]],
      cost: [
        '',
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)],
      ],
      unit: ['', [Validators.required]],
      category: [''],
      costhead: ['', [Validators.required]],
    });
    fb.controls.costhead.valueChanges.subscribe((res) => {
      if (res) {
        let query = {
          costhead: res,
        };
        this._dropdownService.getCostheadTypeList(query).subscribe((res) => {
          if (res.success) {
            this.costheadTypeList = res.data;
          }
        });
      } else {
        this.costheadTypeList = [];
      }
    });
    return fb;
  }
}
