import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { saveAs } from 'file-saver';

import { Crumb } from 'src/app/shared/components/page-header/page-header.component';
import { formatInr } from 'src/app/shared/pipes/inr.pipe';
import { ToastService } from 'src/app/shared/services/toast.service';
import { QuotationService } from '../quotation.service';
import { errorText, QuotationRow, toQuotationRow } from '../quotation-list.model';
import {
  pdfFileName,
  PRIMARY_BUTTON,
  primaryAction,
  PrimaryAction,
  QuotationLine,
  QuotationView,
  toQuotationView,
} from './detail/quotation-detail.model';
import { lineMenu, LineMenuAction, pageMenu, PageMenuAction } from './detail/quotation-menus';

/** What the user was doing when a sent quotation asked "Create revision?". */
type ReviseIntent = { kind: 'none' | 'add' | 'summary' } | { kind: 'edit'; position: number };

/**
 * The quotation page (card U4): windows on the left, customer and the Summary
 * card on the right. The Summary card is the only place margin, payment
 * terms, discount, validity and tax are decided, so the total on screen is
 * the total on the PDF and on the bill. One primary button follows the
 * status: Send quotation → Mark as accepted → Create bill.
 */
@Component({
  selector: 'app-sub-quotation',
  templateUrl: './sub-quotation.component.html',
  styleUrls: ['./sub-quotation.component.scss'],
})
export class SubQuotationComponent implements OnInit, OnDestroy {
  @ViewChild('menu') menu?: Menu;

  id = 0;
  loading = true;
  loadFailed = false;
  view: QuotationView | null = null;
  /** The row shape U3's "Edit details" dialog takes. */
  editRow: QuotationRow | null = null;

  /** Key of the action in flight: a button shows as busy and the others wait. */
  busy = '';
  /** A failed action, shown inline above the windows. */
  actionError = '';
  /** This draft is a copy whose prices differ from its source. */
  copyRepriced = false;

  menuItems: MenuItem[] = [];
  sendOpen = false;
  summaryOpen = false;
  duplicateOpen = false;
  deleteOpen = false;
  reviseIntent: ReviseIntent | null = null;
  lineToDelete: QuotationLine | null = null;
  lineToRename: QuotationLine | null = null;
  renameValue = '';

  readonly skeletonRows = [0, 1, 2];
  private _raw: any = null;
  private _subs = new Subscription();
  private _afterLoad: 'summary' | null = null;

  constructor(
    private _route: ActivatedRoute,
    private _router: Router,
    private _dataService: QuotationService,
    private _toast: ToastService
  ) {}

  ngOnInit(): void {
    this._subs.add(
      this._route.paramMap.subscribe((params) => {
        this.id = Number(params.get('id'));
        this.view = null;
        this.actionError = '';
        this.load();
      })
    );
    this._subs.add(
      this._route.queryParamMap.subscribe((params) => (this.copyRepriced = params.has('repriced')))
    );
  }

  ngOnDestroy(): void {
    this._subs.unsubscribe();
  }

  get crumbs(): Crumb[] {
    return [{ label: 'Quotations', link: '/quotation' }, { label: this.view?.number || 'Quotation' }];
  }

  get primary(): PrimaryAction {
    return this.view ? primaryAction(this.view) : null;
  }

  get primaryLabel(): string {
    return this.primary ? PRIMARY_BUTTON[this.primary].label : '';
  }

  get primaryIcon(): any {
    return this.primary ? PRIMARY_BUTTON[this.primary].icon : 'check';
  }

  /** "Create order" (card O2), or "Open order" once `quatation/show` returns an `order`. Primary on an accepted quotation. */
  get orderAction(): { label: string; link: any[]; query: { quotation: number } | null; primary: boolean } | null {
    const view = this.view;
    if (!view || view.supersededBy || !view.lines.length || (view.status !== 'accepted' && view.status !== 'billed')) {
      return null;
    }
    const [primary, order] = [view.status === 'accepted', this._raw?.order];
    return Number(order?.id) > 0 && order.status !== 'cancelled'
      ? { label: 'Open order', link: ['/orders', Number(order.id)], query: null, primary }
      : { label: 'Create order', link: ['/orders/new'], query: { quotation: view.id }, primary };
  }

