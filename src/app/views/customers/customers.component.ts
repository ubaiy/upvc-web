import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import { ICustomerDto } from 'src/app/shared/model/customer/customer.model';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { CustomerService } from './customer.service';
import { ToastService } from 'src/app/shared/services/toast.service';
@Component({
  selector: 'app-customers',
  templateUrl: './customers.component.html',
  styleUrls: ['./customers.component.scss'],
})
export class CustomersComponent {
  customers: ICustomerDto[] = [];
  inputValue: string = '';
  constructor(
    private _activeRoute: ActivatedRoute,
    private _confrimationDialogService: ConfirmationDialogService,
    private _dataService: CustomerService,
    private _toastService: ToastService
  ) {
    this.customers = this._activeRoute.snapshot.data['list'];
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

  public deleteCustomer(customer: ICustomerDto) {
    this._confrimationDialogService.confirm(
      'Are you sure!',
      `Are you sure you want to Delete ${customer.name}? `,
      'pi-info-circle',
      () => {
        this._dataService.deleteCustomer(customer.id).subscribe(
          (res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._dataService.getCustomerList().subscribe((res) => {
                if (res.success) {
                  this.customers = res.data;
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

  clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }
}
