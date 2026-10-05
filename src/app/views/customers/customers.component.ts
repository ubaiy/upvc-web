import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { AccessService } from 'src/app/shared/access/access.service';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { catchError, forkJoin, of } from 'rxjs';
import { ToastService } from 'src/app/shared/services/toast.service';
import { UndoService } from 'src/app/shared/services/undo.service';
import { CustomerRow, GstState, defaultAddresses, toCustomerRow } from './customer.adapter';
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
  private readonly _access = inject(AccessService);
  readonly placeholders = [0, 1, 2, 3, 4, 5];

  constructor(
    private _router: Router,
    private _undo: UndoService,
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
      // So is the city and PIN code of each customer: without them the list shows the state alone.
      addresses: this._dataService.getAllAddresses().pipe(catchError(() => of({ success: false, data: [] as any[] }))),
    }).subscribe({
      next: ({ list, states, addresses }) => {
        if (!list.success) {
          this.state = 'error';
          return;
        }
        const stateList = (states.success && states.data) || [];
        const byCustomer = defaultAddresses(addresses.success ? (addresses.data as any[]) : []);
        this.customers = (list.data || [])
          .map((dto) => toCustomerRow(dto, stateList, byCustomer.get(Number(dto.id))))
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
      [customer.name, customer.phone, customer.email, customer.gstin, customer.place].some((value) =>
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
    const items: MenuItem[] = [
      { label: 'Edit', command: () => this._router.navigate(['/customers/edit', customer.id]) },
      // The next step of the job: the New quotation dialog opens with this customer chosen.
      {
        label: 'New quotation',
        command: () => this._router.navigate(['/quotation'], { queryParams: { new: 1, customer: customer.id } }),
      },
      { separator: true },
      { label: 'Delete', styleClass: 'danger', command: () => this.deleteCustomer(customer) },
    ];
    // "Edit" opens the customer to read; a new quotation and a delete change something.
    this.menuItems = this._access.menu(items, (item) => (item.label === 'Edit' ? null : 'quotations.write'));
    this.rowMenu?.toggle(event);
  }

  /**
   * Undo instead of confirm: the row leaves at once and the request waits
   * while the toast offers "Undo". Their quotations and bills stay as they are.
   */
  deleteCustomer(customer: CustomerRow): void {
    const at = this.customers.indexOf(customer);
    const restore = () => {
      if (!this.customers.some((row) => row.id === customer.id)) {
        const rows = [...this.customers];
        rows.splice(Math.max(0, Math.min(at, rows.length)), 0, customer);
        this.customers = rows;
      }
    };
    const refused = (message?: string) => {
      restore();
      this._toastService.showError(message || `${customer.name} was not deleted. Try again.`);
    };
    this.customers = this.customers.filter((row) => row.id !== customer.id);
    this.go(0);
    this._undo.offer({
      message: `${customer.name} deleted`,
      commit: () =>
        this._dataService.deleteCustomer(customer.id).subscribe({
          next: (res) => {
            if (!res.success) {
              refused(res.message);
            }
          },
          error: (err) => refused(err?.error?.message),
        }),
      undo: restore,
    });
  }

  trackById(_: number, customer: CustomerRow): number {
    return customer.id;
  }
}
