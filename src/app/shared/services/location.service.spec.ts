import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SKIP_ERROR_TOAST, SKIP_LOADER } from '../interceptors/request-options';
import { ApiHttpService } from './api-http.service';
import { CityOption, LocationService, PinLookup } from './location.service';

describe('LocationService', () => {
  let service: LocationService;
  let http: HttpTestingController;
  let base: string;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(LocationService);
    http = TestBed.inject(HttpTestingController);
    base = TestBed.inject(ApiHttpService).REST_API_SERVER;
  });

  afterEach(() => http.verify());

  it('reads a PIN from location/pincode/{pin}, quietly, and asks once per PIN', () => {
    let found: PinLookup | null | undefined;
    service.lookupPin('395007').subscribe((result) => (found = result));
    const request = http.expectOne(`${base}/location/pincode/395007`);
    expect(request.request.context.get(SKIP_LOADER)).toBeTrue();
    expect(request.request.context.get(SKIP_ERROR_TOAST)).toBeTrue();
    request.flush({
      data: { pincode: '395007', city: 'Surat', district: 'Surat', state_code: 24, state_name: 'Gujarat', localities: ['Adajan', '', 'Athwa/Piplod / Umra', 'adajan'] },
    });
    expect(found).toEqual({
      pincode: '395007',
      city: 'Surat',
      district: 'Surat',
      stateCode: '24',
      stateName: 'Gujarat',
      localities: ['Adajan', 'Athwa', 'Piplod', 'Umra'],
    });

    let again: PinLookup | null | undefined;
    service.lookupPin('395007').subscribe((result) => (again = result));
    expect(again).toEqual(found as PinLookup);
  });

  it('answers null for a PIN the directory does not have (404), and remembers it', () => {
    let found: PinLookup | null | undefined;
    service.lookupPin('999999').subscribe((result) => (found = result));
    http.expectOne(`${base}/location/pincode/999999`).flush({ message: 'PIN code not found.' }, { status: 404, statusText: 'Not Found' });
    expect(found).toBeNull();
    service.lookupPin('999999').subscribe();
  });

  it('passes any other failure on, and asks again the next time', () => {
    let failed = false;
    service.lookupPin('395007').subscribe({ error: () => (failed = true) });
    http.expectOne(`${base}/location/pincode/395007`).flush(null, { status: 429, statusText: 'Too Many Requests' });
    expect(failed).toBeTrue();
    service.lookupPin('395007').subscribe();
    http.expectOne(`${base}/location/pincode/395007`).flush({ data: { pincode: '395007', city: 'Surat' } });
  });

  it('asks for the cities of a state by the text typed', () => {
    let cities: CityOption[] = [];
    service.cities('24', 'sur').subscribe((result) => (cities = result));
    http
      .expectOne(`${base}/location/cities?state_code=24&q=sur&limit=20`)
      .flush({ data: [{ city: 'Surat', district: 'Surat', state_code: '24', pincodes: ['395001', 395007] }, { city: '' }] });
    expect(cities).toEqual([{ city: 'Surat', district: 'Surat', stateCode: '24', pincodes: ['395001', '395007'] }]);

    service.cities('', 'new delhi').subscribe();
    http.expectOne(`${base}/location/cities?q=new%20delhi&limit=20`).flush({ data: null });
  });
});
