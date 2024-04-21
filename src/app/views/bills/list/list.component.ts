import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BillsService } from '../bills.service';
import { Table } from 'primeng/table';
import { ConfirmationDialogService } from '../../../shared/services/confirmationdialog.service';
import { SortEvent } from 'primeng/api';
@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
})
export class ListComponent {
  bills: any[] = [];
  form: FormGroup;
  visible: boolean = false;
  edit: boolean = false;
  submitted: boolean = false;
  inputValue: string = '';
  constructor(
    private _activeRoute: ActivatedRoute,
    private _fb: FormBuilder,
    private _dataService: BillsService,
    private confirmationDialogService: ConfirmationDialogService
  ) {
    this.bills = this._activeRoute.snapshot.data['list'];
    this.form = this._initForm();
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

  public openModel(bills?: any) {
    if (bills) {
      this.visible = true;
      this.edit = true;
      this.form = this._initForm(bills);
    } else {
      this.visible = true;
      this.edit = false;
      this.form = this._initForm();
    }
  }

  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }

  private _initForm(bills?: any): FormGroup {
    let fg: FormGroup = this._fb.group({
      id: [''],
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
    });
    if (bills) {
      fg.patchValue(bills);
    }
    return fg;
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
}
