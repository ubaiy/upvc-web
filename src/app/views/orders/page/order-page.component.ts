import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { Subscription } from 'rxjs';

import { Crumb } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';
import { UndoService } from '../../../shared/services/undo.service';
import { Result, httpMessage, todayIso } from '../../payments/api-result';
import { CHALLAN_PAGE_WIDTH, documentError, documentName, saveBlob, shareOrSave } from '../../payments/document-file';
import { earlierStages, paymentBadge } from '../orders.adapter';
import { OrderPage, OrderUpdate, StageKey } from '../orders.model';
import { OrdersService } from '../orders.service';

type State = 'loading' | 'error' | 'ready';

/** "5 Oct 2026" from `2026-10-05`. */
function formatDay(iso: string): string {
  const day = new Date(`${iso}T00:00:00`);
  return isNaN(day.getTime()) ? iso : day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * One order. Its one primary button is the next stage, with the api's own
 * wording ("Start production", "Dispatch"). Below it: the six stages with
 * who did each and when, the promised date, the delivery challan, the
 * payments of the job, and links to the quotation, the production pack and
 * the bill. Totals, tax and the balance are the api's.
 */
@Component({
  selector: 'app-order-page',
  templateUrl: './order-page.component.html',
  styleUrls: ['./order-page.component.scss'],
})
export class OrderPageComponent implements OnInit, OnDestroy {
  @ViewChild('moreMenu') moreMenu?: Menu;

  state: State = 'loading';
  errorMessage = '';
  orderId = '';
  order: OrderPage | null = null;

  /** What is being saved: 'stage', 'promised', 'transport', or a challan action. */
  busy: string | null = null;
  /** A failed action, shown under the header with "Try again". */
  actionError: { message: string; retry?: () => void } | null = null;

  /** The fields the page edits, as typed. */
  promised = '';
  vehicle = '';
  transporter = '';
  notes = '';

  cancelling: { busy: boolean; error: string } | null = null;
  /** True while "Close order" waits for a yes: the order still owes money. */
  closing = false;
  challanPreview: string | null = null;
  menuItems: MenuItem[] = [];

  readonly today = todayIso();
  readonly challanPageWidth = CHALLAN_PAGE_WIDTH;
  readonly placeholders = [0, 1, 2];
  readonly badge = paymentBadge;

  private params?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private service: OrdersService,
    private toast: ToastService,
    private undo: UndoService
  ) {}

  ngOnInit(): void {
    this.params = this.route.paramMap.subscribe((params) => {
      this.orderId = params.get('id') || '';
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.params?.unsubscribe();
  }

  get crumbs(): Crumb[] {
    return [{ label: 'Orders', link: '/orders' }, { label: this.order?.number || 'Order' }];
  }

  /** "Al-Rashid Villa Windows · Ahmed Al-Rashid" */
  get subtitle(): string {
    return [this.order?.quotationName, this.order?.customerName].filter(Boolean).join(' · ');
  }

  get promisedChanged(): boolean {
    return !!this.order && this.promised !== this.order.promisedDate;
  }

  get transportChanged(): boolean {
    const order = this.order;
    return !!order && (this.vehicle !== order.vehicleNumber || this.transporter !== order.transporter || this.notes !== order.notes);
  }

  load(): void {
    this.state = 'loading';
    this.actionError = null;
    this.challanPreview = null;
    this.service.show(this.orderId).subscribe({
      next: (result) => {
        if (!result.ok) {
          this.fail(result.message);
          return;
        }
        this.show(result.data);
        this.state = 'ready';
      },
      error: (error) => this.fail(httpMessage(error, 'We could not load this order.')),
    });
  }

  /**
   * The primary button: the next stage. The toast offers the way back.
   * Closing a job that still owes money asks first, with the amount.
   */
  advance(): void {
    const order = this.order;
    if (!order?.nextStage || this.busy) {
      return;
    }
    if (order.nextStage.stage === 'closed' && order.balance > 0) {
      this.closing = true;
      return;
    }
    this.move(order.nextStage.stage, order.stage);
  }

  /** "Close order" in the dialog. */
  confirmClose(): void {
    const order = this.order;
    this.closing = false;
    if (order?.nextStage) {
      this.move(order.nextStage.stage, order.stage);
    }
  }

  /** What to say beside "Dispatch" when the goods would leave without a bill. */
  get nextHint(): string {
    const order = this.order;
    if (!order?.nextStage || order.cancelled || order.bill) {
      return '';
    }
    return order.nextStage.stage === 'dispatched' || order.nextStage.stage === 'installed'
      ? 'This order has no bill yet. The goods go out on the delivery challan alone; the bill is made from the quotation.'
      : '';
  }

  savePromised(): void {
    const order = this.order;
    if (order && this.promised && order.orderDate && this.promised < order.orderDate) {
      // Said here in plain words; the api would answer with its field name.
      this.actionError = { message: `The promised date cannot be before the order date, ${formatDay(order.orderDate)}.` };
      return;
    }
    this.save('promised', { promised_date: this.promised }, 'Promised date saved');
  }

  saveTransport(): void {
    this.save(
      'transport',
      { vehicle_number: this.vehicle.trim(), transporter: this.transporter.trim(), notes: this.notes.trim() },
      'Delivery details saved'
    );
  }

  openMenu(event: Event): void {
    const order = this.order;
    if (!order) {
      return;
    }
    const items: MenuItem[] = earlierStages(order).map((stage) => ({
      label: `Move back to ${stage.label}`,
      command: () => this.move(stage.stage, null),
    }));
    // A closed job is finished: it is reopened with "Move back to", not cancelled.
    if (order.stage !== 'closed') {
      if (items.length) {
        items.push({ separator: true });
      }
      items.push({ label: 'Cancel order', styleClass: 'danger', command: () => (this.cancelling = { busy: false, error: '' }) });
    }
    this.menuItems = items;
    this.moreMenu?.toggle(event);
  }

  cancel(reason: string): void {
    const order = this.order;
    const cancelling = this.cancelling;
    if (!order || !cancelling || cancelling.busy) {
      return;
    }
    cancelling.busy = true;
    cancelling.error = '';
    this.service.cancel(order.id, reason).subscribe({
      next: (result) => {
        if (!result.ok) {
          // The api's reason stays in the dialog: "Order has ₹2,500.00 received against it; record a refund before cancelling".
          cancelling.busy = false;
          cancelling.error = result.message;
          return;
        }
        this.cancelling = null;
        this.show(result.data);
        this.toast.showSuccess(`${result.data.number} cancelled`);
      },
      error: (error) => {
        cancelling.busy = false;
        cancelling.error = httpMessage(error, 'The order was not cancelled.');
      },
    });
  }

  isBusy(action: string): boolean {
    return this.busy === action;
  }

  previewChallan(): void {
    const order = this.order;
    if (!order || this.busy) {
      return;
    }
    this.start('challan:preview');
    this.service.challan(order.id, 'html').subscribe({
      next: (file) => {
        file.blob.text().then((html) => {
          this.busy = null;
          this.challanPreview = html;
        });
      },
      error: (error) => this.failed(documentError(error, 'The challan could not be opened.'), () => this.previewChallan()),
    });
  }

  downloadChallan(): void {
    const order = this.order;
    if (!order || this.busy) {
      return;
    }
    this.start('challan:download');
    this.service.challan(order.id, 'pdf', true).subscribe({
      next: (file) => {
        this.busy = null;
        saveBlob(file.blob, file.fileName || this.challanName(order));
      },
      error: (error) => this.failed(documentError(error, 'The challan could not be downloaded.'), () => this.downloadChallan()),
    });
  }

  /** The share sheet of the tablet or phone (WhatsApp, email); elsewhere the PDF is downloaded. */
  shareChallan(): void {
    const order = this.order;
    if (!order || this.busy) {
      return;
    }
    this.start('challan:share');
    this.service.challan(order.id, 'pdf', true).subscribe({
      next: (file) => {
        this.busy = null;
        const name = file.fileName || this.challanName(order);
        shareOrSave(new File([file.blob], name, { type: 'application/pdf' }), `Delivery challan ${order.challanNumber}`).then(
          (outcome) => {
            if (outcome === 'saved') {
              this.toast.showInfo(`${name} was downloaded. Attach it to WhatsApp or an email to share it.`);
            }
          }
        );
      },
      error: (error) => this.failed(documentError(error, 'The challan could not be shared.'), () => this.shareChallan()),
    });
  }

  /** A payment was recorded or cancelled below: the head's balance and badge follow the api. */
  refresh(): void {
    this.service.show(this.orderId).subscribe({
      next: (result) => {
        if (result.ok) {
          this.show(result.data, true);
        }
      },
      error: () => {},
    });
  }

  private move(stage: StageKey, back: StageKey | null): void {
    const order = this.order;
    if (!order || this.busy) {
      return;
    }
    this.start('stage');
    this.service.setStage(order.id, stage).subscribe({
      next: (result) => {
        this.busy = null;
        if (!result.ok) {
          this.actionError = { message: `The stage was not changed. ${result.message}` };
          return;
        }
        this.show(result.data, true);
        if (back) {
          // The move is already saved; "Undo" posts the stage it came from.
          this.undo.offer({
            message: `${result.data.number} is now ${result.data.stageLabel}`,
            commit: () => {},
            undo: () => this.move(back, null),
          });
        } else {
          this.toast.showSuccess(`${result.data.number} is now ${result.data.stageLabel}`);
        }
      },
      error: (error) => this.failed(httpMessage(error, 'The stage was not changed.'), () => this.move(stage, back)),
    });
  }

  private save(what: string, changes: OrderUpdate, done: string): void {
    const order = this.order;
    if (!order || this.busy) {
      return;
    }
    this.start(what);
    this.service.update(order.id, changes).subscribe({
      next: (result: Result<OrderPage>) => {
        this.busy = null;
        if (!result.ok) {
          this.actionError = { message: result.message };
          return;
        }
        this.show(result.data);
        this.toast.showSuccess(done);
      },
      error: (error) => this.failed(httpMessage(error, 'The change was not saved.'), () => this.save(what, changes, done)),
    });
  }

  /** `keepTyped` leaves unsaved text in the fields alone when only the stage or the balance changed. */
  private show(order: OrderPage, keepTyped = false): void {
    const before = this.order;
    this.order = order;
    if (!keepTyped || !before || this.promised === before.promisedDate) {
      this.promised = order.promisedDate;
    }
    if (!keepTyped || !before || !this.transportChangedFrom(before)) {
      this.vehicle = order.vehicleNumber;
      this.transporter = order.transporter;
      this.notes = order.notes;
    }
  }

  private transportChangedFrom(order: OrderPage): boolean {
    return this.vehicle !== order.vehicleNumber || this.transporter !== order.transporter || this.notes !== order.notes;
  }

  private challanName(order: OrderPage): string {
    return documentName('Delivery-challan', order.challanNumber || order.number);
  }

  private start(action: string): void {
    this.busy = action;
    this.actionError = null;
  }

  private failed(message: string, retry: () => void): void {
    this.busy = null;
    this.actionError = { message, retry };
  }

  private fail(message: string): void {
    this.errorMessage = message;
    this.state = 'error';
  }
}
