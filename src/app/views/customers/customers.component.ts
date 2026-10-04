import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { CustomerRow, GstState, toCustomerRow } from './customer.adapter';
import { CustomerService } from './customer.service';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-customers',
  templateUrl: './customers.component.html',
  styleUrls: ['./customers.component.scss'],
})
export class CustomersComponent implements OnInit {
  @ViewChild('rowMenu') rowMenu?: Menu;

  state: 'loading' | 'error' | 'ready' = 'loading';
  customers: CustomerRow[] = [];
  search = '';
  page = 0;
  menuItems: MenuItem[] = [];
  readonly placeholders = [0, 1, 2, 3, 4, 5];

  constructor(
    private _router: Router,
    private _confirm: ConfirmationDialogService,
    private _dataService: CustomerService,
    private _toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    forkJoin({
      list: this._dataService.getCustomerList(),
      // The state name is a nicety on this list; a failure there must not hide the customers.
      states: this._dataService.getStates().pipe(catchError(() => of({ success: false, data: [] as GstState[] }))),
    }).subscribe({
      next: ({ list, states }) => {
        if (!list.success) {
          this.state = 'error';
          return;
        }
        const stateList = (states.success && states.data) || [];
        this.customers = (list.data || [])
          .map((dto) => toCustomerRow(dto, stateList))
          .sort((a, b) => a.name.localeCompare(b.name));
        this.state = 'ready';
      },
      error: () => (this.state = 'error'),
    });
  }

  get filtered(): CustomerRow[] {
    const text = this.search.trim().toLowerCase();
    if (!text) {
      return this.customers;
    }
    return this.customers.filter((customer) =>
      [customer.name, customer.phone, customer.email, customer.gstin].some((value) =>
        value.toLowerCase().includes(text)
      )
    );
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
  }

  get rows(): CustomerRow[] {
    const page = Math.min(this.page, this.pageCount - 1);
    return this.filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }

  get countLabel(): string {
    const count = this.filtered.length;
    return `${count} ${count === 1 ? 'customer' : 'customers'}`;
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

  openMenu(event: Event, customer: CustomerRow): void {
    this.menuItems = [
      { label: 'Edit', command: () => this._router.navigate(['/customers/edit', customer.id]) },
      { separator: true },
      { label: 'Delete', styleClass: 'danger', command: () => this.deleteCustomer(customer) },
    ];
    this.rowMenu?.toggle(event);
  }

  deleteCustomer(customer: CustomerRow): void {
    this._confirm.confirm(
      `Delete ${customer.name}?`,
      'Their quotations and bills stay as they are. This cannot be undone.',
      'pi-exclamation-triangle',
      () => {
        this._dataService.deleteCustomer(customer.id).subscribe({
          next: (res) => {
            if (res.success) {
              this._toastService.showSuccess(`${customer.name} deleted`);
              this.customers = this.customers.filter((row) => row.id !== customer.id);
              this.go(0);
            } else {
              this._toastService.showError(res.message);
            }
          },
          error: (err) => this._toastService.showError(err?.error?.message || 'Could not delete the customer'),
        });
      },
      () => {}
    );
  }

  trackById(_: number, customer: CustomerRow): number {
    return customer.id;
  }
}
