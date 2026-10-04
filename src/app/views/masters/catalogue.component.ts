import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { ToastService } from '../../shared/services/toast.service';
import { RatesUpdated } from '../bulk-price-upload/update-rates-dialog.component';
import { CatalogueAdapter, isGlass } from './catalogue.adapter';
import {
  CATALOGUE_TABS,
  CatalogueTab,
  CatalogueTabDef,
  ColourRow,
  ItemRow,
  PriceFactors,
  ProfileRow,
  fixSpelling,
  unitLabel,
  usedAs,
  withMetreRate,
} from './catalogue.model';
import { RateCellState } from './rate-cell.component';

type Source = 'profiles' | 'colours' | 'items';
type LoadState = 'loading' | 'ready' | 'error';

interface CellStatus {
  state: RateCellState;
  error: string;
}

const PAGE_SIZE = 15;
const SOURCE_OF: Record<CatalogueTab, Source> = {
  profile: 'profiles',
  'profile-color': 'colours',
  glass: 'items',
  hardware: 'items',
};

/**
 * Catalogue: profiles, colours, glass and hardware on one page with four tabs
 * (card U5, mockup `profiles.html`). Rates are edited in the row; "Update
 * rates" changes all of them at once.
 */
@Component({
  selector: 'app-catalogue',
  templateUrl: './catalogue.component.html',
  styleUrls: ['./catalogue.component.scss'],
})
export class CatalogueComponent implements OnInit, OnDestroy {
  readonly tabs = CATALOGUE_TABS;
  readonly fixSpelling = fixSpelling;
  readonly unitLabel = unitLabel;
  readonly usedAs = usedAs;
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  tab: CatalogueTab = 'profile';
  state: Record<Source, LoadState> = { profiles: 'loading', colours: 'loading', items: 'loading' };
  profiles: ProfileRow[] = [];
  colours: ColourRow[] = [];
  glass: ItemRow[] = [];
  hardware: ItemRow[] = [];
  factors: PriceFactors | null = null;
  units: string[] = [];

  /** Search text and the second filter (category or group), kept per tab. */
  search: Record<CatalogueTab, string> = { profile: '', 'profile-color': '', glass: '', hardware: '' };
  filter: Record<CatalogueTab, string> = { profile: '', 'profile-color': '', glass: '', hardware: '' };
  page = 0;

  /** Save state of each in-row rate, keyed "<tab>:<id>:<field>". */
  cells: Record<string, CellStatus> = {};

  ratesOpen = false;
  private ratesPending = false;
  profileOpen = false;
  colourOpen = false;
  itemOpen = false;
  editing: { profile: ProfileRow | null; colour: ColourRow | null; item: ItemRow | null } = {
    profile: null,
    colour: null,
    item: null,
  };
  deleting: ColourRow | null = null;
  deleteBusy = false;
  deleteError = '';