  /** Draft with no window yet: the empty state carries the page's one primary button. */
  get empty(): boolean {
    return !!this.view && !this.view.lines.length;
  }

  /** Status for the steps. "Expired" is a sent quotation past its date; a badge says so beside the steps. */
  get stepStatus(): string {
    return this.view?.status === 'expired' ? 'sent' : this.view?.status || 'draft';
  }

  get stepDate(): Date | null {
    const view = this.view;
    if (!view) {
      return null;
    }
    switch (view.status) {
      case 'sent':
      case 'expired':
        return view.sentAt;
      case 'accepted':
        return view.acceptedAt;
      case 'declined':
        return view.declinedAt;
      case 'billed':
        return view.bill?.date || null;
      default:
        return null;
    }
  }

  get addLink(): any[] {
    return ['/quotation/detail', this.id, 'add', (this.view?.lines.length || 0) + 1];
  }

  editLink(line: QuotationLine): any[] {
    return ['/quotation/detail', this.id, 'edit', line.id, line.position];
  }

  trackLine(_: number, line: QuotationLine): number {
    return line.id;
  }

  /** Loads the quotation. `silent` keeps the page on screen while it refreshes after an action. */
  load(silent = false): void {
    if (!silent) {
      this.loading = true;
    }
    this.loadFailed = false;
    this._dataService.getQuotation(this.id).subscribe({
      next: (res) => {
        this.loading = false;
        if (!res?.success || !res.data) {
          this.loadFailed = true;
          return;
        }
        this._show(res.data);
      },
      error: () => {
        this.loading = false;
        this.loadFailed = !this.view;
        if (this.view) {
          this.actionError = 'We could not refresh this quotation. Check your connection.';
        }
      },
    });
  }

  // ----- the primary button -------------------------------------------------

  runPrimary(): void {
    switch (this.primary) {
      case 'send':
        this.sendOpen = true;
        break;
      case 'accept':
        this.setStatus('accepted', 'Marked as accepted');
        break;
      case 'bill':
        this.createBill();
        break;
      case 'bill-pdf':
        this.downloadBill();
        break;
      case 'revise':
        this.reviseIntent = { kind: 'none' };
        break;
      case 'open-current':
        this._router.navigate(['/quotation/detail', this.view!.supersededBy!.id]);
        break;
    }
  }

  setStatus(status: string, done: string): void {
    this._run(status, this._dataService.changeQuotationStatus(this.id, status), () => {
      this._toast.showSuccess(done);
      this.load(true);
    });
  }

  /** No dialog: the bill copies the quotation's lines, discount and tax. */
  createBill(): void {
    this._run('bill', this._dataService.createBill(this.id), (bill) => {
      this._toast.showSuccess(bill?.number ? `Bill ${bill.number} created` : 'Bill created');
      this.load(true);
    });
  }

  downloadPdf(): void {
    const view = this.view!;
    this.busy = 'pdf';
    this.actionError = '';
    this._dataService
      .getQuotationPdf(view.id)
      .pipe(finalize(() => (this.busy = '')))
      .subscribe({
        next: (file) => saveAs(file, pdfFileName(view)),
        error: () => (this.actionError = 'We could not make the PDF. Try again.'),
      });
  }

  downloadBill(): void {
    const bill = this.view!.bill!;
    this.busy = 'bill-pdf';
    this.actionError = '';
    this._dataService
      .getBillPdf(bill.id)
      .pipe(finalize(() => (this.busy = '')))
      .subscribe({
        next: (file) => saveAs(file, 'Bill-' + bill.number.replace(/[^A-Za-z0-9]+/g, '-') + '.pdf'),
        error: () => (this.actionError = 'We could not make the bill PDF. Try again.'),
      });
  }

