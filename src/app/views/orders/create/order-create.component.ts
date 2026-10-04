import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, catchError, forkJoin, of } from 'rxjs';

import { Crumb } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';
import { Result, httpMessage, idOrNull, num, text, todayIso } from '../../payments/api-result';
import { Order } from '../orders.model';
import { OrdersService } from '../orders.service';

type State = 'loading' | 'error' | 'ready';

interface QuotationSummary {
  id: number;
  number: string;
  name: string;
  customer: string;
  status: string;
  total: number;
  windows: number;
  advance: { percent: number; amount: number } | null;
}

/**
 * "Create order": where the quotation page's button lands
 * (/orders/new?quotation=<id>). One optional field, the promised date, then
 * one button. A quotation that already has an order opens that order
 * instead, so the same link is also "Open order".
 */
@Component({
  selector: 'app-order-create',
  templateUrl: './order-create.component.html',
  styleUrls: ['./order-create.component.scss'],
})
export class OrderCreateComponent implements OnInit, OnDestroy {
  state: State = 'loading';
  errorMessage = '';
  quotationId: number | null = null;
  quotation: QuotationSummary | null = null;

  promised = '';
  notes = '';
  saving = false;
  /** The api's refusal; with `orderId` when it says the quotation already has an order. */
  refusal: { message: string; orderId: number | null } | null = null;

  readonly today = todayIso();

  private query?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private service: OrdersService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.query = this.route.queryParamMap.subscribe((query) => {
      this.quotationId = idOrNull(query.get('quotation'));
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.query?.unsubscribe();
  }

  get crumbs(): Crumb[] {
    return [{ label: 'Orders', link: '/orders' }, { label: 'New order' }];
  }

  /** Only an accepted (or already billed) quotation becomes an order; the api refuses the rest. */
  get canOrder(): boolean {
    return this.quotation?.status === 'accepted' || this.quotation?.status === 'billed';
  }

  get promisedMessage(): string | null {
    return this.promised && this.promised < this.today ? 'The promised date cannot be before today.' : null;
  }

  load(): void {
    const id = this.quotationId;
    if (!id) {
      this.fail('This address has no quotation in it. Open a quotation and press Create order.');
      return;
    }
    this.state = 'loading';
    this.refusal = null;
    forkJoin({
      quotation: this.service.quotation(id),
      // Without this answer the page still works: the api refuses a second order itself.
      orders: this.service.forQuotation(id).pipe(catchError(() => of({ ok: false, message: '' } as Result<Order[]>))),
    }).subscribe({
      next: ({ quotation, orders }) => {
        const existing = orders.ok ? orders.data.find((order) => !order.cancelled) : undefined;
        if (existing) {
          this.router.navigate(['/orders', existing.id], { replaceUrl: true });
          return;
        }
        if (!quotation.ok) {
          this.fail(quotation.message);
          return;
        }
        this.quotation = this.summary(quotation.data, id);
        this.state = 'ready';
      },
      error: (error) => this.fail(httpMessage(error, 'We could not load the quotation.')),
    });
  }

  create(): void {
    const id = this.quotationId;
    if (!id || this.saving || this.promisedMessage) {
      return;
    }
    this.saving = true;
    this.refusal = null;
    this.service
      .create({
        quatation_id: id,
        ...(this.promised ? { promised_date: this.promised } : {}),
        ...(this.notes.trim() ? { notes: this.notes.trim() } : {}),
      })
      .subscribe({
        next: (result) => {
          this.saving = false;
          if (!result.ok) {
            this.refusal = { message: result.message, orderId: idOrNull(result.data?.order_id) };
            return;
          }
          this.toast.showSuccess(`Order ${result.data.number} created`);
          this.router.navigate(['/orders', result.data.id], { replaceUrl: true });
        },
        error: (error) => {
          this.saving = false;
          this.refusal = { message: httpMessage(error, 'The order was not made.'), orderId: null };
        },
      });
  }

  private summary(raw: any, id: number): QuotationSummary {
    const totals = raw?.totals || {};
    const advance = totals.advance;
    return {
      id,
      number: text(raw?.number),
      name: text(raw?.quatation_name),
      customer: text(raw?.customer?.name || raw?.name),
      status: text(raw?.status),
      total: num(totals.total ?? raw?.total),
      windows: num(totals.total_quantity ?? totals.item_count),
      advance: advance && typeof advance === 'object' ? { percent: num(advance.percent), amount: num(advance.amount) } : null,
    };
  }

  private fail(message: string): void {
    this.errorMessage = message;
    this.state = 'error';
  }
}
