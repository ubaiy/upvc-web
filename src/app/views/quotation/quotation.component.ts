import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import { IQuotationDto } from 'src/app/shared/model/quotation/quotation.model';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { QuotationService } from './quotation.service';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-quotation',
  templateUrl: './quotation.component.html',
  styleUrls: ['./quotation.component.scss'],
})
export class QuotationComponent {
  quotationList: IQuotationDto[] = [];
  inputValue: string = '';
  constructor(
    private _activeRoute: ActivatedRoute,
    private confirmationDialogService: ConfirmationDialogService,
    private _dataService: QuotationService,
    private _toastService: ToastService
  ) {
    this.quotationList = this._activeRoute.snapshot.data['list'];
    this.quotationList?.forEach((e) => {
      e.customer_address = JSON.parse(e.customer_address);
    });
    console.log(this.quotationList);
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

  public deleteQuotation(data: IQuotationDto) {
    this.confirmationDialogService.confirm(
      'Are you sure!',
      `Are you sure you want to Delete Quotation of ${data.name}? `,
      'pi-info-circle',
      () => {
        this._dataService.deleteQuotation(data.id).subscribe(
          (res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._dataService.getQuotationList().subscribe((res) => {
                if (res.success) {
                  this.quotationList = res.data;
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
