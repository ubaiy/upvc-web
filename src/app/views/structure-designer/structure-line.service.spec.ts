import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { createStructure, summarize } from '../../shared/structure-model';
import { environment } from '../../../environments/environment';
import { plainRefusal, StructureApiError, StructureLineService, StructurePrice } from './structure-line.service';
import { ApiStructureStore, StructureStore } from './structure-store.service';

const API = environment.API_URL;

/** The price of the api contract's example (card T122). */
export const SAMPLE_PRICE: StructurePrice = {
  pricing_method: 'structure_catalogue_v1',
  pricing_version: 1,
  quantity: 1,
  rows: [
    { kind: 'window', name: 'Fixed window 675 × 2400', face_ids: ['front-1', 'front-2', 'front-3', 'front-4'], count: 4, unit_cost: 5580, qty: 4, unit: 'pc', rate: 5580, amount: 22320 },
    { kind: 'glass', name: '6mm bronze glass', qty: 12.4, unit: 'sq ft', rate: 120, amount: 1488 },
    { kind: 'bar', role: 'eave', name: 'Eave beam', qty: 38.4, unit: 'm', rate: 450, amount: 17280 },
    { kind: 'hub', role: 'crown', qty: 1, unit: 'pc', rate: 2500, amount: 2500 },
    { kind: 'wastage', qty: 5, unit: 'percent', amount: 1980 },
  ],
  totals: { material: 48600, wastage: 1980, labour: 8008.2, overhead: 5858.82, installation: 5338.8, cost: 61234.5 },
  computed_unit_price: 61234.5,
  unit_price: 61234.5,
  price_is_manual: false,
  total: 61234.5,
  area_sq_ft: 133.47,
  margin_percent: 20,
  amount: 73481.4,
  rate_per_sq_ft: 550.55,
};

const REFUSAL = 'structure_catalogue_v1 cannot price this structure: Choose what the solid panels are made of.';

