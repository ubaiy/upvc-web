import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { ToastService } from 'src/app/shared/services/toast.service';
import { QuotationService } from './quotation.service';
import {
  apiHasStatus,
  buildStatusTabs,
  errorText,
  matchesSearch,
  QuotationRow,
  shortDate,
  STATUS_BADGE,
  STATUS_LABELS,
  StatusTab,
  toQuotationRows,
} from './quotation-list.model';

/** Rows per page. The API returns the whole list; paging is done here. */
export const PAGE_SIZE = 20;

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

  rows: QuotationRow[] = [];
  loading = true;
  loadFailed = false;

  /** Tabs are shown once the API reports statuses (card A1). */
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

  deleteRow: QuotationRow | null = null;
  deleting = false;

  private _query?: Subscription;
  /** An ?edit= link that arrived before the list did. */
  private _pendingEditId = 0;

  constructor(
    private _route: ActivatedRoute,
    private _router: Router,
    private _dataService: QuotationService,
    private _toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
    // /quotation?new=1 opens the dialog (Home and the old /quotation/add link
    // arrive this way); /quotation?edit=14 opens it for that quotation.
    this._query = this._route.queryParamMap.subscribe((params) => {
      if (params.has('new')) {
        this.openNew();
      } else if (params.has('edit')) {
        this._openEditById(Number(params.get('edit')));
      }
    });
  }

  ngOnDestroy(): void {
    this._query?.unsubscribe();
  }

  get filtered(): QuotationRow[] {
    return this.rows.filter(
      (row) => (this.activeTab === 'all' || row.status === this.activeTab) && matchesSearch(row, this.search)
    );
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
  }

  get pageRows(): QuotationRow[] {
    const start = Math.min(this.page, this.pageCount - 1) * PAGE_SIZE;
    return this.filtered.slice(start, start + PAGE_SIZE);
  }

  /** "8 quotations", or "21–40 of 53 quotations" when there is more than one page. */
  get footText(): string {
    const total = this.filtered.length;
    const noun = total === 1 ? 'quotation' : 'quotations';
    if (this.pageCount === 1) {
      return `${total} ${noun}`;
    }
    const page = Math.min(this.page, this.pageCount - 1);
    const first = page * PAGE_SIZE + 1;
    return `${first}–${Math.min(total, first + PAGE_SIZE - 1)} of ${total} ${noun}`;
  }

  /** True when the company has no quotation at all (not just none matching the filter). */
  get empty(): boolean {
    return !this.loading && !this.loadFailed && this.rows.length === 0;
  }

  get columns(): number {
    return 6 + (this.showUpdated ? 1 : 0);
  }

  load(): void {
    this.loading = true;
    this.loadFailed = false;
    this._dataService
      .getAllQuotations()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res) => {
          this.loading = false;
          if (!res?.success) {
            this.loadFailed = true;
            return;
          }
          this.rows = toQuotationRows(res.data);
          this.showTabs = apiHasStatus(res.data);
          this.tabs = buildStatusTabs(this.rows);
          if (!this.showTabs || !this.tabs.some((tab) => tab.key === this.activeTab)) {
            this.activeTab = 'all';
          }
          this.showUpdated = this.rows.some((row) => !!row.updatedAt);
          if (this._pendingEditId) {
            this._openEditById(this._pendingEditId);
          }
        },
        error: () => (this.loadFailed = true),
      });
  }

  selectTab(tab: StatusTab): void {
    this.activeTab = tab.key;
    this.page = 0;
  }

  onSearch(): void {
    this.page = 0;
  }

  clearFilters(): void {
    this.search = '';
    this.activeTab = 'all';
    this.page = 0;
  }

  previous(): void {
    this.page = Math.max(0, Math.min(this.page, this.pageCount - 1) - 1);
  }

  next(): void {
    this.page = Math.min(this.pageCount - 1, this.page + 1);
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
  }

  /** A new or changed quotation opens on its own page, ready for the first window. */
  onSaved(id: number): void {
    this.dialogOpen = false;
    this.editRow = null;
    this._router.navigate(['/quotation/detail', id]);
  }

  onDuplicated(id: number): void {
    this.duplicateRow = null;
    this._toastService.showSuccess('Quotation duplicated');
    this._router.navigate(['/quotation/detail', id]);
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
          this.rows = this.rows.filter((r) => r.id !== row.id);
          this.tabs = buildStatusTabs(this.rows);
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
      this._pendingEditId = 0;
      this._clearQuery();
    }
  }

  private _clearQuery(): void {
    const params = this._route.snapshot.queryParamMap;
    if (params.has('new') || params.has('edit')) {
      this._router.navigate([], { relativeTo: this._route, queryParams: {}, replaceUrl: true });
    }
  }
}
