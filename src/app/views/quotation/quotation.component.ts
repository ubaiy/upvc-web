import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { Subject, Subscription, of, timer } from 'rxjs';
import { catchError, finalize, map, switchMap } from 'rxjs/operators';

import { ToastService } from 'src/app/shared/services/toast.service';
import { DuplicatedQuotation } from './add/duplicate-quotation-dialog.component';
import { QuotationService } from './quotation.service';
import { QuotationListService, QuotationPage } from './quotation-list.service';
import {
  errorText,
  QuotationRow,
  shortDate,
  STATUS_BADGE,
  STATUS_LABELS,
  StatusTab,
  tabsFromCounts,
  toQuotationRow,
} from './quotation-list.model';

/** Rows per page. The API searches, filters by status and pages. */
export const PAGE_SIZE = 25;
/** Typing pauses this long before the API is asked. */
export const SEARCH_DELAY_MS = 300;

/**
 * The quotation list (card U3, mockup quotations.html): status tabs, search,
 * one row per quotation that links to its page, and one "more" menu per row.
 * "New quotation" opens a dialog instead of a page.
 */
@Component({
  selector: 'app-quotation',
  templateUrl: './quotation.component.html',
  styleUrls: ['./quotation.component.scss'],
})
export class QuotationComponent implements OnInit, OnDestroy {
  @ViewChild('rowMenu') rowMenu?: Menu;

  readonly skeletonRows = [0, 1, 2, 3, 4, 5];
  readonly statusLabels = STATUS_LABELS;
  readonly statusBadge = STATUS_BADGE;

  /** The rows of the page that is showing. */
  rows: QuotationRow[] = [];
  /** Quotations that match the tab and the search, on every page. */
  total = 0;
  loading = true;
  loadFailed = false;
  /** True when the company has no quotation at all (not just none matching the filter). */
  empty = false;

  /** Tabs are shown once the API has sent the count per status. */
  showTabs = false;
  tabs: StatusTab[] = [];
  activeTab: StatusTab['key'] = 'all';
  /** The "Updated" column is shown once the API sends a date with each row. */
  showUpdated = false;

  search = '';
  page = 0;

  menuItems: MenuItem[] = [];

  /** New-quotation dialog; `editRow` set means rename or change customer. */
  dialogOpen = false;
  editRow: QuotationRow | null = null;

  duplicateRow: QuotationRow | null = null;
  /** Customer to start a new quotation for (/quotation?new=1&customer=3, from the customer page). */
  newForCustomer: number | null = null;

  deleteRow: QuotationRow | null = null;
  deleting = false;

  private _query?: Subscription;
  private _pages?: Subscription;
  /** Each value asks for the page again; the number is the pause before asking. */
  private _wanted = new Subject<number>();
  /** An ?edit= link that arrived before the list did. */
  private _pendingEditId = 0;
  /** What had the keyboard focus when "New quotation" was pressed. */
  private _opener: HTMLElement | null = null;

  constructor(
    private _route: ActivatedRoute,
    private _router: Router,
    private _dataService: QuotationService,
    private _list: QuotationListService,
    private _toastService: ToastService
  ) {}

  ngOnInit(): void {
    // A newer request replaces one still on its way, so the rows always match the tab and the search.
    this._pages = this._wanted
      .pipe(
        switchMap((delay) =>
          (delay ? timer(delay) : of(0)).pipe(
            switchMap(() =>
              this._list.page({ status: this.activeTab, search: this.search, page: this.page + 1, perPage: PAGE_SIZE })
            ),
            map((page): QuotationPage | null => page),
            catchError(() => of(null))
          )
        )
      )
      .subscribe((page) => this._show(page));
    this.load();
    // /quotation?new=1 opens the dialog (Home and the old /quotation/add link
    // arrive this way); /quotation?edit=14 opens it for that quotation.
    this._query = this._route.queryParamMap.subscribe((params) => {
      if (params.has('new')) {
        this.newForCustomer = Number(params.get('customer')) || null;
        this.openNew();
      } else if (params.has('edit')) {
        this._openEditById(Number(params.get('edit')));
      }
    });
  }

  ngOnDestroy(): void {
    this._query?.unsubscribe();
    this._pages?.unsubscribe();
  }

