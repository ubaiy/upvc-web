import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { AccessService } from 'src/app/shared/access/access.service';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { saveBlob } from 'src/app/shared/class/download-file';
import { ToastService } from 'src/app/shared/services/toast.service';
import { CustomerService } from '../../customers/customer.service';
import { BillRow, matchesBill, toBillRows } from '../bills.adapter';
import { BillsService } from '../bills.service';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
})
export class ListComponent implements OnInit {
  @ViewChild('rowMenu') rowMenu?: Menu;

  state: 'loading' | 'error' | 'ready' = 'loading';
  bills: BillRow[] = [];
  search = '';
  page = 0;
  menuItems: MenuItem[] = [];
  private readonly _access = inject(AccessService);
  /** The bill the "Cancel bill" dialog is asking about, with the reason typed. */
  cancelling: BillRow | null = null;
  cancelReason = '';
  cancelBusy = false;
  /** Id of the bill whose PDF is being fetched. */
  downloading: number | null = null;
  readonly placeholders = [0, 1, 2, 3, 4, 5];

  constructor(
    private _router: Router,
    private _billService: BillsService,
    private _customerService: CustomerService,
    private _toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    forkJoin({
      bills: this._billService.getBillsList(),
      // Only used to link each bill to its quotation; the list still shows without it.
      quotations: this._billService.getQuotations().pipe(catchError(() => of({ success: false, data: [] as any[] }))),
    }).subscribe({
      next: ({ bills, quotations }) => {
        if (!bills.success) {
          this.state = 'error';
          return;
        }
        this.bills = toBillRows(bills.data, (quotations.success && quotations.data) || []);
        this.state = 'ready';
      },
      error: () => (this.state = 'error'),
    });
  }

  get filtered(): BillRow[] {
    return this.bills.filter((bill) => matchesBill(bill, this.search));
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
  }

  get rows(): BillRow[] {
    const page = Math.min(this.page, this.pageCount - 1);
    return this.filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }

  get countLabel(): string {
    const count = this.filtered.length;
    return `${count} ${count === 1 ? 'bill' : 'bills'}`;
  }

  onSearch(): void {
    this.page = 0;
  }

  clearSearch(): void {
    this.search = '';
    this.page = 0;
  }

  go(step: number): void {
    this.page = Math.min(Math.max(this.page + step, 0), this.pageCount - 1);
  }

  openMenu(event: Event, bill: BillRow): void {
    const items: MenuItem[] = [];
    // Payments of the bill live in views/payments (card PAY2); ?record=1 opens "Record payment" straight away.
    if (!bill.cancelled) {
      items.push({
        label: 'Record payment',
        command: () => this._router.navigate(['/payments/bill', bill.id], { queryParams: { record: 1 } }),
      });
    }
    items.push(
      { label: 'Payments', command: () => this._router.navigate(['/payments/bill', bill.id]) },
      { label: 'Download PDF', command: () => this.download(bill) }
    );
    if (bill.quotationId) {
      items.push({
        label: 'Open quotation',
        command: () => this._router.navigate(['/quotation/detail', bill.quotationId]),
      });
    }
    if (!bill.cancelled) {
      items.push({ separator: true }, { label: 'Cancel bill', styleClass: 'danger', command: () => this.cancel(bill) });
    }
    // Entering a payment is payments.write, cancelling a bill is bills.write; the rest only reads.
    this.menuItems = this._access.menu(items, (item) =>
      item.label === 'Record payment' ? 'payments.write' : item.label === 'Cancel bill' ? 'bills.write' : null
    );
    this.rowMenu?.toggle(event);
  }

  /** One click: the customer's GSTIN comes from the customer, not from a dialog. */
  download(bill: BillRow): void {
    if (this.downloading) {
      return;
    }
    this.downloading = bill.id;
    const gstin$ = bill.customerId
      ? this._customerService.getCustomerDetail(bill.customerId).pipe(
          map((res) => (res.success && (res.data as any)?.gstin) || ''),
          catchError(() => of(''))
        )
      : of('');
    gstin$
      .pipe(
        switchMap((gstin) =>
          this._billService.downloadBillPdf({ bill_id: bill.id, customer_gst_no: gstin, download: true })
        )
      )
      .subscribe({
        next: (file) => {
          this.downloading = null;
          saveBlob(file.blob, file.fileName || `Bill-${bill.number.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`);
        },
        error: () => {
          this.downloading = null;
          this._toastService.showError(`Could not download ${bill.number}. Try again.`);
        },
      });
  }

  /** Opens the dialog that asks why; nothing is cancelled until it is confirmed. */
  cancel(bill: BillRow): void {
    this.cancelling = bill;
    this.cancelReason = '';
  }

  /** The dialog opens from a menu: the cursor goes to the reason, so typing and Enter work at once. */
  focusReason(): void {
    document.getElementById('bill-cancel-reason')?.focus();
  }

  confirmCancel(): void {
    const bill = this.cancelling;
    if (!bill || this.cancelBusy) {
      return;
    }
    this.cancelBusy = true;
    const reason = this.cancelReason.trim();
    this._billService.cancelBill(bill.id, this.cancelReason).subscribe({
      next: (res) => {
        this.cancelBusy = false;
        if (res.success) {
          this.cancelling = null;
          this._toastService.showSuccess(`${bill.number} cancelled`);
          this.bills = this.bills.map((row) => (row.id === bill.id ? { ...row, cancelled: true, cancelReason: reason } : row));
        } else {
          this._toastService.showError(res.message);
        }
      },
      error: (err) => {
        this.cancelBusy = false;
        this._toastService.showError(err?.error?.message || 'Could not cancel the bill');
      },
    });
  }

  trackById(_: number, bill: BillRow): number {
    return bill.id;
  }
}