  private subs = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private adapter: CatalogueAdapter,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.route.paramMap.subscribe((params) => {
        const id = params.get('tab') as CatalogueTab;
        this.tab = this.tabs.some((t) => t.id === id) ? id : 'profile';
        this.page = 0;
      })
    );
    this.subs.add(
      this.route.queryParamMap.subscribe((query) => {
        if (query.has('rates')) {
          // Asked for by the old /bulk-price-update address; opens once the profiles are in.
          this.ratesPending = true;
          this.openPendingRates();
          this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
        }
      })
    );
    this.load('profiles');
    this.load('colours');
    this.load('items');
    // Needed by the dialogs only; the lists still work when either is missing.
    this.adapter.units().subscribe({ next: (units) => (this.units = units), error: () => {} });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  // ---- loading -----------------------------------------------------------

  load(source: Source): void {
    this.state[source] = 'loading';
    const fail = () => (this.state[source] = 'error');
    if (source === 'profiles') {
      this.adapter.factors().subscribe({ next: (f) => (this.factors = f), error: () => (this.factors = null) });
      this.adapter.profiles().subscribe({
        next: (rows) => {
          this.profiles = rows;
          this.state.profiles = 'ready';
          this.openPendingRates();
        },
        error: fail,
      });
    } else if (source === 'colours') {
      this.adapter.colours().subscribe({
        next: (rows) => {
          this.colours = rows;
          this.state.colours = 'ready';
        },
        error: fail,
      });
    } else {
      this.adapter.items().subscribe({
        next: (rows) => {
          this.glass = rows.filter(isGlass);
          this.hardware = rows.filter((row) => !isGlass(row));
          this.state.items = 'ready';
        },
        error: fail,
      });
    }
  }

  private openPendingRates(): void {
    if (this.ratesPending && this.state.profiles === 'ready' && this.profiles.length) {
      this.ratesPending = false;
      this.ratesOpen = true;
    }
  }

  retry(): void {
    this.load(this.source);
  }

  // ---- the current tab ---------------------------------------------------

  get def(): CatalogueTabDef {
    return this.tabs.find((t) => t.id === this.tab) as CatalogueTabDef;
  }

  get source(): Source {
    return SOURCE_OF[this.tab];
  }

  get status(): LoadState {
    return this.state[this.source];
  }

  count(tab: CatalogueTab): number | null {
    return this.state[SOURCE_OF[tab]] === 'ready' ? this.all(tab).length : null;
  }

  /** The second filter of the toolbar: categories of profiles, groups of hardware. */
  get filterOptions(): string[] {
    const values = this.tab === 'profile' ? this.profiles.map((p) => p.category) : this.hardware.map((h) => h.costhead);
    return [...new Set(values.filter(Boolean))];
  }

  get hasFilter(): boolean {
    return this.tab === 'profile' || this.tab === 'hardware';
  }

  get rows(): any[] {
    const text = this.search[this.tab].trim().toLowerCase();
    const filter = this.filter[this.tab];
    return this.all(this.tab).filter((row: any) => {
      if (filter && (this.tab === 'profile' ? row.category : row.costhead) !== filter) {
        return false;
      }
      return !text || this.haystack(row).includes(text);
    });
  }

  get pageRows(): any[] {
    const start = this.page * PAGE_SIZE;
    return this.rows.slice(start, start + PAGE_SIZE);
  }

  get range(): string {
    const total = this.rows.length;
    const first = this.page * PAGE_SIZE + 1;
    const last = Math.min(total, first + PAGE_SIZE - 1);
    return total <= PAGE_SIZE ? `${total} ${total === 1 ? this.def.noun : this.def.plural}` : `Showing ${first} to ${last} of ${total}`;
  }

  get hasNext(): boolean {
    return (this.page + 1) * PAGE_SIZE < this.rows.length;
  }

  get filtered(): boolean {
    return !!this.search[this.tab].trim() || !!this.filter[this.tab];
  }

  /** "Rates last updated 1 Oct": the newest change to any profile. */
  get ratesUpdated(): string | null {
    const stamps = this.profiles.map((p) => p.updated_at).filter((s): s is string => !!s);
    return stamps.length ? stamps.reduce((a, b) => (a > b ? a : b)) : null;
  }

  get categories(): string[] {
    return [...new Set(this.profiles.map((p) => p.category).filter(Boolean))];
  }

  get hardwareGroups(): string[] {
    return [...new Set(this.hardware.map((h) => h.costhead).filter(Boolean))];
  }

  get hardwareCategories(): string[] {
    return [...new Set(this.hardware.map((h) => h.category).filter((c): c is string => !!c))];
  }

  get allItems(): ItemRow[] {
    return [...this.glass, ...this.hardware];
  }

  onSearch(text: string): void {
    this.search[this.tab] = text;
    this.page = 0;
  }

  onFilter(value: string): void {
    this.filter[this.tab] = value;
    this.page = 0;
  }

  clearFilters(): void {
    this.search[this.tab] = '';
    this.filter[this.tab] = '';
    this.page = 0;
  }

  trackById(_: number, row: { id: number }): number {
    return row.id;
  }

  // ---- rates edited in the row -------------------------------------------

  cell(id: number, field: string): CellStatus {
    return this.cells[`${this.tab}:${id}:${field}`] ?? { state: 'idle', error: '' };
  }

  saveProfileRate(profile: ProfileRow, field: 'rate_meter' | 'rate_meter_color', value: number): void {
    const key = `profile:${profile.id}:${field}`;
    this.cells[key] = { state: 'saving', error: '' };
    const next = { ...profile, ...withMetreRate(profile, field, value, this.factors) };
    this.adapter.saveProfile(next).subscribe({
      next: (saved) => {
        Object.assign(profile, saved);
        this.settle(key);
      },
      error: (err) => (this.cells[key] = { state: 'error', error: this.adapter.message(err, 'Not saved. Try again.') }),
    });
  }

  saveItemRate(item: ItemRow, value: number): void {
    const key = `${this.tab}:${item.id}:cost`;
    this.cells[key] = { state: 'saving', error: '' };
    this.adapter.saveItem({ ...item, cost: value }).subscribe({
      next: (saved) => {
        item.cost = saved.cost;
        this.settle(key);
      },
      error: (err) => (this.cells[key] = { state: 'error', error: this.adapter.message(err, 'Not saved. Try again.') }),
    });
  }

  // ---- dialogs -----------------------------------------------------------

  /** The page's one primary button: add to whichever tab is showing. */
  add(): void {
    this.edit(null);
  }

  edit(row: any | null): void {
    if (this.tab === 'profile') {
      this.editing.profile = row;
      this.profileOpen = true;
    } else if (this.tab === 'profile-color') {
      this.editing.colour = row;
      this.colourOpen = true;
    } else {
      this.editing.item = row;
      this.itemOpen = true;
    }
  }

  onProfileSaved(row: ProfileRow): void {
    this.profiles = this.upsert(this.profiles, row);
    this.toast.showSuccess(`${row.profile_name} saved`);
  }

  onColourSaved(row: ColourRow): void {
    this.toast.showSuccess(`${row.color_name} saved`);
    this.load('colours');
  }

  onItemSaved(row: ItemRow): void {
    if (isGlass(row)) {
      this.glass = this.upsert(this.glass, row);
      this.hardware = this.hardware.filter((h) => h.id !== row.id);
    } else {
      this.hardware = this.upsert(this.hardware, row);
    }
    this.toast.showSuccess(`${row.name} saved`);
  }

  onRatesUpdated(result: RatesUpdated): void {
    this.cells = {};
    if (result.all) {
      this.load('profiles');
    } else {
      result.rows.forEach((row) => (this.profiles = this.upsert(this.profiles, row)));
    }
    this.toast.showSuccess(`Rates updated for ${result.count} ${result.count === 1 ? 'profile' : 'profiles'}`);
  }

  askDelete(colour: ColourRow): void {
    this.deleting = colour;
    this.deleteError = '';
  }

  confirmDelete(): void {
    const colour = this.deleting;
    if (!colour || this.deleteBusy) {
      return;
    }
    this.deleteBusy = true;
    this.adapter.deleteColour(colour.id).subscribe({
      next: () => {
        this.deleteBusy = false;
        this.deleting = null;
        this.colours = this.colours.filter((c) => c.id !== colour.id);
        this.toast.showSuccess(`${colour.color_name} deleted`);
      },
      error: (err) => {
        this.deleteBusy = false;
        this.deleteError = this.adapter.message(err, 'The colour was not deleted. Try again.');
      },
    });
  }

  // ---- helpers -----------------------------------------------------------

  private all(tab: CatalogueTab): any[] {
    return tab === 'profile' ? this.profiles : tab === 'profile-color' ? this.colours : tab === 'glass' ? this.glass : this.hardware;
  }

  private haystack(row: any): string {
    const parts =
      this.tab === 'profile'
        ? [row.profile_name, row.profile_code, fixSpelling(row.category), usedAs(row)]
        : this.tab === 'profile-color'
        ? [row.color_name, row.color_code]
        : [row.name, row.description, fixSpelling(row.costhead), row.conditions];
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  private upsert<T extends { id: number }>(list: T[], row: T): T[] {
    return list.some((r) => r.id === row.id) ? list.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : [...list, row];
  }

  /** Shows the tick for a moment, then goes quiet. */
  private settle(key: string): void {
    this.cells[key] = { state: 'saved', error: '' };
    setTimeout(() => {
      if (this.cells[key]?.state === 'saved') {
        delete this.cells[key];
      }
    }, 2500);
  }
}
