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

  it('a profile is saved with its profile system, how it is bought and its bar only when the row carries them (T187)', () => {
    const row = { id: 26, category: 'Casement', profile_code: 'A', profile_name: 'Frame', kg_meter: 1, kg_meter_color: 1, rate_meter: 0, rate_bar: 0, rate_meter_color: 0, rate_bar_color: 0 };
    adapter.saveProfile(row as any).subscribe();
    const plain = http.expectOne(`${API}/product/update/26`);
    expect(Object.keys(plain.request.body)).not.toContain('profile_system_id');
    plain.flush({ success: true, data: row });

    adapter.saveProfile({ ...row, profile_system_id: 4, charge_basis: undefined, bar_length_mm: 5800 } as any).subscribe();
    const placed = http.expectOne(`${API}/product/update/26`);
    expect(placed.request.body).toEqual(jasmine.objectContaining({ profile_system_id: 4, charge_basis: null, bar_length_mm: 5800 }));
    placed.flush({ success: true, data: row });
  });

  it('offers the profile systems in use, and reads one profile with empty colour figures as the list shows them', () => {
    let systems: unknown;
    adapter.systems().subscribe((rows) => (systems = rows.map((r) => r.name)));
    http.expectOne(`${API}/profile-system/list`).flush({ success: true, data: [{ id: 4, name: 'Alpha 60', retired_at: null }, { id: 9, name: 'Old 50', retired_at: '2026-10-01 10:00:00' }] });
    expect(systems).toEqual(['Alpha 60']);

    let profile: any;
    adapter.profile(31).subscribe((row) => (profile = row));
    http.expectOne(`${API}/product/31`).flush({ success: true, data: { id: 31, kg_meter: '1.043', kg_meter_color: null, rate_meter: '0', rate_bar: '0', rate_meter_color: null, rate_bar_color: null } });
    expect([profile.kg_meter, profile.kg_meter_color, profile.rate_meter_color]).toEqual([1.043, 1.043, 0]);
  });
});