  updatePrices(): void {
    const before = this.view!.total;
    this._run('prices', this._dataService.updateQuotationPrices(this.id), () => {
      this._dataService.getQuotation(this.id).subscribe({
        next: (res) => {
          if (res?.success && res.data) {
            this._show(res.data);
            const after = this.view!.total;
            this._toast.showSuccess(
              after === before
                ? 'Prices are up to date. The total did not change.'
                : `Prices updated. The total went from ${formatInr(before)} to ${formatInr(after)}.`
            );
          }
        },
        error: () => this.load(true),
      });
    });
  }

  // ----- windows ------------------------------------------------------------

  /** A draft is edited in place; a sent quotation asks once for a revision; a billed one is read only. */
  openLine(line: QuotationLine): void {
    const view = this.view!;
    if (view.editable) {
      this._router.navigate(this.editLink(line));
    } else if (view.revisable) {
      this.reviseIntent = { kind: 'edit', position: line.position };
    }
  }

  onLineClick(event: MouseEvent, line: QuotationLine): void {
    // The name link and the row menu handle their own clicks.
    if ((event.target as HTMLElement).closest('a, button')) {
      return;
    }
    this.openLine(line);
  }

  addWindow(): void {
    if (this.view!.editable) {
      this._router.navigate(this.addLink);
    } else if (this.view!.revisable) {
      this.reviseIntent = { kind: 'add' };
    }
  }

  duplicateLine(line: QuotationLine): void {
    this._run('line-' + line.id, this._dataService.duplicateLine(line.id), () => {
      this._toast.showSuccess(`${line.name} duplicated`);
      this.load(true);
    });
  }

  startRename(line: QuotationLine): void {
    this.renameValue = line.label;
    this.lineToRename = line;
  }

  saveRename(): void {
    const line = this.lineToRename!;
    this._run('rename', this._dataService.renameLine(line.id, this.renameValue.trim()), () => {
      this.lineToRename = null;
      this.load(true);
    });
  }

  confirmDeleteLine(): void {
    const line = this.lineToDelete!;
    this._run(
      'delete-line',
      this._dataService.removeLine(line.id),
      () => {
        this.lineToDelete = null;
        this._toast.showSuccess(`${line.name} removed`);
        this.load(true);
      },
      () => (this.lineToDelete = null)
    );
  }

  // ----- the Summary card, send, duplicate, revise, delete ------------------

  changeSummary(): void {
    if (this.view!.editable) {
      this.summaryOpen = true;
    } else if (this.view!.revisable) {
      this.reviseIntent = { kind: 'summary' };
    }
  }

  onSummarySaved(raw: any): void {
    this.summaryOpen = false;
    // The response is the quotation with its totals; the lines come with a reload.
    this.load(true);
    if (raw?.totals) {
      this._toast.showSuccess('Summary updated');
    }
  }

  onSent(): void {
    this.sendOpen = false;
    this.load(true);
  }

  onDuplicated(result: { id: number; number: string; pricesChanged: boolean }): void {
    this.duplicateOpen = false;
    this._toast.showSuccess(`Duplicated as ${result.number}`);
    this._router.navigate(['/quotation/detail', result.id], {
      queryParams: result.pricesChanged ? { repriced: 1 } : {},
    });
  }

  get reviseText(): string {
    const view = this.view;
    if (!view) {
      return '';
    }
    return `${view.number} has left your hands, so it is not changed in place. Revision ${view.number.replace(
      / R\d+$/,
      ''
    )} ${view.nextRevision} opens as a new draft with the same windows and prices. The version you sent stays as it is, and its PDF stays available.`;
  }

