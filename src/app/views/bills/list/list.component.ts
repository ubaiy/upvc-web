import { Component } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BillsService } from '../bills.service';
import { Table } from 'primeng/table';
import { ConfirmationDialogService } from '../../../shared/services/confirmationdialog.service';
import { SortEvent } from 'primeng/api';
import { IBillListDto } from '../../../shared/model/bill/billList.model';
import { ToastService } from 'src/app/shared/services/toast.service';
@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
})
export class ListComponent {
  bills: IBillListDto[] = [];
  inputValue: string = '';
  visible: boolean = false;
  submitted: boolean = false;
  selectedBill: IBillListDto;
  customerGstin: FormControl = new FormControl();
  constructor(
    private _activeRoute: ActivatedRoute,
    private _billService: BillsService,
    private confirmationDialogService: ConfirmationDialogService,
    private _toastService: ToastService
  ) {
    this.bills = this._activeRoute.snapshot.data['list'];
    console.log(this.bills);
  }

  submit() {
    let data = {
      bill_id: this.selectedBill.id,
      customer_gst_no: this.customerGstin.getRawValue(),
      download: true,
    };
    this._billService.downloadBillPdf(data).subscribe(
      (info) => {
        const filename = 'document.pdf'; // Use the retrieved filename or a default filename

        // Create a Blob URL for the PDF
        const blobUrl = URL.createObjectURL(info);
        this.visible = false;
        this.customerGstin.reset();
        // Open the Blob URL in a new tab
        const newTab = window.open(blobUrl, '_blank');
        // this.ref.close();
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

  public downloadBill(bill: IBillListDto) {
    this.selectedBill = bill;
    this.visible = true;
  }
  public toggleWarningModal() {
    if (this.customerGstin.dirty && this.customerGstin.touched) {
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
  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
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

  public deleteBill(id: number) {
    this.confirmationDialogService.confirm(
      'Are you sure!',
      `Are you sure you want to Delete ? `,
      'pi-info-circle',
      () => {
        this._billService.deleteBill(id).subscribe(
          (res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._billService.getBillsList().subscribe((res) => {
                if (res.success) {
                  this.bills = res.data;
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

  public handleFormModal(event: any) {
    this.customerGstin.patchValue('');
    this.visible = event;
  }
}
