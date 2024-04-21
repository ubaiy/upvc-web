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
import { PaymentTermsService } from '../../payment-terms/payment-terms.service';
import { TypeMarginService } from '../../type-margin/type-margin.service';
import { IPaymentTypeDto } from 'src/app/shared/model/paymentTerms/paymentTerms.model';
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
    private _toastService: ToastService,
    private _paymentTermsService: PaymentTermsService,
    private _typeMarginService: TypeMarginService
  ) {
    let data = this._activeRoute.snapshot.data['data'];
    this.data = data;
    this.data.quatation_product.forEach((e, i: number) => {
      e.srno = i + 1;
    });
  }

  public customSort(event: SortEvent) {
    sharedClasses.customSort(event);
  }

  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }

  public deleteQuotationProduct(data: any) {
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

  convertToBill() {
    let ids: number[] = [];
    this.data.quatation_product.forEach((e) => {
      if (e?.selected) {
        ids.push(e.id);
      }
    });
    let paymentTerms: IPaymentTypeDto[];
    let margin;
    this._paymentTermsService.getPaymentTypeList().subscribe((res) => {
      if (res.success) {
        paymentTerms = res.data;
        this._typeMarginService.getTypeMarginList().subscribe((res) => {
          if (res.success) {
            margin = res.data;
            this.ref = this.dialogService.open(PrintQuotationPdfComponent, {
              header: 'Convert To Bill',
              contentStyle: { overflow: 'auto' },
              width: '30%',
              baseZIndex: 10000,
              data: {
                bill: true,
                quatation_id: this.data.id,
                name: this.data.customer.name,
                quatation_products: ids,
                terms: paymentTerms,
                margin: margin,
              },
            });
          }
        });
      }
    });
  }

  show() {
    let ids: number[] = [];
    this.data.quatation_product.forEach((e) => {
      if (e?.selected) {
        ids.push(e.id);
      }
    });
    let paymentTerms: IPaymentTypeDto[];
    let margin;
    this._paymentTermsService.getPaymentTypeList().subscribe((res) => {
      if (res.success) {
        paymentTerms = res.data;
        this._typeMarginService.getTypeMarginList().subscribe((res) => {
          if (res.success) {
            margin = res.data;
            this.ref = this.dialogService.open(PrintQuotationPdfComponent, {
              header: 'Print Quotation',
              contentStyle: { overflow: 'auto' },
              width: '30%',
              baseZIndex: 10000,
              data: {
                bill: false,
                quatation_id: this.data.id,
                name: this.data.customer.name,
                quatation_products: ids,
                terms: paymentTerms,
                margin: margin,
              },
            });
          }
        });
      }
    });
  }
}
