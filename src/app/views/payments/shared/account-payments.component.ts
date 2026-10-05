import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { Subscription } from 'rxjs';

import { ToastService } from '../../../shared/services/toast.service';
import { httpMessage } from '../api-result';
import { documentError, documentName, saveBlob, shareOrSave } from '../document-file';
import { Account, Payment, PaymentKind, PaymentList, PaymentMode, PaymentScope } from '../payments.model';
import { PaymentsService, SavedPayment } from '../payments.service';

type State = 'loading' | 'error' | 'ready';

/**
 * The payments of one job (an order or a bill: one shared balance), of one
 * customer, or all of them. Shows what is received and what is left, lists
 * every receipt and refund, and opens "Record payment". Used on the order
 * page, the bill's payments page and the payments register.
 */
@Component({
  selector: 'app-account-payments',
  templateUrl: './account-payments.component.html',
  styleUrls: ['./account-payments.component.scss'],
})
export class AccountPaymentsComponent implements OnChanges, OnDestroy {
  @Input() orderId: number | null = null;
  @Input() billId: number | null = null;
  @Input() customerId: number | null = null;
  /** The register's filters: a period (`YYYY-MM-DD`, both days included) and a mode. */
  @Input() from: string | null = null;
  @Input() to: string | null = null;
  @Input() mode: PaymentMode | null = null;
  @Input() heading = 'Payments';
  /** True where "Record payment" is the page's one primary button. */
  @Input() primaryAction = false;
  /** Opens "Record payment" as soon as the account has loaded (a link with ?record=1). */
  @Input() openRecord = false;

  /** The list was loaded: carries the account, or null for a customer or the register. */
  @Output() loaded = new EventEmitter<Account | null>();
  /** A payment was recorded or cancelled: the balance of the job has moved. */
  @Output() changed = new EventEmitter<Account | null>();

  @ViewChild('rowMenu') rowMenu?: Menu;

  state: State = 'loading';
  errorMessage = '';
  payments: Payment[] = [];
  totals: PaymentList['totals'] = { received: 0, refunded: 0, netReceived: 0 };
  summary: PaymentList['summary'] = { count: 0, byMode: [], byDay: [] };
  account: Account | null = null;

  dialog: PaymentKind | null = null;
  /** The entry just saved, offered for preview and sharing. */
  lastSaved: Payment | null = null;
  /** The entry being cancelled, with the state of that request. */
  cancelling: { payment: Payment; busy: boolean; error: string } | null = null;
  /** The button that is working, as "<payment id>:<action>". */
  busy: string | null = null;
  actionError: { message: string; retry: () => void } | null = null;
  preview: { payment: Payment; html: string } | null = null;
  menuItems: MenuItem[] = [];

  readonly placeholders = [0, 1, 2];
  private openedOnce = false;
  private fetching?: Subscription;

  constructor(private service: PaymentsService, private toast: ToastService, private host: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    const job = [changes['orderId'], changes['billId'], changes['customerId']].filter((change) => !!change);
    if (job.some((change) => !change.firstChange)) {
      // Another bill, order or customer in the same panel (one bill's page straight to another's): nothing of the last one is kept.
      this.account = null;
      this.payments = [];
      this.dialog = null;
      this.lastSaved = null;
      this.cancelling = null;
      this.busy = null;
      this.actionError = null;
      this.preview = null;
      this.openedOnce = false;
    }
    if (job.length || changes['from'] || changes['to'] || changes['mode']) {
      this.load();
    }
  }

  ngOnDestroy(): void {
    this.fetching?.unsubscribe();
  }

  /** The job or customer on screen. An answer that comes back for another one is not put on the panel. */
  private get shown(): string {
    return [this.orderId, this.billId, this.customerId].join('|');
  }

  get scope(): PaymentScope {
    return { orderId: this.orderId, billId: this.billId, customerId: this.customerId, from: this.from, to: this.to, mode: this.mode };
  }

  /** A period, a mode or a customer narrows the register. */
  get filtered(): boolean {
    return !this.isJob && !!(this.from || this.to || this.mode || this.customerId);
  }

  /** One job is shown: the account figures and "Record payment" apply. */
  get isJob(): boolean {
    return !!(this.orderId || this.billId);
  }

  get orderCancelled(): boolean {
    return this.account?.order?.status === 'cancelled';
  }

  get canRecord(): boolean {
    return !!this.account && this.account.balance > 0 && !this.orderCancelled;
  }

  get canRefund(): boolean {
    return !!this.account && this.account.netReceived > 0;
  }

  load(): void {
    this.state = 'loading';
    this.fetch(false);
  }

