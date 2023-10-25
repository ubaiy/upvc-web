import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { IPaymentTypeDto } from 'src/app/shared/model/paymentTerms/paymentTerms.model';
import { ITypeMarginDto } from 'src/app/shared/model/type-margin/typeMargin.model';
import { PaymentTermsService } from 'src/app/views/payment-terms/payment-terms.service';
import { TypeMarginService } from 'src/app/views/type-margin/type-margin.service';
import { QuotationService } from '../../quotation.service';
import { saveAs } from 'file-saver';
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
  constructor(
    private _fb: FormBuilder,
    public ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
    private _typeMarginService: TypeMarginService,
    private _paymentTermsService: PaymentTermsService,
    private _dataService: QuotationService
  ) {
    this.form = this._initFrom();
    this._getDrpData();
    this.name = this.config.data.name;
  }

  get f() {
    return this.form.controls;
  }

  private _getDrpData() {
    this._paymentTermsService.getPaymentTypeList().subscribe((res) => {
      if (res.success) {
        this.paymentTerms = res.data;
      }
    });
    this._typeMarginService.getTypeMarginList().subscribe((res) => {
      if (res.success) {
        this.margins = res.data;
      }
    });
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
        };
      }
      this._dataService.getPDF(data).subscribe(
        (res) => {
          const blob = new Blob([res], { type: 'application/pdf' });
          saveAs(blob, `${this.name}'s Quotation.pdf`); // Trigger the download
          // Close the dialog here
          this.ref.close();
        },
        (err) => {
          // Handle any errors here
        }
      );
    }
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
