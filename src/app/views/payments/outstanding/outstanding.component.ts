import { Component, OnInit } from '@angular/core';

import { ToastService } from '../../../shared/services/toast.service';
import { httpMessage } from '../api-result';
import { accountFromOutstanding, matchesCustomer, reminderLink } from '../payments.adapter';
import { Account, Outstanding, OutstandingAccount, OutstandingBasis, OutstandingCustomer } from '../payments.model';
import { PaymentsService, SavedPayment } from '../payments.service';

type State = 'loading' | 'error' | 'ready';

const BASES: { basis: OutstandingBasis; label: string }[] = [
  { basis: 'all', label: 'All' },
  { basis: 'bill', label: 'Billed' },
  { basis: 'order', label: 'Not billed yet' },
];

/**
 * Who owes money, and for how long. Balances and age buckets are the api's
 * (`payment/outstanding`); the web adds nothing up. Each customer has a
 * one-tap WhatsApp reminder with the text filled in, and each job can take
 * a payment on the spot.
 */
@Component({
  selector: 'app-outstanding',
  templateUrl: './outstanding.component.html',
  styleUrls: ['./outstanding.component.scss'],
})
export class OutstandingComponent implements OnInit {
  state: State = 'loading';
  errorMessage = '';
  data: Outstanding | null = null;
  basis: OutstandingBasis = 'all';
  search = '';
  /** Customers whose jobs are shown. A customer has no id only in broken data, so the name stands in. */
  open = new Set<string>();
  /** The job "Record payment" is open for. */
  paying: Account | null = null;
  company = '';

  readonly bases = BASES;
  readonly placeholders = [0, 1, 2, 3];

  constructor(private service: PaymentsService, private toast: ToastService) {}

  ngOnInit(): void {
    this.load();
    this.service.companyName().subscribe((name) => (this.company = name));
  }

  load(): void {
    this.state = 'loading';
    this.fetch();
  }

  setBasis(basis: OutstandingBasis): void {
    if (basis !== this.basis) {
      this.basis = basis;
      this.load();
    }
  }

  get customers(): OutstandingCustomer[] {
    return (this.data?.customers || []).filter((customer) => matchesCustomer(customer, this.search));
  }

  key(customer: OutstandingCustomer): string {
    return String(customer.customerId ?? customer.name);
  }

  isOpen(customer: OutstandingCustomer): boolean {
    return this.open.has(this.key(customer));
  }

  toggle(customer: OutstandingCustomer): void {
    const key = this.key(customer);
    if (!this.open.delete(key)) {
      this.open.add(key);
    }
  }

  remindLink(customer: OutstandingCustomer): string | null {
    return reminderLink(customer, this.company);
  }

  /** "12 days" / "Today": how long the oldest job has been waiting. */
  age(days: number): string {
    if (days <= 0) {
      return 'Today';
    }
    return days === 1 ? '1 day' : `${days} days`;
  }

  pay(customer: OutstandingCustomer, row: OutstandingAccount): void {
    this.paying = accountFromOutstanding(customer, row);
  }

  onSaved(saved: SavedPayment): void {
    this.paying = null;
    this.toast.showSuccess(`${saved.payment.number} saved`);
    // The balances and buckets are the api's: ask again instead of subtracting here.
    this.fetch();
  }

  trackByKey = (_: number, customer: OutstandingCustomer): string => this.key(customer);

  private fetch(): void {
    this.service.outstanding(this.basis).subscribe({
      next: (result) => {
        if (!result.ok) {
          this.errorMessage = result.message;
          this.state = 'error';
          return;
        }
        this.data = result.data;
        this.state = 'ready';
      },
      error: (error) => {
        this.errorMessage = httpMessage(error, 'We could not load the outstanding list.');
        this.state = 'error';
      },
    });
  }
}