  /** Brings the panel into view: the "Payments" link of the order page. */
  focusPanel(): void {
    this.host.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  record(kind: PaymentKind): void {
    this.dialog = kind;
    this.actionError = null;
    // The "is saved" line is about the last thing done; a new step ends it.
    this.lastSaved = null;
  }

  onSaved(saved: SavedPayment): void {
    this.dialog = null;
    this.lastSaved = saved.payment;
    this.toast.showSuccess(`${saved.payment.number} saved`);
    this.account = saved.account || this.account;
    this.changed.emit(this.account);
    this.fetch(true);
  }

  isBusy(payment: Payment, action: string): boolean {
    return this.busy === `${payment.id}:${action}`;
  }

  docTitle(payment: Payment): string {
    return `${payment.kind === 'refund' ? 'Refund voucher' : 'Receipt'} ${payment.number}`;
  }

  openPreview(payment: Payment): void {
    if (this.busy) {
      return;
    }
    const shown = this.start(payment, 'preview');
    this.service.receipt(payment.id, 'html').subscribe({
      next: (file) => {
        file.blob.text().then((html) => {
          if (shown !== this.shown) {
            return;
          }
          this.busy = null;
          this.preview = { payment, html };
        });
      },
      error: (error) => this.failed(shown, error, `${this.docTitle(payment)} could not be opened.`, () => this.openPreview(payment)),
    });
  }

  download(payment: Payment): void {
    if (this.busy) {
      return;
    }
    const shown = this.start(payment, 'download');
    this.service.receipt(payment.id, 'pdf', true).subscribe({
      next: (file) => {
        // The file that was asked for is still handed over; the buttons belong to what is now on screen.
        if (shown === this.shown) {
          this.busy = null;
        }
        saveBlob(file.blob, file.fileName || this.fileName(payment));
      },
      error: (error) => this.failed(shown, error, `${this.docTitle(payment)} could not be downloaded.`, () => this.download(payment)),
    });
  }

  /** The share sheet of the tablet or phone (WhatsApp, email); elsewhere the PDF is downloaded. */
  share(payment: Payment): void {
    if (this.busy) {
      return;
    }
    const shown = this.start(payment, 'share');
    this.service.receipt(payment.id, 'pdf', true).subscribe({
      next: (file) => {
        if (shown !== this.shown) {
          return;
        }
        this.busy = null;
        const name = file.fileName || this.fileName(payment);
        shareOrSave(new File([file.blob], name, { type: 'application/pdf' }), this.docTitle(payment)).then((outcome) => {
          if (outcome === 'saved') {
            this.toast.showInfo(`${name} was downloaded. Attach it to WhatsApp or an email to share it.`);
          }
        });
      },
      error: (error) => this.failed(shown, error, `${this.docTitle(payment)} could not be shared.`, () => this.share(payment)),
    });
  }

  openMenu(event: Event, payment: Payment): void {
    const items: MenuItem[] = [
      { label: 'Download PDF', command: () => this.download(payment) },
      { label: 'Share', command: () => this.share(payment) },
    ];
    if (!payment.cancelled) {
      items.push(
        { separator: true },
        { label: 'Cancel this entry', styleClass: 'danger', command: () => (this.cancelling = { payment, busy: false, error: '' }) }
      );
    }
    this.menuItems = items;
    this.rowMenu?.toggle(event);
  }

  cancelEntry(reason: string): void {
    const cancelling = this.cancelling;
    if (!cancelling || cancelling.busy) {
      return;
    }
    cancelling.busy = true;
    cancelling.error = '';
    const shown = this.shown;
    this.service.cancel(cancelling.payment.id, reason).subscribe({
      next: (result) => {
        if (shown !== this.shown) {
          return;
        }
        if (!result.ok) {
          cancelling.busy = false;
          cancelling.error = result.message;
          return;
        }
        this.cancelling = null;
        this.toast.showSuccess(`${cancelling.payment.number} cancelled`);
        this.lastSaved = null;
        this.account = result.data.account || this.account;
        this.changed.emit(this.account);
        this.fetch(true);
      },
      error: (error) => {
        cancelling.busy = false;
        cancelling.error = httpMessage(error, 'The entry was not cancelled.');
      },
    });
  }

  trackById(_: number, payment: Payment): number {
    return payment.id;
  }

  /** `silent` keeps the list on screen while it refreshes after a change. */
  private fetch(silent: boolean): void {
    this.fetching?.unsubscribe();
    this.fetching = this.service.list(this.scope).subscribe({
      next: (result) => {
        if (!result.ok) {
          this.fail(result.message, silent);
          return;
        }
        this.payments = result.data.payments;
        this.totals = result.data.totals;
        this.summary = result.data.summary;
        this.account = result.data.account;
        this.state = 'ready';
        if (!silent) {
          this.loaded.emit(this.account);
          if (this.openRecord && !this.openedOnce && this.canRecord) {
            this.openedOnce = true;
            this.dialog = 'receipt';
          }
        }
      },
      error: (error) => this.fail(httpMessage(error, 'We could not load the payments.'), silent),
    });
  }

  private fail(message: string, silent: boolean): void {
    if (silent) {
      this.actionError = { message: `The list was not refreshed. ${message}`, retry: () => this.fetch(true) };
      return;
    }
    this.errorMessage = message;
    this.state = 'error';
  }

  private fileName(payment: Payment): string {
    return documentName(payment.kind === 'refund' ? 'Refund-voucher' : 'Receipt', payment.number);
  }

  /** Marks the button as working and returns what was on screen then. */
  private start(payment: Payment, action: string): string {
    this.busy = `${payment.id}:${action}`;
    this.actionError = null;
    return this.shown;
  }

  private failed(shown: string, error: any, what: string, retry: () => void): void {
    if (shown !== this.shown) {
      return;
    }
    this.busy = null;
    this.actionError = { message: documentError(error, what), retry };
  }
}