describe('StructureLineService (a structure as a line of a quotation)', () => {
  let service: StructureLineService;
  let http: HttpTestingController;
  const cabin = createStructure('cabin');
  const summary = summarize(cabin);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(StructureLineService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('prices a structure without saving it: the summary goes as it is, the answer comes back as it is', () => {
    let got: StructurePrice | undefined;
    service.price({ quatation_id: 12, structure_type: 'cabin', quantity: 1, unit_price: null, summary }).subscribe((p) => (got = p));
    const req = http.expectOne(`${API}/quatation/structure/price`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ quatation_id: 12, structure_type: 'cabin', quantity: 1, unit_price: null, summary });
    req.flush({ success: true, data: SAMPLE_PRICE, message: '' });
    expect(got).toEqual(SAMPLE_PRICE);
  });

  it('a refusal is an error with the api sentence, whether it comes as 200 success:false (the live api) or as 422', () => {
    const errors: StructureApiError[] = [];
    const ask = () => service.price({ structure_type: 'gable', quantity: 1, summary }).subscribe({ error: (e) => errors.push(e) });
    ask();
    http.expectOne(`${API}/quatation/structure/price`).flush({ success: false, data: null, message: REFUSAL, missing: 'solid_panel' });
    ask();
    http.expectOne(`${API}/quatation/structure/price`).flush({ success: false, message: REFUSAL, data: { missing: 'bar.rafter' } }, { status: 422, statusText: 'Unprocessable' });
    ask();
    http.expectOne(`${API}/quatation/structure/price`).flush({ success: false, message: 'The windows do not name every panel.' }, { status: 422, statusText: 'Unprocessable' });
    expect(errors.map((e) => [e.message, e.refused, e.missing])).toEqual([
      [REFUSAL, true, 'solid_panel'],
      [REFUSAL, true, 'bar.rafter'],
      ['The windows do not name every panel.', true, ''],
    ]);
  });

  it('no answer, a server error and a missing route are failures, not refusals, and show no api internals', () => {
    const errors: StructureApiError[] = [];
    const ask = () => service.price({ structure_type: 'cabin', quantity: 1, summary }).subscribe({ error: (e) => errors.push(e) });
    ask();
    http.expectOne(`${API}/quatation/structure/price`).error(new ProgressEvent('error'));
    ask();
    http.expectOne(`${API}/quatation/structure/price`).flush({ message: 'SQLSTATE[HY000]' }, { status: 500, statusText: 'Server Error' });
    ask();
    http.expectOne(`${API}/quatation/structure/price`).flush({ message: 'The route api/v1/quatation/structure/price could not be found.' }, { status: 404, statusText: 'Not Found' });
    expect(errors.every((e) => !e.refused)).toBeTrue();
    expect(errors.map((e) => e.message).join(' ')).not.toMatch(/SQLSTATE|route/);
  });

  it('reads, adds, updates and deletes a line at the addresses of the contract', () => {
    service.get(77).subscribe();
    expect(http.expectOne(`${API}/quatation/structure/77`).request.method).toBe('GET');
    service.add({ quatation_id: 12, name: 'Balcony cabin', structure_type: 'cabin', quantity: 1, document: cabin, summary }).subscribe();
    expect(http.expectOne(`${API}/quatation/structure/add`).request.method).toBe('POST');
    service.update(77, { unit_price: null }).subscribe();
    const update = http.expectOne(`${API}/quatation/structure/update/77`);
    expect(update.request.body).withContext('null goes back to the computed price').toEqual({ unit_price: null });
    service.remove(77).subscribe();
    expect(http.expectOne(`${API}/quatation/structure/delete/77`).request.method).toBe('POST');
  });

  it('the store of saved structures is the api now: the id is the id of the quotation line', () => {
    const store = TestBed.inject(StructureStore);
    expect(store instanceof ApiStructureStore).toBeTrue();
    let saved: any;
    store.save({ id: null, document: cabin, thumbnail: 'data:image/png;base64,AAAA', quotationId: 12, quantity: 2, unitPrice: null, windows: [], glass: '5mm plain glass' }).subscribe((row) => (saved = row));
    const add = http.expectOne(`${API}/quatation/structure/add`);
    expect(add.request.body).toEqual({
      quatation_id: 12,
      name: cabin.name,
      structure_type: 'cabin',
      quantity: 2,
      unit_price: null,
      image: 'data:image/png;base64,AAAA',
      document: cabin,
      summary,
      windows: [],
      glass: '5mm plain glass',
    });
    add.flush({ success: true, data: { id: 77, quantity: 2, image: null, structure: { type: 'cabin', name: cabin.name, overall: summary.overall, costing: { price_is_manual: false, unit_price: 61234.5 } } } });
    expect(saved).toEqual(jasmine.objectContaining({ id: '77', kind: 'cabin', quantity: 2, manualPrice: null }));

    let refused = '';
    store.save({ id: null, document: cabin, thumbnail: null }).subscribe({ error: (e: Error) => (refused = e.message) });
    expect(refused).withContext('a structure lives in a quotation').toContain('line of a quotation');
  });

  it('says a refusal in plain words, without the name of the pricing method', () => {
    expect(plainRefusal(REFUSAL)).toBe('Choose what the solid panels are made of.');
    expect(plainRefusal('structure_catalogue_v1 cannot price this structure: the summary is not consistent.')).toBe('The summary is not consistent.');
    expect(plainRefusal('Choose the glass.')).toBe('Choose the glass.');
  });

  it('sends the windows and the document with the price, and with a saved line', () => {
    const windows = [{ face_ids: ['front-1', 'front-2'], body: { quatation_id: 12 } as any }];
    service.price({ quatation_id: 12, structure_type: 'cabin', quantity: 1, document: cabin, windows, summary }).subscribe();
    const price = http.expectOne(`${API}/quatation/structure/price`);
    expect(price.request.body.windows).toEqual(windows);
    expect(price.request.body.document).toEqual(cabin);
    expect(price.request.body.glass).withContext('no glass rate any more').toBeUndefined();
    price.flush({ success: true, data: SAMPLE_PRICE });
    service.update(77, { document: cabin, windows, summary }).subscribe();
    expect(http.expectOne(`${API}/quatation/structure/update/77`).request.body.windows).toEqual(windows);
  });

  it('has no call for structure rates any more', () => {
    expect((service as unknown as Record<string, unknown>)['rates']).toBeUndefined();
    expect((service as unknown as Record<string, unknown>)['saveRates']).toBeUndefined();
  });
});
