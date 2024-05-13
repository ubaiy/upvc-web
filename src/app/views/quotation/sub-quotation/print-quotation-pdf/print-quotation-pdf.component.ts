import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { IPaymentTypeDto } from 'src/app/shared/model/paymentTerms/paymentTerms.model';
import { ITypeMarginDto } from 'src/app/shared/model/type-margin/typeMargin.model';
import { PaymentTermsService } from 'src/app/views/payment-terms/payment-terms.service';
import { TypeMarginService } from 'src/app/views/type-margin/type-margin.service';
import { QuotationService } from '../../quotation.service';
import { saveAs } from 'file-saver';
import { BillsService } from 'src/app/views/bills/bills.service';
import { ToastService } from 'src/app/shared/services/toast.service';
@Component({
  selector: 'app-print-quotation-pdf',
  templateUrl: './print-quotation-pdf.component.html',
  styleUrls: ['./print-quotation-pdf.component.scss'],
})
export class PrintQuotationPdfComponent {
  paymentTerms: IPaymentTypeDto[] = [];
  margins: ITypeMarginDto[] = [];
  form: FormGroup;
  submitted: boolean;
  name: string;
  is_bill: boolean;
  constructor(
    private _fb: FormBuilder,
    public ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
    private _typeMarginService: TypeMarginService,
    private _paymentTermsService: PaymentTermsService,
    private _toastService: ToastService,
    private _dataService: QuotationService,
    private _billService: BillsService
  ) {
    this.form = this._initFrom();
    this.name = this.config.data.name;
    this.paymentTerms = this.config.data.terms;
    this.margins = this.config.data.margin;
    this.is_bill = this.config.data.bill;
  }

  get f() {
    return this.form.controls;
  }

  public submit() {
    this.submitted = true;
    if (this.form.valid) {
      let data;
      if (this.config.data.quatation_products.length) {
        data = {
          quatation_id: this.form.value.quatation_id,
          quatation_products: this.form.value.quatation_products,
          download: this.form.value.download,
          sgst: this.form.value.sgst,
          cgst: this.form.value.cgst,
          igst: this.form.value.igst,
          payment_terms: this.form.value.payment_terms,
          order_type_margin: this.form.value.order_type_margin,
          is_download: true,
        };
      } else {
        data = {
          quatation_id: this.form.value.quatation_id,
          download: this.form.value.download,
          sgst: this.form.value.sgst,
          cgst: this.form.value.cgst,
          igst: this.form.value.igst,
          payment_terms: this.form.value.payment_terms,
          order_type_margin: this.form.value.order_type_margin,
          is_download: true,
        };
      }

      if (this.is_bill) {
        this._billService.getPDF(data).subscribe(
          (res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
            } else {
              this._toastService.showError(res.message);
            }
          },
          (err) => {
            this._toastService.showError(err.error.message);
          }
        );
      } else {
        this._dataService.getPDF(data).subscribe(
          (info) => {
            const filename = 'document.pdf'; // Use the retrieved filename or a default filename

            // Create a Blob URL for the PDF
            const blobUrl = URL.createObjectURL(info);

            // Open the Blob URL in a new tab
            const newTab = window.open(blobUrl, '_blank');
            this.ref.close();

            // Set the filename for the new tab (works in some browsers)
            if (newTab) {
              newTab.document.title = filename;
            }
          },
          (err) => {
            // Handle any errors here
          }
        );
      }
    }
  }

  getFilenameFromUrlOrDefault(blob: Blob, defaultFilename: string): string {
    // Extract filename from the Blob URL or use a default filename
    // const url = (window.URL || window.webkitURL).createObjectURL(blob);
    // const matches = url.match(/\/([^\/?#]+)[^\/]*$/);
    // console.log(matches);
    // if (matches && matches.length > 1) {
    //   return matches[1];
    // } else {
    return defaultFilename;
    // }
  }

  public cancel() {
    this.ref.close();
  }

  private _initFrom(): FormGroup {
    let fg = this._fb.group({
      quatation_id: ['', [Validators.required]],
      quatation_products: [[]],
      download: [true],
      sgst: [true],
      cgst: [true],
      igst: [false],
      payment_terms: ['', [Validators.required]],
      order_type_margin: ['', [Validators.required]],
    });
    fg.patchValue(this.config.data);
    fg.controls.igst.valueChanges.subscribe((res) => {
      if (res) {
        fg.controls.cgst.patchValue(false);
        fg.controls.sgst.patchValue(false);
      }
    });
    fg.controls.cgst.valueChanges.subscribe((res) => {
      if (res) {
        fg.controls.sgst.patchValue(true);
        fg.controls.igst.patchValue(false);
      }
    });
    fg.controls.sgst.valueChanges.subscribe((res) => {
      if (res) {
        fg.controls.cgst.patchValue(true);
        fg.controls.igst.patchValue(false);
      }
    });
    return fg;
  }
}