  confirmRevise(): void {
    const intent = this.reviseIntent!;
    this._run(
      'revise',
      this._dataService.reviseQuotation(this.id),
      (revision) => {
        this.reviseIntent = null;
        this._toast.showSuccess(`Revision ${revision?.number || ''} created`.replace('  ', ' '));
        const base = ['/quotation/detail', revision.id];
        // The revision comes back with its totals; the line ids are in totals.items.
        const lines: any[] = revision?.totals?.items || revision?.quatation_product || [];
        if (intent.kind === 'add' && lines.length) {
          this._router.navigate([...base, 'add', lines.length + 1]);
        } else if (intent.kind === 'edit' && lines[intent.position - 1]) {
          // Same windows in the same order: open the one that was clicked.
          this._router.navigate([...base, 'edit', lines[intent.position - 1].id, intent.position]);
        } else {
          this._afterLoad = intent.kind === 'summary' ? 'summary' : null;
          this._router.navigate(base);
        }
      },
      () => (this.reviseIntent = null)
    );
  }

  confirmDelete(): void {
    this._run(
      'delete',
      this._dataService.removeQuotation(this.id),
      () => {
        this._toast.showSuccess('Quotation deleted');
        this._router.navigate(['/quotation']);
      },
      () => (this.deleteOpen = false)
    );
  }

  dismissRepriced(): void {
    this._router.navigate([], { relativeTo: this._route, queryParams: {}, replaceUrl: true });
  }

  // ----- menus ----------------------------------------------------------------

  openMenu(event: Event): void {
    const actions: Record<PageMenuAction, () => void> = {
      edit: () => (this.editRow = toQuotationRow(this._listRow())),
      duplicate: () => (this.duplicateOpen = true),
      production: () => this._router.navigate(['/production', this.id]),
      revise: () => (this.reviseIntent = { kind: 'none' }),
      send: () => (this.sendOpen = true),
      decline: () => this.setStatus('declined', 'Marked as declined'),
      'back-to-sent': () => this.setStatus('sent', 'Moved back to Sent'),
      prices: () => this.updatePrices(),
      delete: () => (this.deleteOpen = true),
    };
    this._openMenu(event, pageMenu(this.view!, this.primary === 'revise', (action) => actions[action]()));
  }

  openLineMenu(event: Event, line: QuotationLine): void {
    const actions: Record<LineMenuAction, () => void> = {
      edit: () => this.openLine(line),
      rename: () => this.startRename(line),
      duplicate: () => this.duplicateLine(line),
      delete: () => (this.lineToDelete = line),
    };
    this._openMenu(event, lineMenu(this.view!, line, (action) => actions[action]()));
  }

  private _openMenu(event: Event, items: MenuItem[]): void {
    event.stopPropagation();
    this.menuItems = items;
    this.menu?.toggle(event);
  }

  // ----- helpers --------------------------------------------------------------

  private _show(raw: any): void {
    this._raw = raw;
    this.view = toQuotationView(raw);
    if (this._afterLoad === 'summary' && this.view.editable) {
      this.summaryOpen = true;
    }
    this._afterLoad = null;
  }

  /** The show response in the shape of a list row, for U3's dialog. */
  private _listRow(): any {
    const raw = this._raw || {};
    return { ...raw, name: raw.customer?.name, phone: raw.customer?.phone, total: this.view?.total };
  }

  /**
   * Runs one action: marks its button busy, shows a refusal or a failure
   * inline, and calls `done` with the data on success.
   */
  private _run(key: string, request: any, done: (data: any) => void, failed?: () => void): void {
    if (this.busy) {
      return;
    }
    this.busy = key;
    this.actionError = '';
    request.pipe(finalize(() => (this.busy = ''))).subscribe({
      next: (res: any) => {
        if (res?.success) {
          done(res.data);
        } else {
          this.actionError = res?.message || 'That did not work. Try again.';
          failed?.();
        }
      },
      error: (err: any) => {
        this.actionError = errorText(err, 'That did not work. Check your connection and try again.');
        failed?.();
      },
    });
  }
}
