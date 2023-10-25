import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AreaService } from './area.service';
import { IAreaDto } from 'src/app/shared/model/area/area.model';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';

@Component({
  selector: 'app-area',
  templateUrl: './area.component.html',
  styleUrls: ['./area.component.scss'],
})
export class AreaComponent {
  areas: IAreaDto[] = [];
  form: FormGroup;
  visible: boolean = false;
  edit: boolean = false;
  submitted: boolean = false;
  inputValue: string;
  constructor(
    private _activeRoute: ActivatedRoute,
    private _fb: FormBuilder,
    private _dataService: AreaService,
    private confirmationDialogService: ConfirmationDialogService,
    private _toastService: ToastService
  ) {
    this.areas = this._activeRoute.snapshot.data['list'];
    this.form = this._initForm();
  }

  get f() {
    return this.form.controls;
  }

  public submit() {
    this.submitted = true;
    if (this.form.valid) {
      if (this.edit) {
        this._dataService.editArea(this.form.getRawValue()).subscribe((res) => {
          if (res.success) {
            this.visible = false;
            this._toastService.showSuccess(res.message);
            this.form.reset();
            this.submitted = false;
            this.form.markAsUntouched();
            this._dataService.getAreaList().subscribe((res) => {
              if (res.success) {
                this.areas = res.data;
              }
            });
          } else {
            this._toastService.showError(res.message);
            this.visible = false;
            this.form.reset();
            this.submitted = false;
            this.form.markAsUntouched();
            this._dataService.getAreaList().subscribe((res) => {
              if (res.success) {
                this.areas = res.data;
              }
            });
          }
        });
      } else {
        this._dataService.addArea(this.form.getRawValue()).subscribe((res) => {
          if (res.success) {
            this.visible = false;
            this.form.reset();
            this.submitted = false;
            this.form.markAsUntouched();
            this._dataService.getAreaList().subscribe((res) => {
              if (res.success) {
                this.areas = res.data;
              }
            });
            this._toastService.showSuccess(res.message);
          } else {
            this.visible = false;
            this.form.reset();
            this.submitted = false;
            this.form.markAsUntouched();
            this._dataService.getAreaList().subscribe((res) => {
              if (res.success) {
                this.areas = res.data;
              }
            });
            this._toastService.showError(res.message);
          }
        });
      }
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

  public handleFormModal(event: any) {
    this.visible = event;
  }

  public openModel(area?: IAreaDto) {
    if (area) {
      this.visible = true;
      this.edit = true;
      this.form = this._initForm(area);
    } else {
      this.visible = true;
      this.edit = false;
      this.form = this._initForm();
    }
  }

  private _initForm(area?: IAreaDto): FormGroup {
    let fg: FormGroup = this._fb.group({
      id: [''],
      name: ['', [Validators.required]],
    });
    if (area) {
      fg.patchValue(area);
    }
    return fg;
  }
}
