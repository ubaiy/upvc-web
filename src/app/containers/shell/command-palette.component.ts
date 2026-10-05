import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subject, Subscription, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, map, shareReplay, switchMap } from 'rxjs/operators';

import { IconName } from '../../shared/components/icon/icon-paths';
import { API_END_POINT } from '../../shared/configs/api.config';
import { quiet } from '../../shared/interceptors/request-options';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { toBillRows } from '../../views/bills/bills.adapter';
import { toOrders } from '../../views/orders/orders.adapter';
import { toPaymentList } from '../../views/payments/payments.adapter';
import { QuotationListService } from '../../views/quotation/quotation-list.service';
import { NAV_ITEMS } from './nav';

type Section = 'Pages' | 'Customers' | 'Quotations' | 'Orders' | 'Bills' | 'Receipts';

export interface Destination {
  section: Section;
  label: string;
  /** Beside the label: the menu a page belongs to, a customer's phone, the customer of a quotation, order, bill or receipt. */
  detail?: string;
  icon: IconName;
  link: string;
}

const PAGES: Destination[] = NAV_ITEMS.flatMap((item) => [
  { section: 'Pages' as Section, label: item.label, icon: item.icon, link: item.link },
  ...(item.places ?? []).map((place) => ({
    section: 'Pages' as Section,
    label: place.label,
    detail: item.label,
    icon: item.icon,
    link: place.link,
  })),
]);

/** Rows shown of each kind: the palette is for going to one thing, the lists are for browsing. */
const MOST = 6;

const wordsOf = (value: string): string[] => value.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Search behind the sidebar search box and Ctrl K. It finds the pages of the
 * app at once, and, from the second letter, customers by name or phone,
 * quotations by number, name or customer, and orders, bills and receipts by
 * number or customer (the list endpoints; nothing is worked out here). The
 * customer, order, bill and receipt lists are read once while it is open.
 * Type to narrow, arrow keys to move, Enter to open.
 */
