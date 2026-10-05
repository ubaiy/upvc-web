import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, throwError } from 'rxjs';
import { createStructure, renameStructure } from '../../shared/structure-model';
import { STRUCTURE_STORE_KEY, StructureStore } from '../structure-designer/structure-store.service';
import { StructuresListComponent } from './structures-list.component';

describe('StructuresListComponent', () => {
  let fixture: ComponentFixture<StructuresListComponent>;
  let c: StructuresListComponent;
  let el: HTMLElement;
  let store: StructureStore;
  let kept: string | null;

  const text = (sel: string): string => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const names = (): string[] => Array.from(el.querySelectorAll('.sl-name')).map((n) => n.textContent ?? '');
  const add = (kind: string, name: string, thumbnail: string | null = null) =>
    firstValueFrom(store.save({ id: null, document: renameStructure(createStructure(kind), name), thumbnail }));

  async function make(): Promise<void> {
    fixture = TestBed.createComponent(StructuresListComponent);
    c = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    kept = localStorage.getItem(STRUCTURE_STORE_KEY);
    localStorage.removeItem(STRUCTURE_STORE_KEY);
    await TestBed.configureTestingModule({ imports: [StructuresListComponent], providers: [provideRouter([])] }).compileComponents();
    store = TestBed.inject(StructureStore);
  });

  afterEach(() => {
    fixture?.destroy();
    if (kept === null) localStorage.removeItem(STRUCTURE_STORE_KEY);
    else localStorage.setItem(STRUCTURE_STORE_KEY, kept);
  });

  it('with nothing saved shows the empty state with the one primary button', async () => {
    await make();
    expect(text('app-empty-state h2')).toBe('No structures yet');
    expect(el.querySelectorAll('.btn-primary').length).toBe(1);
    expect(el.querySelector('app-empty-state a')?.getAttribute('href')).toBe('/structure-designer');
    expect(el.querySelector('.sl-grid')).toBeNull();
    expect(text('.sl-device')).toContain('Structures are saved on this device for now.');
  });

  it('lists each saved structure with its name, type, overall size, date and picture', async () => {
    await add('dome', 'T114 Dome', 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==');
    await add('cabin', 'T114 Cabin');
    await make();
    expect(names()).toEqual(['T114 Cabin', 'T114 Dome']);
    const dome = el.querySelectorAll<HTMLElement>('.sl-card')[1];
    const facts = Array.from(dome.querySelectorAll('.sl-facts')).map((f) => f.textContent?.trim());
    expect(facts[0]).toBe('Dome');
    expect(facts[1]).toBe('3,000 × 3,000 × 1,000 mm');
    expect(facts[2]).toMatch(/^Saved \d+ \w+ \d{4}, \d\d:\d\d$/);
    expect(dome.querySelector('img')?.getAttribute('src')).toContain('data:image/gif');
    // No picture was saved for the cabin: an icon stands in, not a broken image.
    expect(el.querySelectorAll('.sl-card')[0].querySelector('img')).toBeNull();
    expect(Array.from(dome.querySelectorAll('.sl-actions .btn')).map((b) => b.textContent?.trim())).toEqual(['Open', 'Duplicate', 'Rename', 'Delete']);
    expect(dome.querySelector('.sl-open')?.getAttribute('href')).toBe(`/structure-designer?id=${dome.dataset['id']}`);
    // The primary button is in the header now, and only there.
    expect(el.querySelectorAll('.btn-primary').length).toBe(1);
    expect(text('.sl-device')).toContain('saved on this device for now');
  });

  it('duplicates a structure under a name the list does not have yet', async () => {
    await add('dome', 'T114 Dome');
    await make();
    el.querySelector<HTMLElement>('[data-action="duplicate"]')?.click();
    fixture.detectChanges();
    expect(names()).toEqual(['T114 Dome copy', 'T114 Dome']);
    el.querySelectorAll<HTMLElement>('[data-action="duplicate"]')[1].click();
    fixture.detectChanges();
    expect(names()).toEqual(['T114 Dome copy 2', 'T114 Dome copy', 'T114 Dome']);
    const rows = await firstValueFrom(store.list());
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
    expect((await firstValueFrom(store.get(rows[0].id))).document.name).toBe('T114 Dome copy 2');
  });

  it('renames in a dialog; an empty name is refused', async () => {
    const row = await add('bay', 'T114 Bay');
    await make();
    el.querySelector<HTMLElement>('[data-action="rename"]')?.click();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Rename structure');
    expect(c.nameDraft).toBe('T114 Bay');
    c.nameDraft = '   ';
    c.rename();
    fixture.detectChanges();
    expect(text('.sl-problem')).toBe('Give the structure a name.');
    c.nameDraft = ' T114 Bay, drawing room ';
    c.rename();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(names()).toEqual(['T114 Bay, drawing room']);
    const saved = await firstValueFrom(store.get(row.id));
    expect(saved.document.name).toBe('T114 Bay, drawing room');
  });

  it('deletes only after the confirmation', async () => {
    await add('dome', 'T114 Dome');
    await add('bay', 'T114 Bay');
    await make();
    el.querySelector<HTMLElement>('[data-action="delete"]')?.click();
    fixture.detectChanges();
    expect(text('.dialog h2')).toBe('Delete "T114 Bay"?');
    expect((await firstValueFrom(store.list())).length).toBe(2);
    // "Keep it" closes the dialog and deletes nothing.
    el.querySelector<HTMLElement>('.dialog .btn-secondary')?.click();
    fixture.detectChanges();
    expect(el.querySelector('.dialog')).toBeNull();
    expect(names()).toEqual(['T114 Bay', 'T114 Dome']);
    el.querySelector<HTMLElement>('[data-action="delete"]')?.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-action="confirm-delete"]')?.click();
    fixture.detectChanges();
    expect(names()).toEqual(['T114 Dome']);
    expect((await firstValueFrom(store.list())).map((r) => r.name)).toEqual(['T114 Dome']);
  });

  it('says so when the saved structures cannot be read, and tries again', async () => {
    const list = spyOn(store, 'list').and.returnValue(throwError(() => new Error('offline')));
    await make();
    expect(text('app-callout')).toContain('We could not read the saved structures.');
    expect(el.querySelector('.sl-grid')).toBeNull();
    list.and.callThrough();
    el.querySelector<HTMLElement>('app-callout button')?.click();
    fixture.detectChanges();
    expect(text('app-empty-state h2')).toBe('No structures yet');
  });

  it('keeps the dialog open with the reason when a delete fails', async () => {
    await add('dome', 'T114 Dome');
    await make();
    spyOn(store, 'delete').and.returnValue(throwError(() => new Error('Could not delete: the storage of this browser is blocked.')));
    c.askDelete(c.rows[0]);
    c.remove();
    fixture.detectChanges();
    expect(text('.sl-problem')).toContain('Could not delete');
    expect(names()).toEqual(['T114 Dome']);
  });
});
