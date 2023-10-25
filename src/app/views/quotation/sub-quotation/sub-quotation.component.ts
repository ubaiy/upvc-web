import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import { ISubQuotation } from 'src/app/shared/model/quotation/sub-quotation.model';
import * as sharedClasses from 'src/app/shared/class/sharedClasses';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { PrintQuotationPdfComponent } from './print-quotation-pdf/print-quotation-pdf.component';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { QuotationService } from '../quotation.service';
import { ToastService } from 'src/app/shared/services/toast.service';
@Component({
  selector: 'app-sub-quotation',
  templateUrl: './sub-quotation.component.html',
  styleUrls: ['./sub-quotation.component.scss'],
})
export class SubQuotationComponent {
  data: ISubQuotation;
  inputValue: string = '';
  ref: DynamicDialogRef;
  constructor(
    private _activeRoute: ActivatedRoute,
    public dialogService: DialogService,
    private confirmationDialogService: ConfirmationDialogService,
    private _dataService: QuotationService,
    private _toastService: ToastService
  ) {
    let data = this._activeRoute.snapshot.data['data'];
    this.data = data;
  }

  public customSort(event: SortEvent) {
    sharedClasses.customSort(event);
  }

  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }

  public deleteQuotationProduct(data: ISubQuotation) {
    this.confirmationDialogService.confirm(
      'Are you sure!',
      `Are you sure you want to Delete ? `,
      'pi-info-circle',
      () => {
        this._dataService.deleteQuotationProduct(data.id).subscribe(
          (res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._dataService
                .getQuotationDetail(this.data.id)
                .subscribe((res) => {
                  if (res.success) {
                    this.data = res.data;
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

  show() {
    let ids: number[] = [];
    this.data.quatation_product.forEach((e) => {
      if (e?.selected) {
        ids.push(e.id);
      }
    });
    this.ref = this.dialogService.open(PrintQuotationPdfComponent, {
      header: 'Print Quotation',
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      data: {
        quatation_id: this.data.id,
        name: this.data.customer.name,
        quatation_products: ids,
      },
    });
    this.ref.onClose.subscribe((res) => {
      console.log(res);
    });
  }
}