@Component({
  selector: 'app-command-palette',
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="dialog palette" role="dialog" aria-modal="true" aria-label="Search">
      <div class="input-group">
        <app-icon name="search"></app-icon>
        <input
          #input
          type="text"
          role="combobox"
          aria-label="Search pages, customers, quotations, orders, bills and receipts"
          aria-controls="palette-list"
          aria-expanded="true"
          [attr.aria-activedescendant]="results.length ? 'palette-option-' + index : null"
          autocomplete="off"
          placeholder="Search pages, customers, quotations, orders, bills"
          [value]="query"
          (input)="search(input.value)"
          (keydown)="onKey($event)"
        />
        <span class="kbd">Esc</span>
      </div>
      <div class="list" id="palette-list" role="listbox" aria-label="Results">
        <ng-container *ngFor="let d of results; let i = index">
          <div class="section faint tiny" role="presentation" *ngIf="query && (i === 0 || results[i - 1].section !== d.section)">
            {{ d.section }}
          </div>
          <button
            type="button"
            class="menu-item"
            role="option"
            [id]="'palette-option-' + i"
            [class.is-active]="i === index"
            [attr.aria-selected]="i === index"
            [attr.aria-label]="d.label + (d.detail ? ', ' + d.detail : '')"
            (mouseenter)="index = i"
            (click)="go(d)"
          >
            <app-icon [name]="d.icon"></app-icon>
            <span class="grow label">{{ d.label }}</span>
            <span class="faint small detail" *ngIf="d.detail">{{ d.detail }}</span>
          </button>
        </ng-container>
        <p class="none muted small" role="status" *ngIf="state === 'searching'">Looking for customers, quotations, orders, bills and receipts…</p>
        <p class="none muted small" role="status" *ngIf="state === 'failed'">
          Customers, quotations, orders, bills and receipts could not be searched. Check the connection and type again.
        </p>
        <p class="none muted small" role="status" *ngIf="state === 'idle' && !results.length">
          Nothing matches "{{ query }}".
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      :host { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: start center; padding: 12vh var(--s-4) var(--s-4); }
      .backdrop { position: absolute; inset: 0; background: rgba(20, 24, 28, 0.4); }
      .palette { position: relative; width: 520px; max-width: 100%; padding: var(--s-2); }
      .input-group { border-color: transparent; box-shadow: none; }
      .kbd { font-size: 11px; padding: 1px 5px; border: 1px solid var(--c-border); border-radius: 4px; color: var(--c-text-3); flex: none; }
      .list { max-height: 50vh; overflow-y: auto; margin-block-start: var(--s-2); padding-block-start: var(--s-2); border-block-start: 1px solid var(--c-border); }
      .menu-item.is-active { background: var(--c-surface-2); }
      .label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .detail { flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .section { padding: var(--s-2) var(--s-3) var(--s-1); text-transform: uppercase; letter-spacing: 0.04em; font-weight: var(--fw-semibold); }
      .none { margin: 0; padding: var(--s-3); }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandPaletteComponent implements AfterViewInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();

  @ViewChild('input') private input: ElementRef<HTMLInputElement>;

  query = '';
  index = 0;
  results: Destination[] = PAGES;
  /** The search of the records: nothing asked, asked, or it could not be asked. */
  state: 'idle' | 'searching' | 'failed' = 'idle';

  private pages: Destination[] = PAGES;
  private readonly term$ = new Subject<string>();
  private readonly sub: Subscription;
  /** The customer, order, bill and payment lists, each read once while the palette is open. */
  private lists: Record<string, Observable<any> | null> = {};

  constructor(
    private router: Router,
    private api: ApiHttpService,
    private quotations: QuotationListService,
    private cdr: ChangeDetectorRef
  ) {
    this.sub = this.term$
      .pipe(
        debounceTime(250),
        switchMap((term) =>
          forkJoin({
            customers: this.list(API_END_POINT.customer.list),
            orders: this.list('order/list?stage=all'),
            bills: this.list(API_END_POINT.bills.list + '?status=all'),
            payments: this.list('payment/list'),
            quotations: this.quotations.page({ status: 'all', search: term, page: 1, perPage: MOST }),
          }).pipe(
            map(({ customers, orders, bills, payments, quotations }) => [
              ...matchCustomers(Array.isArray(customers) ? customers : [], term),
              ...quotations.rows.slice(0, MOST).map(
                (row): Destination => ({
                  section: 'Quotations',
                  label: `${row.number} · ${row.name}`,
                  detail: row.customerName,
                  icon: 'file',
                  link: `/quotation/detail/${row.id}`,
                })
              ),
              ...matchOrders(orders, term),
              ...matchBills(bills, term),
              ...matchReceipts(payments, term),
            ]),
            catchError(() => {
              this.lists = {};
              return of(null);
            })
          )
        )
      )
      .subscribe((records) => {
        this.state = records ? 'idle' : 'failed';
        this.results = [...this.pages, ...(records ?? [])];
        this.index = Math.min(this.index, Math.max(this.results.length - 1, 0));
        this.cdr.markForCheck();
      });
  }

  ngAfterViewInit(): void {
    this.input.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  search(value: string): void {
    this.query = value;
    const words = wordsOf(value);
    this.pages = PAGES.filter((d) => {
      const text = (d.label + ' ' + (d.detail ?? '')).toLowerCase();
      return words.every((word) => text.includes(word));
    });
    this.results = this.pages;
    this.index = 0;
    const term = value.trim();
    // One letter matches nearly every record: records are looked for from the second.
    this.state = term.length >= 2 ? 'searching' : 'idle';
    if (term.length >= 2) {
      this.term$.next(term);
    }
  }

  onKey(event: KeyboardEvent): void {
    const count = this.results.length;
    if (event.key === 'ArrowDown' && count) {
      this.index = (this.index + 1) % count;
      this.reveal();
    } else if (event.key === 'ArrowUp' && count) {
      this.index = (this.index - 1 + count) % count;
      this.reveal();
    } else if (event.key === 'Enter' && count) {
      this.go(this.results[this.index]);
    } else if (event.key === 'Tab') {
      // One field and one list: keep focus in the field while the dialog is open.
    } else {
      return;
    }
    event.preventDefault();
  }

  go(destination: Destination): void {
    this.closed.emit();
    this.router.navigateByUrl(destination.link);
  }

  /** Keeps the row the arrow keys are on inside the scrolling list. */
  private reveal(): void {
    setTimeout(() => document.getElementById('palette-option-' + this.index)?.scrollIntoView?.({ block: 'nearest' }));
  }

  /** The data of one list endpoint, as the api gave it. */
  private list(path: string): Observable<any> {
    this.lists[path] ??= this.api.get(path, quiet()).pipe(
      map((res: any) => {
        if (!res?.success || res.data === null || res.data === undefined) {
          throw new Error(res?.message || 'The list could not be loaded.');
        }
        return res.data;
      }),
      shareReplay(1)
    );
    return this.lists[path]!;
  }
}

/** True when every word typed is in one of the texts (a number, a name). */
function hasEveryWord(term: string, texts: string[]): boolean {
  const text = texts.join(' ').toLowerCase();
  return wordsOf(term).every((word) => text.includes(word));
}

/** Customers whose name or phone has every word typed; a name that starts with the text comes first. */
export function matchCustomers(customers: any[], term: string): Destination[] {
  const words = wordsOf(term);
  const first = words[0] ?? '';
  return customers
    .filter((customer) => {
      const name = String(customer?.name ?? '').toLowerCase();
      const phone = String(customer?.phone ?? '').replace(/\D/g, '');
      return words.every((word) => name.includes(word) || (/^\d+$/.test(word) && phone.includes(word)));
    })
    .sort(
      (a, b) =>
        Number(String(b.name ?? '').toLowerCase().startsWith(first)) -
        Number(String(a.name ?? '').toLowerCase().startsWith(first))
    )
    .slice(0, MOST)
    .map((customer) => ({
      section: 'Customers' as Section,
      label: String(customer.name ?? ''),
      detail: String(customer.phone ?? ''),
      icon: 'users' as IconName,
      link: `/customers/edit/${customer.id}`,
    }));
}

/** Orders whose number, quotation or customer has every word typed (`order/list`). */
export function matchOrders(raw: any, term: string): Destination[] {
  return toOrders(raw)
    .filter((order) => hasEveryWord(term, [order.number, order.quotationNumber, order.quotationName, order.customerName]))
    .slice(0, MOST)
    .map((order) => ({
      section: 'Orders' as Section,
      label: order.quotationName ? `${order.number} · ${order.quotationName}` : order.number,
      detail: order.customerName,
      icon: 'layers' as IconName,
      link: `/orders/${order.id}`,
    }));
}

/** Bills whose number, quotation or customer has every word typed (`bill/list`). It opens the bill's payments. */
export function matchBills(raw: any, term: string): Destination[] {
  return toBillRows(Array.isArray(raw) ? raw : [])
    .filter((bill) => hasEveryWord(term, [bill.number, bill.quotationNumber, bill.quotation, bill.customer]))
    .slice(0, MOST)
    .map((bill) => ({
      section: 'Bills' as Section,
      label: bill.cancelled ? `${bill.number} · cancelled` : bill.number,
      detail: bill.customer,
      icon: 'receipt' as IconName,
      link: `/payments/bill/${bill.id}`,
    }));
}

/** Receipts and refunds whose number or customer has every word typed (`payment/list`). It opens the order or bill it was paid against. */
export function matchReceipts(raw: any, term: string): Destination[] {
  return toPaymentList(raw)
    .payments.filter((payment) => hasEveryWord(term, [payment.number, payment.customerName]))
    .slice(0, MOST)
    .map((payment) => ({
      section: 'Receipts' as Section,
      label: [payment.number, payment.orderNumber || payment.billNumber].filter(Boolean).join(' · ') + (payment.cancelled ? ' · cancelled' : ''),
      detail: payment.customerName,
      icon: 'rupee' as IconName,
      link: payment.orderId ? `/orders/${payment.orderId}` : payment.billId ? `/payments/bill/${payment.billId}` : '/payments',
    }));
}
