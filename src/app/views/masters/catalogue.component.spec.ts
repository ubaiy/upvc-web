import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { ToastService } from '../../shared/services/toast.service';
import { UndoService } from '../../shared/services/undo.service';
import { CatalogueAdapter } from './catalogue.adapter';
import { CatalogueComponent } from './catalogue.component';
import { ColourRow, ItemRow, PriceFactors, ProfileRow } from './catalogue.model';
import { MastersModule } from './masters.module';

const FACTORS: PriceFactors = { per_kg: 190, rate_bar: 5.8, color_per_kg: 410, color_rate_bar: 5.8 };

const PROFILES: ProfileRow[] = [
  {
    id: 26, category: 'Casement', profile_code: 'P60-K-X-R', profile_name: 'Casment Outward Outer Frame',
    kg_meter: 1.01, kg_meter_color: 1.01, rate_meter: 191.9, rate_bar: 1113.02, rate_meter_color: 414.1,
    rate_bar_color: 2401.78, sub_category: 'Frame', updated_at: '2026-10-01T08:00:00.000000Z',
  },
  {
    id: 40, category: 'Slidding', profile_code: 'SL-2T', profile_name: 'Two track frame',
    kg_meter: 1.5, kg_meter_color: 1.5, rate_meter: 285, rate_bar: 1653, rate_meter_color: 615,
    rate_bar_color: 3567, sub_category: 'Frame', updated_at: '2026-09-20T08:00:00.000000Z',
  },
];
const COLOURS: ColourRow[] = [{ id: 1, color_name: 'Default', color_code: '#ffffff', is_default: 1 }];
const ITEMS: ItemRow[] = [
  { id: 1, name: '5mm plain glass', costhead: 'Glazzing', type: 'Glazzing', cost: 72, unit: 'Sq M' },
  { id: 67, name: 'Mechanical joint', costhead: 'Hardware', type: 'Hardware', cost: 8.26, unit: 'Unit', category: 'C/S' },
  { id: 70, name: 'Door handle', costhead: 'Handle', type: 'Handle', cost: 240, unit: 'Unit' },
];

