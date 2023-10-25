import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import { IProfileColorDto } from 'src/app/shared/model/profile/profile-color.model';
import { ProfileColorService } from '../profile-color.service';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
})
export class ListComponent {
  profileList: IProfileColorDto[] = [];
  inputValue: string = '';
  constructor(
    private _activeRoute: ActivatedRoute,
    private _dataService: ProfileColorService,
    private confirmationDialogService: ConfirmationDialogService,
    private _toastService: ToastService
  ) {
    this.profileList = this._activeRoute.snapshot.data['data'];
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

  public deleteColor(profile: IProfileColorDto) {
    this.confirmationDialogService.confirm(
      'Are you sure!',
      'Are you sure you want to Delete ? ',
      'pi-info-circle',
      () => {
        this._dataService.deleteColor(profile.id).subscribe(
          (res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._dataService.getList().subscribe((res) => {
                if (res.success) {
                  this.profileList = res.data;
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
}
