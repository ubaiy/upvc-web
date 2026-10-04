import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SKIP_ERROR_TOAST, SKIP_LOADER } from '../../shared/interceptors/request-options';
import { environment } from '../../../environments/environment';
import { CatalogueAdapter } from './catalogue.adapter';

const API = environment.API_URL;

describe('CatalogueAdapter', () => {
  let adapter: CatalogueAdapter;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    adapter = TestBed.inject(CatalogueAdapter);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('deletes a colour, a profile and an item at the addresses of api.config', () => {
    const done: string[] = [];
    adapter.deleteColour(3).subscribe(() => done.push('colour'));
    adapter.deleteProfile(26).subscribe(() => done.push('profile'));
    adapter.deleteItem(55).subscribe(() => done.push('item'));
    for (const path of ['profile-color/delete/3', 'product/delete/26', 'costhead/delete/55']) {
      const call = http.expectOne(`${API}/${path}`);
      expect(call.request.method).toBe('POST');
      call.flush({ success: true, data: [], message: 'Deleted succesfully' });
    }
    expect(done).toEqual(['colour', 'profile', 'item']);
  });

  it('a delete tells the global toast to stay silent: the dialog shows the refusal once', () => {
    adapter.deleteColour(3).subscribe({ error: () => undefined });
    const call = http.expectOne(`${API}/profile-color/delete/3`);
    expect(call.request.context.get(SKIP_ERROR_TOAST)).toBeTrue();
    // The overlay stays, so a second tap on Delete cannot be sent.
    expect(call.request.context.get(SKIP_LOADER)).toBeFalse();
    call.flush({ status: 0, message: 'The default colour cannot be deleted.' });
  });

  it('hands the refusal of a colour in use to the screen, with the quotation numbers', () => {
    const refusal = 'This colour is used by 2 quotations (Q-0005, Q-0007) and cannot be deleted.';
    let said = '';
    adapter.deleteColour(4).subscribe({ error: (err) => (said = adapter.message(err)) });
    http
      .expectOne(`${API}/profile-color/delete/4`)
      .flush({ status: 0, message: refusal, data: { used_by: { count: 2, numbers: ['Q-0005', 'Q-0007'] } } });
    expect(said).toBe(refusal);
  });

  it('refuses the default colour in the api’s words', () => {
    let said = '';
    adapter.deleteColour(1).subscribe({ error: (err) => (said = adapter.message(err)) });
    http.expectOne(`${API}/profile-color/delete/1`).flush({ status: 0, message: 'The default colour cannot be deleted.' });
    expect(said).toBe('The default colour cannot be deleted.');
  });

  it('asks setting/change-rates for a preview with dry_run', () => {
    adapter.changeRates({ mode: 'percent', percent: 5, category: '' } as any, true).subscribe();
    const call = http.expectOne(`${API}/setting/change-rates`);
    expect(call.request.body).toEqual({ mode: 'percent', category: 'all', dry_run: true, percent: 5 });
    call.flush({ success: true, data: { count: 0, rows: [] } });
  });
});