describe('CatalogueComponent', () => {
  let fixture: ComponentFixture<CatalogueComponent>;
  let component: CatalogueComponent;
  let adapter: jasmine.SpyObj<CatalogueAdapter>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let el: HTMLElement;

  const text = (selector: string) => (el.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const all = (selector: string) => Array.from(el.querySelectorAll<HTMLElement>(selector));

  beforeEach(async () => {
    adapter = jasmine.createSpyObj<CatalogueAdapter>('CatalogueAdapter', [
      'profiles', 'colours', 'items', 'factors', 'systems', 'units', 'saveProfile', 'saveItem', 'deleteColour', 'deleteProfile', 'deleteItem', 'message',
    ]);
    adapter.profiles.and.callFake(() => of(PROFILES.map((p) => ({ ...p }))));
    adapter.colours.and.returnValue(of(COLOURS));
    adapter.items.and.callFake(() => of(ITEMS.map((i) => ({ ...i }))));
    adapter.factors.and.returnValue(of(FACTORS));
    adapter.systems.and.returnValue(of([{ id: 4, name: 'Alpha 60' }]));
    adapter.units.and.returnValue(of(['Sq M', 'Unit', 'Meter']));
    adapter.message.and.callFake((_err: unknown, fallback?: string) => fallback ?? 'failed');
    params = new BehaviorSubject(convertToParamMap({ tab: 'profile' }));

    await TestBed.configureTestingModule({
      imports: [MastersModule, RouterTestingModule, NoopAnimationsModule],
      providers: [
        { provide: CatalogueAdapter, useValue: adapter },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']) },
        { provide: ActivatedRoute, useValue: { paramMap: params, queryParamMap: of(convertToParamMap({})) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CatalogueComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('shows four tabs with their counts; hardware holds every group except glass', () => {
    expect(all('.tabs .tab').map((t) => t.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Profiles2', 'Colours1', 'Glass1', 'Hardware2',
    ]);
    expect(el.querySelector('.tab[aria-selected="true"]')?.textContent).toContain('Profiles');
  });

  it('has exactly one primary button, named for the tab', () => {
    expect(all('.btn-primary').length).toBe(1);
    expect(text('.btn-primary')).toBe('Add profile');
    params.next(convertToParamMap({ tab: 'glass' }));
    fixture.detectChanges();
    expect(all('.btn-primary').length).toBe(1);
    expect(text('.btn-primary')).toBe('Add glass');
    expect(el.textContent).not.toContain('Update rates');
  });

  it('corrects the spelling of categories and names, and shows rates in rupees', () => {
    const first = all('tbody tr')[0];
    expect(first.textContent).toContain('Casement Outward Outer Frame');
    expect(all('tbody tr')[1].textContent).toContain('Sliding');
    expect(el.textContent).not.toContain('Slidding');
    const rate = first.querySelector<HTMLInputElement>('app-rate-cell input');
    expect(rate?.value).toBe('₹191.90');
    expect(rate?.getAttribute('aria-label')).toBe('Rate per metre for Casment Outward Outer Frame');
    expect(text('.toolbar')).toContain('Rates last updated 1 Oct');
  });

  it('saves a rate typed in the row, with the bar rate kept in step', () => {
    adapter.saveProfile.and.callFake((p) => of(p));
    component.saveProfileRate(component.profiles[0], 'rate_meter', 200);
    const sent = adapter.saveProfile.calls.mostRecent().args[0];
    expect(sent.rate_meter).toBe(200);
    expect(sent.rate_bar).toBe(1160);
    expect(sent.rate_meter_color).toBe(414.1);
    expect(component.profiles[0].rate_meter).toBe(200);
    expect(component.cell(26, 'rate_meter').state).toBe('saved');
    // A save says so: the tick in the box is easy to miss.
    expect(TestBed.inject(ToastService).showSuccess).toHaveBeenCalledWith(jasmine.stringMatching(/: rate saved$/));
  });

  it('always shows Edit and Delete in a row, and the category under the name for a narrow screen', () => {
    const row = el.querySelector('tbody tr')!;
    expect(row.querySelector('.row-actions [aria-label^="Edit"]')).not.toBeNull();
    expect(row.querySelector('.under')?.textContent).toContain(text('tbody tr td.col-category'));
  });

  it('goes to the page of an item just added, and clears a search that hides it', () => {
    params.next(convertToParamMap({ tab: 'hardware' }));
    fixture.detectChanges();
    const many = Array.from({ length: 30 }, (_, i) => ({ ...component.hardware[0], id: 500 + i, name: 'Handle ' + i }));
    component.hardware = many;
    component.onSearch('Handle 1');
    component.onItemSaved({ ...many[0], id: 900, name: 'New stay arm' });
    expect(component.search.hardware).toBe('');
    expect(component.pageRows.some((row) => row.id === 900)).toBeTrue();
    expect(component.page).toBeGreaterThan(0);
  });

  it('warns about glass in the words of glass, not of hardware', () => {
    params.next(convertToParamMap({ tab: 'glass' }));
    fixture.detectChanges();
    component.askDelete(component.glass[0]);
    expect(component.deleteNote).toContain('can no longer be chosen for a window');
    expect(component.deleteNote).not.toContain('hardware');
    component.deleting = null;
    params.next(convertToParamMap({ tab: 'hardware' }));
    fixture.detectChanges();
    component.askDelete(component.hardware[0]);
    expect(component.deleteNote).toContain('Some hardware is added to every window');
    component.deleting = null;
  });

  it('keeps the old rate and says why when a row save fails', () => {
    adapter.saveProfile.and.returnValue(throwError(() => new Error('no')));
    component.saveProfileRate(component.profiles[0], 'rate_meter', 200);
    expect(component.profiles[0].rate_meter).toBe(191.9);
    expect(component.cell(26, 'rate_meter')).toEqual({ state: 'error', error: 'Not saved. Try again.' });
  });

  it('filters by search and by category, and offers to clear when nothing matches', () => {
    component.onFilter('Slidding');
    fixture.detectChanges();
    expect(all('tbody tr').length).toBe(1);
    component.onSearch('nothing like this');
    fixture.detectChanges();
    expect(all('tbody tr').length).toBe(0);
    expect(el.textContent).toContain('No profiles match');
    all('button').find((b) => b.textContent?.includes('Clear search'))?.click();
    fixture.detectChanges();
    expect(all('tbody tr').length).toBe(2);
  });

  it('shows an inline error with "Try again" when a list fails, and recovers', () => {
    adapter.profiles.and.returnValue(throwError(() => new Error('down')));
    component.load('profiles');
    fixture.detectChanges();
    expect(text('[role="alert"]')).toContain('The profiles could not be loaded');
    expect(el.querySelector('table')).toBeNull();

    adapter.profiles.and.returnValue(of(PROFILES));
    all('button').find((b) => b.textContent?.includes('Try again'))?.click();
    fixture.detectChanges();
    expect(all('tbody tr').length).toBe(2);
  });

  it('shows an empty state when a tab has nothing in it', () => {
    adapter.profiles.and.returnValue(of([]));
    component.load('profiles');
    fixture.detectChanges();
    expect(el.textContent).toContain('No profiles yet');
    expect(all('.btn-primary').length).toBe(1);
  });

  it('locks the standard colour and saves a hardware rate', fakeAsync(() => {
    params.next(convertToParamMap({ tab: 'profile-color' }));
    fixture.detectChanges();
    expect(text('tbody tr')).toContain('Cannot be changed');
    expect(el.querySelector('tbody [aria-label^="Delete"]')).toBeNull();

    params.next(convertToParamMap({ tab: 'hardware' }));
    fixture.detectChanges();
    expect(all('tbody tr').map((r) => r.querySelector('.title')?.textContent)).toEqual(['Mechanical joint', 'Door handle']);
    expect(all('tbody tr')[0].textContent).toContain('Casement and sliding');
    adapter.saveItem.and.callFake((i) => of(i as ItemRow));
    component.saveItemRate(component.hardware[0], 9);
    expect(adapter.saveItem.calls.mostRecent().args[0].cost).toBe(9);
    expect(component.hardware[0].cost).toBe(9);
    tick(3000);
    expect(component.cell(67, 'cost').state).toBe('idle');
  }));

  it('deletes a profile at once with "Undo" on offer, and asks the api only when the toast has gone', () => {
    const undo = TestBed.inject(UndoService);
    adapter.deleteProfile.and.returnValue(of(undefined));
    el.querySelector<HTMLElement>('tbody [aria-label^="Delete"]')?.click();
    fixture.detectChanges();
    expect(component.deleting).toBeNull();
    expect(component.profiles.map((p) => p.id)).toEqual([PROFILES[1].id]);
    expect(undo.offer$.value?.message).toContain('deleted');
    expect(adapter.deleteProfile).not.toHaveBeenCalled();
    undo.flush();
    expect(adapter.deleteProfile).toHaveBeenCalledOnceWith(PROFILES[0].id);
    expect(component.profiles.map((p) => p.id)).toEqual([PROFILES[1].id]);
  });

  it('"Undo" puts the profile back in its place and nothing is sent', () => {
    const undo = TestBed.inject(UndoService);
    component.askDelete(component.profiles[0]);
    undo.undo();
    expect(component.profiles.map((p) => p.id)).toEqual(PROFILES.map((p) => p.id));
    expect(adapter.deleteProfile).not.toHaveBeenCalled();
  });

  it('brings a colour back and says why when the api refuses the delete', () => {
    const undo = TestBed.inject(UndoService);
    const toast = TestBed.inject(ToastService) as jasmine.SpyObj<ToastService>;
    const refusal = 'This colour is used by 2 quotations (Q-0005, Q-0007) and cannot be deleted.';
    adapter.deleteColour.and.returnValue(throwError(() => new Error(refusal)));
    adapter.message.and.callFake((err: unknown) => (err as Error).message);
    params.next(convertToParamMap({ tab: 'profile-color' }));
    fixture.detectChanges();
    const before = component.colours.map((c) => c.id);
    const row = component.colours[component.colours.length - 1];
    component.askDelete(row);
    expect(component.colours.length).toBe(before.length - 1);
    undo.flush();
    expect(adapter.deleteColour).toHaveBeenCalledOnceWith(row.id);
    expect(component.colours.map((c) => c.id)).toEqual(before);
    expect(toast.showError).toHaveBeenCalledOnceWith(refusal);
  });

  it('keeps the row and shows the quotations that use it when the API refuses the delete', () => {
    const refusal = 'This item is used by 2 quotations (Q-0005, Q-0007) and cannot be deleted.';
    adapter.deleteItem.and.returnValue(throwError(() => new Error(refusal)));
    adapter.message.and.callFake((err: unknown) => (err as Error).message);
    params.next(convertToParamMap({ tab: 'hardware' }));
    fixture.detectChanges();
    const before = component.hardware.length;
    component.askDelete(component.hardware[0]);
    component.confirmDelete();
    fixture.detectChanges();
    expect(adapter.deleteItem).toHaveBeenCalledOnceWith(component.hardware[0].id);
    expect(component.hardware.length).toBe(before);
    expect(component.deleteError).toBe(refusal);
    expect(document.body.textContent).toContain('Q-0005, Q-0007');
  });
});
