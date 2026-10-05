import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { ToastService } from '../../../shared/services/toast.service';
import { idOrNull, todayIso } from '../api-result';
import { documentError, saveBlob } from '../document-file';
import { MODES } from '../payments.adapter';
import { PaymentMode, PaymentScope } from '../payments.model';
import { PaymentsService } from '../payments.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every receipt and refund, newest first: the workshop's day book. It is
 * narrowed by a period, a mode of payment and a customer; the filters live in
 * the address (?from=&to=&mode=&customer=), so a reload or a shared link shows
 * the same list. "Export to Excel" saves what is on screen. A payment is
 * recorded from an order or a bill, so this page only lists.
 */
@Component({
  selector: 'app-payments-register',
  template: `
    <app-page-header title="Payments" subtitle="Every receipt and refund, newest first">
      <ng-container ngProjectAs="[actions]">
        <a class="btn btn-secondary" routerLink="/payments/outstanding">Outstanding</a>
        <button type="button" class="btn btn-secondary" [disabled]="exporting" (click)="exportExcel()">
          <app-icon name="download"></app-icon>{{ exporting ? 'Preparing…' : 'Export to Excel' }}
        </button>
      </ng-container>
    </app-page-header>

    <section class="card register-filters" aria-label="Filter the payments">
      <div class="seg quick" role="group" aria-label="Period">
        <button type="button" [attr.aria-pressed]="period === 'all'" (click)="setPeriod('all')">All dates</button>
        <button type="button" [attr.aria-pressed]="period === 'today'" (click)="setPeriod('today')">Today</button>
        <button type="button" [attr.aria-pressed]="period === 'month'" (click)="setPeriod('month')">This month</button>
      </div>
      <div class="field">
        <label class="label" for="pay-from">From</label>
        <input id="pay-from" class="input" type="date" [max]="to || today" [value]="from || ''" (change)="setDate('from', $any($event.target).value)" />
      </div>
      <div class="field">
        <label class="label" for="pay-to">To</label>
        <input id="pay-to" class="input" type="date" [min]="from || ''" [max]="today" [value]="to || ''" (change)="setDate('to', $any($event.target).value)" />
      </div>
      <div class="field">
        <label class="label" for="pay-mode">Paid by</label>
        <select id="pay-mode" class="select" [value]="mode || ''" (change)="setMode($any($event.target).value)">
          <option value="" [selected]="!mode">Every mode</option>
          <option *ngFor="let item of modes" [value]="item.mode" [selected]="item.mode === mode">{{ item.label }}</option>
        </select>
      </div>
      <div class="field customer">
        <label class="label" for="pay-customer">Customer</label>
        <select id="pay-customer" class="select" [value]="customerId || ''" (change)="setCustomer($any($event.target).value)">
          <option value="" [selected]="!customerId">Every customer</option>
          <option *ngFor="let customer of customers" [value]="customer.id" [selected]="customer.id === customerId">{{ customer.name }}</option>
          <!-- A customer named in the address stays chosen while the list of names loads. -->
          <option *ngIf="customerId && !knownCustomer" [value]="customerId" selected>Customer {{ customerId }}</option>
        </select>
      </div>
      <button type="button" class="btn btn-ghost clear" *ngIf="filtered" (click)="clear()">Clear filters</button>
    </section>

    <app-callout class="notice" tone="warn" *ngIf="exportError">
      {{ exportError }}
      <button action type="button" class="btn btn-secondary btn-sm" (click)="exportExcel()">Try again</button>
    </app-callout>

    <app-account-payments [customerId]="customerId" [from]="from" [to]="to" [mode]="mode" [heading]="heading"></app-account-payments>
  `,
  styles: [
    `
      :host { display: block; }
      .register-filters { display: flex; flex-direction: row; flex-wrap: wrap; align-items: flex-end; gap: var(--s-3) var(--s-4); padding: var(--s-4); margin-block-end: var(--s-4); }
      .field { margin: 0; min-width: 150px; }
      .customer { flex: 1 1 200px; max-width: 320px; }
      .quick { align-self: flex-end; }
      .clear { align-self: flex-end; }
      .notice { display: block; margin-block-end: var(--s-4); }
      /* 44 px to tap on a tablet or a phone. */
      @media (max-width: 1024px), (pointer: coarse) { .seg button { min-height: 44px; } }
      @media (max-width: 640px) {
        .field { flex: 1 1 140px; min-width: 0; }
        .customer { flex-basis: 100%; max-width: none; }
        .quick { width: 100%; }
        .quick button { flex: 1; }
      }
    `,
  ],
})
export class PaymentsRegisterComponent implements OnInit, OnDestroy {
  customerId: number | null = null;
  from: string | null = null;
  to: string | null = null;
  mode: PaymentMode | null = null;