  get filtering(): boolean {
    return this.activeTab !== 'all' || !!this.search.trim();
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.total / PAGE_SIZE));
  }

  /** "8 quotations", or "26–50 of 53 quotations" when there is more than one page. */
  get footText(): string {
    const noun = this.total === 1 ? 'quotation' : 'quotations';
    if (this.pageCount === 1) {
      return `${this.total} ${noun}`;
    }
    const first = this.page * PAGE_SIZE + 1;
    return `${first}–${Math.min(this.total, first + PAGE_SIZE - 1)} of ${this.total} ${noun}`;
  }

  get columns(): number {
    return 6 + (this.showUpdated ? 1 : 0);
  }

  /** Asks the API for the page that is showing, and for the counts on the tabs. */
  load(): void {
    this._loadPage();
    this._list.counts().subscribe({
      next: (counts) => {
        this.tabs = tabsFromCounts(counts);
        this.showTabs = true;
      },
      // The list works without tabs; they come back with the next load.
      error: () => (this.showTabs = false),
    });
  }

  selectTab(tab: StatusTab): void {
    this.activeTab = tab.key;
    this.page = 0;
    this._loadPage();
  }

  /** Called on every keystroke; the API is asked once the typing pauses. */
  onSearch(): void {
    this.page = 0;
    this._loadPage(SEARCH_DELAY_MS);
  }

  clearFilters(): void {
    this.search = '';
    this.activeTab = 'all';
    this.page = 0;
    this._loadPage();
  }

  previous(): void {
    if (this.page > 0) {
      this.page = this.page - 1;
      this._loadPage();
    }
  }

  next(): void {
    if (this.page < this.pageCount - 1) {
      this.page = this.page + 1;
      this._loadPage();
    }
  }

  private _loadPage(delay = 0): void {
    this.loading = true;
    this.loadFailed = false;
    this._wanted.next(delay);
  }

  updated(row: QuotationRow): string {
    return shortDate(row.updatedAt);
  }

  open(row: QuotationRow): void {
    this._router.navigate(['/quotation/detail', row.id]);
  }

  /** The whole row opens the quotation; links and buttons inside it keep their own job. */
  onRowClick(event: MouseEvent, row: QuotationRow): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('a, button, input')) {
      return;
    }
    this.open(row);
  }

  openMenu(event: Event, row: QuotationRow): void {
    const billed = row.status === 'billed';
    this.menuItems = [
      { label: 'Open', icon: 'pi pi-arrow-right', command: () => this.open(row) },
      {
        label: 'Edit details',
        icon: 'pi pi-pencil',
        visible: !billed,
        command: () => this.openEdit(row),
      },
      { label: 'Duplicate', icon: 'pi pi-copy', command: () => (this.duplicateRow = row) },
      { separator: true, visible: !billed },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        styleClass: 'danger',
        visible: !billed,
        command: () => (this.deleteRow = row),
      },
    ];
    this.rowMenu?.toggle(event);
  }

  openNew(): void {
    if (!this._route.snapshot.queryParamMap.has('customer')) {
      this.newForCustomer = null;
    }
    this._opener = document.activeElement as HTMLElement | null;
    this.editRow = null;
    this.dialogOpen = true;
  }

  openEdit(row: QuotationRow): void {
    this.editRow = row;
    this.dialogOpen = true;
  }

  closeDialog(): void {
    this.dialogOpen = false;
    this.editRow = null;
    this._clearQuery();
    // Hand the keyboard back to the button that opened the dialog.
    const opener = this._opener;
    this._opener = null;
    if (opener && document.body.contains(opener)) {
      setTimeout(() => opener.focus());
    }
  }

  /** A new or changed quotation opens on its own page, ready for the first window. */
  onSaved(id: number): void {
    this.dialogOpen = false;
    this.editRow = null;
    this._router.navigate(['/quotation/detail', id]);
  }

  onDuplicated(copy: DuplicatedQuotation): void {
    this.duplicateRow = null;
    this._toastService.showSuccess(
      copy.pricesChanged ? 'Quotation duplicated. Prices have changed since the original.' : 'Quotation duplicated'
    );
    this._router.navigate(['/quotation/detail', copy.id]);
  }

  confirmDelete(): void {
    const row = this.deleteRow;
    if (!row || this.deleting) {
      return;
    }
    this.deleting = true;
    this._dataService
      .deleteQuotation(row.id)
      .pipe(finalize(() => (this.deleting = false)))
      .subscribe({
        next: (res) => {
          if (!res?.success) {
            this._toastService.showError(res?.message || 'We could not delete the quotation.');
            return;
          }
          this.deleteRow = null;
          // The last row of a later page went: show the page before it.
          if (this.rows.length === 1 && this.page > 0) {
            this.page = this.page - 1;
          }
          this.load();
          this._toastService.showSuccess(`“${row.name}” deleted`);
        },
        error: (err) => this._toastService.showError(errorText(err, 'We could not delete the quotation.')),
      });
  }

  trackById(_: number, row: QuotationRow): number {
    return row.id;
  }

  private _openEditById(id: number): void {
    if (!id) {
      return;
    }
    const row = this.rows.find((r) => r.id === id);
    if (row) {
      this._pendingEditId = 0;
      this.openEdit(row);
    } else if (this.loading) {
      this._pendingEditId = id;
    } else {
      // Not on the page that is showing: ask for that one quotation.
      this._pendingEditId = 0;
      this._dataService.getQuotation(id).subscribe({
        next: (res) => (res?.success && res.data ? this.openEdit(toQuotationRow(res.data)) : this._clearQuery()),
        error: () => this._clearQuery(),
      });
    }
  }

  private _show(page: QuotationPage | null): void {
    this.loading = false;
    if (!page) {
      this.loadFailed = true;
      return;
    }
    // A page past the end (rows were deleted elsewhere): go to the last one.
    if (!page.rows.length && page.total > 0 && this.page > 0) {
      this.page = Math.max(0, page.lastPage - 1);
      this._loadPage();
      return;
    }
    this.rows = page.rows;
    this.total = page.total;
    if (!this.filtering) {
      this.empty = page.total === 0;
    }
    this.showUpdated = this.rows.some((row) => !!row.updatedAt);
    if (this._pendingEditId) {
      this._openEditById(this._pendingEditId);
    }
  }

  private _clearQuery(): void {
    const params = this._route.snapshot.queryParamMap;
    if (params.has('new') || params.has('edit') || params.has('customer')) {
      this._router.navigate([], { relativeTo: this._route, queryParams: {}, replaceUrl: true });
    }
  }
}
