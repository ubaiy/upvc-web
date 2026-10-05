import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { createStructure, renameStructure, serializeStructure, summarize } from '../../shared/structure-model';
import { customerSheet, sheetFacts, SHEET_WIDTH } from './customer-sheet';
import { BrowserStructureStore, STRUCTURE_STORE_KEY, StructureStore } from './structure-store.service';

describe('StructureStore (saved in the browser)', () => {
  let store: StructureStore;
  let kept: string | null;
  const named = (kind: string, name: string) => renameStructure(createStructure(kind), name);
  const error = async (p: Promise<unknown>): Promise<string> => p.then(() => '', (e: Error) => e.message);

  beforeEach(() => {
    kept = localStorage.getItem(STRUCTURE_STORE_KEY);
    localStorage.removeItem(STRUCTURE_STORE_KEY);
    store = TestBed.inject(StructureStore);
  });

  afterEach(() => {
    if (kept === null) localStorage.removeItem(STRUCTURE_STORE_KEY);
    else localStorage.setItem(STRUCTURE_STORE_KEY, kept);
  });

  it('is the browser store until the api has structures', () => {
    expect(store instanceof BrowserStructureStore).toBeTrue();
  });

  it('starts empty', async () => {
    expect(await firstValueFrom(store.list())).toEqual([]);
  });

  it('saves a new structure and lists it without its document', async () => {
    const dome = named('dome', 'T114 Dome');
    const row = await firstValueFrom(store.save({ id: null, document: dome, thumbnail: 'data:image/jpeg;base64,AAAA' }));
    expect(row.id).toBeTruthy();
    expect(row.name).toBe('T114 Dome');
    expect(row.kind).toBe('dome');
    expect(row.overall).toEqual({ widthMm: 3000, depthMm: 3000, heightMm: 1000 });
    expect(row.thumbnail).toBe('data:image/jpeg;base64,AAAA');
    expect(Number.isNaN(Date.parse(row.savedAt))).toBeFalse();
    const rows = await firstValueFrom(store.list());
    expect(rows).toEqual([row]);
    expect(Object.keys(rows[0])).not.toContain('document');
  });

  it('gets the document back exactly as it was saved', async () => {
    const cabin = named('cabin', 'T114 Cabin');
    const row = await firstValueFrom(store.save({ id: null, document: cabin, thumbnail: null }));
    const saved = await firstValueFrom(store.get(row.id));
    expect(serializeStructure(saved.document)).toBe(serializeStructure(cabin));
    expect(saved.thumbnail).toBeNull();
    expect(saved.id).toBe(row.id);
  });

  it('saves over the entry with the same id, and puts the newest first', async () => {
    const a = await firstValueFrom(store.save({ id: null, document: named('dome', 'A'), thumbnail: null }));
    const b = await firstValueFrom(store.save({ id: null, document: named('bay', 'B'), thumbnail: null }));
    expect(a.id).not.toBe(b.id);
    expect((await firstValueFrom(store.list())).map((r) => r.name)).toEqual(['B', 'A']);
    await firstValueFrom(store.save({ id: a.id, document: named('dome', 'A again'), thumbnail: 'data:x' }));
    const rows = await firstValueFrom(store.list());
    expect(rows.map((r) => r.name)).toEqual(['A again', 'B']);
    expect(rows[0].id).toBe(a.id);
    expect(rows[0].thumbnail).toBe('data:x');
  });

  it('deletes one entry and leaves the others', async () => {
    const a = await firstValueFrom(store.save({ id: null, document: named('dome', 'A'), thumbnail: null }));
    await firstValueFrom(store.save({ id: null, document: named('bay', 'B'), thumbnail: null }));
    await firstValueFrom(store.delete(a.id));
    expect((await firstValueFrom(store.list())).map((r) => r.name)).toEqual(['B']);
    expect(await error(firstValueFrom(store.get(a.id)))).toContain('no longer saved on this device');
  });

  it('reads entries saved before the list existed: no size and no picture were kept then', async () => {
    const old = { id: 's1', name: 'Old dome', kind: 'dome', savedAt: '2026-10-01T10:00:00.000Z', document: named('dome', 'Old dome') };
    localStorage.setItem(STRUCTURE_STORE_KEY, JSON.stringify([old]));
    const rows = await firstValueFrom(store.list());
    expect(rows[0].overall).toEqual({ widthMm: 3000, depthMm: 3000, heightMm: 1000 });
    expect(rows[0].thumbnail).toBeNull();
    expect((await firstValueFrom(store.get('s1'))).document.name).toBe('Old dome');
  });

  it('refuses a stored document that is not a structure, and survives storage that is not a list', async () => {
    localStorage.setItem(STRUCTURE_STORE_KEY, JSON.stringify([{ id: 'bad', name: 'Bad', kind: 'dome', savedAt: '', document: { hello: 1 } }]));
    expect(await error(firstValueFrom(store.get('bad')))).toContain('can no longer be read');
    localStorage.setItem(STRUCTURE_STORE_KEY, '{not json');
    expect(await firstValueFrom(store.list())).toEqual([]);
  });

  it('says so when the browser refuses to store', async () => {
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');
    expect(await error(firstValueFrom(store.save({ id: null, document: named('dome', 'A'), thumbnail: null })))).toContain('Could not save');
  });
});

describe('customer sheet', () => {
  const dome = renameStructure(createStructure('dome'), 'Dome for Mr Shah');
  const facts = sheetFacts(dome, summarize(dome), 'Dome');

  it('carries the name, the overall size, the panels by type and the glass area, and no price', () => {
    expect(facts.name).toBe('Dome for Mr Shah');
    expect(facts.overall).toBe('3,000 × 3,000 × 1,000 mm');
    expect(facts.panels).toEqual([{ label: 'Fixed glass', count: 36 }]);
    expect(facts.panelCount).toBe(36);
    expect(facts.glassArea).toMatch(/^\d+\.\d\d m²$/);
    expect(JSON.stringify(facts)).not.toMatch(/₹|INR|price|rate|amount/i);
  });

  it('is one picture, 1600 px wide, taller with more panel types', async () => {
    const picture = document.createElement('canvas');
    picture.width = 400;
    picture.height = 300;
    const url = picture.toDataURL('image/png');
    const one = await customerSheet({ company: 'Hakimi Enterprise', picture: url, ...facts });
    expect(one.width).toBe(SHEET_WIDTH);
    expect(one.height).toBeGreaterThan(1500);
    const panels = ['Fixed glass', 'Casement (side-hung)', 'Top-hung vent', 'Sliding (2 leaves)', 'Door', 'Solid panel'].map((label) => ({ label, count: 2 }));
    const six = await customerSheet({ company: '', picture: url, ...facts, panels });
    expect(six.height).toBeGreaterThan(one.height);
    // Something was drawn: the sheet is not one flat colour.
    const data = one.getContext('2d')!.getImageData(0, 0, SHEET_WIDTH, 200).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 100) dark++;
    expect(dark).toBeGreaterThan(500);
  });
});