  customers: { id: number; name: string }[] = [];
  exporting = false;
  exportError = '';

  readonly modes = MODES;
  readonly today = todayIso();

  private query?: Subscription;

  constructor(private route: ActivatedRoute, private router: Router, private service: PaymentsService, private toast: ToastService) {}

  ngOnInit(): void {
    this.query = this.route.queryParamMap.subscribe((query) => {
      this.customerId = idOrNull(query.get('customer'));
      this.from = date(query.get('from'));
      this.to = date(query.get('to'));
      const mode = query.get('mode') as PaymentMode;
      this.mode = this.modes.some((item) => item.mode === mode) ? mode : null;
    });
    this.service.customers().subscribe((customers) => (this.customers = customers));
  }

  ngOnDestroy(): void {
    this.query?.unsubscribe();
  }

  get scope(): PaymentScope {
    return { customerId: this.customerId, from: this.from, to: this.to, mode: this.mode };
  }

  get filtered(): boolean {
    return !!(this.customerId || this.from || this.to || this.mode);
  }

  get knownCustomer(): boolean {
    return this.customers.some((customer) => customer.id === this.customerId);
  }

  /** Which quick period the dates on screen are, if any. */
  get period(): 'all' | 'today' | 'month' | 'other' {
    if (!this.from && !this.to) {
      return 'all';
    }
    if (this.from === this.today && this.to === this.today) {
      return 'today';
    }
    return this.from === monthStart(this.today) && this.to === this.today ? 'month' : 'other';
  }

  get heading(): string {
    const name = this.customers.find((customer) => customer.id === this.customerId)?.name;
    if (this.period === 'today') {
      return name ? `Today, ${name}` : 'Today';
    }
    return name ? `Payments of ${name}` : this.filtered ? 'Payments that match' : 'All payments';
  }

  setPeriod(period: 'all' | 'today' | 'month'): void {
    const from = period === 'all' ? null : period === 'today' ? this.today : monthStart(this.today);
    this.navigate({ from, to: period === 'all' ? null : this.today });
  }

  setDate(which: 'from' | 'to', value: string): void {
    this.navigate({ [which]: date(value) });
  }

  setMode(value: string): void {
    this.navigate({ mode: value || null });
  }

  setCustomer(value: string): void {
    this.navigate({ customer: value || null });
  }

  clear(): void {
    this.navigate({ from: null, to: null, mode: null, customer: null });
  }

  /** The list on screen as an Excel file, with the api's file name. */
  exportExcel(): void {
    if (this.exporting) {
      return;
    }
    this.exporting = true;
    this.exportError = '';
    this.service.exportExcel(this.scope).subscribe({
      next: (file) => {
        this.exporting = false;
        const name = file.fileName || 'Payments.xlsx';
        saveBlob(file.blob, name);
        this.toast.showSuccess(`${name} downloaded`);
      },
      error: (error) => {
        this.exporting = false;
        this.exportError = documentError(error, 'The Excel file could not be made.');
      },
    });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}

/** A date of the address or of a date box, or null when it is not one. */
function date(value: string | null): string | null {
  return value && ISO_DATE.test(value) ? value : null;
}

/** `2026-10-01` for any day of October 2026. */
function monthStart(day: string): string {
  return `${day.slice(0, 8)}01`;
}
