import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ITypeMarginDto } from 'src/app/shared/model/type-margin/typeMargin.model';
import { TypeMarginService } from './type-margin.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';

@Component({
  selector: 'app-type-margin',
  templateUrl: './type-margin.component.html',
  styleUrls: ['./type-margin.component.scss'],
})
export class TypeMarginComponent {
  typeMargins: ITypeMarginDto[] = [];
  form: FormGroup;
  visible: boolean = false;
  edit: boolean = false;
  submitted: boolean = false;
  inputValue: string = '';
  constructor(
    private _activeRoute: ActivatedRoute,
    private _fb: FormBuilder,
    private _dataService: TypeMarginService,
    private _toastService: ToastService,
    private confirmationDialogService: ConfirmationDialogService
  ) {
    this.typeMargins = this._activeRoute.snapshot.data['list'];
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
          .editTypeMargin(this.form.getRawValue())
          .subscribe((res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this.visible = false;
              this.form.reset();
              this.submitted = false;
              this.form.markAsUntouched();
              this._dataService.getTypeMarginList().subscribe((res) => {
                if (res.success) {
                  this.typeMargins = res.data;
                }
              });
            } else {
              this._toastService.showError(res.message);
              this.visible = false;
              this.form.reset();
              this.submitted = false;
              this.form.markAsUntouched();
              this._dataService.getTypeMarginList().subscribe((res) => {
                if (res.success) {
                  this.typeMargins = res.data;
                }
              });
            }
          });
      } else {
        this._dataService
          .addTypeMargin(this.form.getRawValue())
          .subscribe((res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this.visible = false;
              this.form.reset();
              this.submitted = false;
              this.form.markAsUntouched();
              this._dataService.getTypeMarginList().subscribe((res) => {
                if (res.success) {
                  this.typeMargins = res.data;
                }
              });
            } else {
              this._toastService.showError(res.message);
              this.visible = false;
              this.form.reset();
              this.submitted = false;
              this.form.markAsUntouched();
              this._dataService.getTypeMarginList().subscribe((res) => {
                if (res.success) {
                  this.typeMargins = res.data;
                }
              });
            }
          });
      }
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

  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
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

  public closeModal() {
    this.visible = false;
    this.form.reset();
    this.submitted = false;
    this.form.markAsUntouched();
  }

  public handleFormModal(event: any) {
    this.visible = event;
  }

  public deleteTypeMargin(data: ITypeMarginDto) {
    this.confirmationDialogService.confirm(
      'Are you sure!',
      `Are you sure you want to Delete ${data.name}? `,
      'pi-info-circle',
      () => {
        this._dataService.deleteTypeMarginDetail(data.id).subscribe(
          (res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._dataService.getTypeMarginList().subscribe((res) => {
                if (res.success) {
                  this.typeMargins = res.data;
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

  public openModel(typeMargin?: ITypeMarginDto) {
    if (typeMargin) {
      this.visible = true;
      this.edit = true;
      this.form = this._initForm(typeMargin);
    } else {
      this.visible = true;
      this.edit = false;
      this.form = this._initForm();
    }
  }

  private _initForm(typeMargin?: ITypeMarginDto): FormGroup {
    let fg: FormGroup = this._fb.group({
      id: [''],
      name: ['', [Validators.required]],
      mark_up: ['', [Validators.required, Validators.pattern('^[0-9]*$')]],
      pricing: ['', [Validators.required, Validators.pattern('^[0-9]*$')]],
    });
    if (typeMargin) {
      fg.patchValue(typeMargin);
    }
    return fg;
  }
}
