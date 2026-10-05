import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, catchError, forkJoin, of } from 'rxjs';

import { UndoService } from '../../../shared/services/undo.service';
import { AccessService } from '../../../shared/access/access.service';
import { Result, httpMessage } from '../../payments/api-result';
import { BoardColumn, TABS, inTab, matchesOrder, paymentBadge, toBoard } from '../orders.adapter';
import { Order, OrderTab, StageCounts, StageKey } from '../orders.model';
import { OrdersService } from '../orders.service';

type State = 'loading' | 'error' | 'ready';
type View = 'list' | 'board';

const PAGE_SIZE = 10;

/**
 * Orders by stage: a list with a tab and a count per stage, or a board with a
 * column per stage. The workshop tablet screen: every row and card opens the
 * order, and a board card moves its order to the next stage in one tap, with
 * a way back.
 */
@Component({
  selector: 'app-orders-list',
  templateUrl: './orders-list.component.html',
  styleUrls: ['./orders-list.component.scss'],
})
export class OrdersListComponent implements OnInit, OnDestroy {
  state: State = 'loading';
  errorMessage = '';
  orders: Order[] = [];
  counts: StageCounts = {};
  view: View = 'list';
  tab: OrderTab = 'all';
  search = '';
  page = 0;
  /** Id of the order whose stage is being changed. */
  moving: number | null = null;
  /** A stage change that failed, with the api's reason. */
  notice: { message: string; retry?: () => void } | null = null;
  /** The order "Close order" was tapped on while it still owes money: the board asks first. */
  closing: Order | null = null;

  readonly tabs = TABS;
  readonly placeholders = [0, 1, 2, 3, 4, 5];
  readonly badge = paymentBadge;

  private query?: Subscription;

  constructor(
    private service: OrdersService,
    private route: ActivatedRoute,
    private router: Router,
    private undo: UndoService,
    private access: AccessService
  ) {}

  /** The total and the balance: not for a role that sees neither quotations nor payments (workshop). */
  get showMoney(): boolean {
    return this.access.seesAmounts;
  }

  ngOnInit(): void {
    // The view and the tab live in the address, so a reload or a shared link opens the same thing.
    this.query = this.route.queryParamMap.subscribe((query) => {
      this.view = query.get('view') === 'board' ? 'board' : 'list';
      const stage = query.get('stage') as OrderTab;
      this.tab = this.tabs.some((t) => t.tab === stage) ? stage : 'all';
      this.page = 0;
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.query?.unsubscribe();
  }

  load(): void {
    this.state = 'loading';
    this.notice = null;
    forkJoin({
      orders: this.service.list(),
      // The tabs still work without counts: they are then shown without a number.
      counts: this.service.counts().pipe(catchError(() => of({ ok: false, message: '' } as Result<StageCounts>))),
    }).subscribe({
      next: ({ orders, counts }) => {
        if (!orders.ok) {
          this.fail(orders.message);
          return;
        }
        this.orders = orders.data;
        this.counts = counts.ok ? counts.data : {};
        this.state = 'ready';
      },
      error: (error) => this.fail(httpMessage(error, 'We could not load your orders.')),
    });
  }

  setView(view: View): void {
    this.navigate({ view: view === 'board' ? 'board' : null });
  }

  setTab(tab: OrderTab): void {
    this.navigate({ stage: tab === 'all' ? null : tab });
  }

  /** The api's count of a tab. Its "all" leaves cancelled orders out, and the All tab lists them, so the two are added. */
  count(tab: OrderTab): number | null {
    const value = this.counts[tab];
    if (typeof value !== 'number') {
      return null;
    }
    const cancelled = this.counts['cancelled'];
    return tab === 'all' && typeof cancelled === 'number' ? value + cancelled : value;
  }

  get filtered(): Order[] {
    return this.orders.filter((order) => inTab(order, this.tab) && matchesOrder(order, this.search));
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
  }

  get rows(): Order[] {
    const page = Math.min(this.page, this.pageCount - 1);
    return this.filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }

  get board(): BoardColumn[] {
    return toBoard(this.orders.filter((order) => matchesOrder(order, this.search)));
  }

  get countLabel(): string {
    const count = this.filtered.length;
    return `${count} ${count === 1 ? 'order' : 'orders'}`;
  }

  get tabLabel(): string {
    return this.tabs.find((t) => t.tab === this.tab)?.label.toLowerCase() || '';
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

  /**
   * One tap on a board card: the next stage. The toast offers the way back.
   * Closing a job that still owes money asks first, with the amount.
   */
  advance(order: Order): void {
    if (!order.nextStage || this.moving) {
      return;
    }
    if (order.nextStage.stage === 'closed' && order.balance > 0) {
      this.closing = order;
      return;
    }
    this.move(order, order.nextStage.stage, order.stage);
  }

  /** "Close order" in the dialog. */
  confirmClose(): void {
    const order = this.closing;
    this.closing = null;
    if (order?.nextStage) {
      this.move(order, order.nextStage.stage, order.stage);
    }
  }

  trackById(_: number, order: Order): number {
    return order.id;
  }

  trackByStage(_: number, column: BoardColumn): string {
    return column.stage;
  }

  private move(order: Order, stage: StageKey, back: StageKey | null): void {
    if (this.moving) {
      return;
    }
    this.moving = order.id;
    this.notice = null;
    this.service.setStage(order.id, stage).subscribe({
      next: (result) => {
        this.moving = null;
        if (!result.ok) {
          this.notice = { message: `${order.number} was not moved. ${result.message}` };
          return;
        }
        const moved = result.data;
        this.orders = this.orders.map((row) => (row.id === moved.id ? moved : row));
        this.refreshCounts();
        if (back) {
          // The move is already saved; "Undo" posts the stage it came from.
          this.undo.offer({
            message: `${moved.number} is now ${moved.stageLabel}`,
            commit: () => {},
            undo: () => this.move(moved, back, null),
          });
        }
      },
      error: (error) => {
        this.moving = null;
        this.notice = { message: httpMessage(error, `${order.number} was not moved.`), retry: () => this.move(order, stage, back) };
      },
    });
  }

  private refreshCounts(): void {
    this.service.counts().subscribe({
      next: (counts) => {
        if (counts.ok) {
          this.counts = counts.data;
        }
      },
      error: () => {},
    });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private fail(message: string): void {
    this.errorMessage = message;
    this.state = 'error';
  }
}
