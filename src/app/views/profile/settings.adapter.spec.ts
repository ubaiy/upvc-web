import { of } from 'rxjs';

import { DOCUMENT_FIELDS, SETTINGS_API, SettingsAdapter, SettingsRefusal, errorText, readableMessage, toSnapshot, unwrap } from './settings.adapter';
import { seriesExample } from './settings.model';
import { CompanySettings, normaliseGstin, stateCodeFromGstin } from './settings.model';

const API_ROW = {
  id: 1,
  name: 'Hakimi Enterprise',
  address: 'Ukardi Road, Dahod',
  email: 'sales@example.in',
  phone: '9510957900',
  phone_no2: '9879852980',
  main_logo: 'http://api/logo.png',
  gstin: '24ABCDE1234F1Z5',
  state_code: '24',
  state_name: 'Gujarat',
  gst_registration_type: 'regular',
  default_gst_rate: 18,
  default_hsn_code: '39252000',
  prices_include_gst: false,
  terms_text: 'Delivery in 21 days',
  bank_account_name: 'Hakimi Enterprise',
  bank_name: 'State Bank of India, Dahod',
  bank_account_number: '123456789012',
  bank_ifsc: 'SBIN0001234',
  upi_id: 'hakimi@upi',
  signatory_name: 'Mustafa Parawala',
  quotation_number_prefix: 'HE/',
  quotation_validity_days: 15,
};

describe('SettingsAdapter', () => {
  let api: { get: jasmine.Spy; post: jasmine.Spy };
  let adapter: SettingsAdapter;

  beforeEach(() => {
    api = { get: jasmine.createSpy('get'), post: jasmine.createSpy('post') };
    adapter = new SettingsAdapter(api as any);
  });

  it('maps the API row to the three settings groups', () => {
    const snapshot = toSnapshot(API_ROW);
    expect(snapshot.company.name).toBe('Hakimi Enterprise');
    expect(snapshot.company.phone2).toBe('9879852980');
    expect(snapshot.company.stateCode).toBe('24');
    expect(snapshot.tax).toEqual({ gstRate: 18, hsnCode: '39252000', pricesIncludeGst: false });
    expect(snapshot.documentsStored).toBeTrue();
    expect(snapshot.documents.numberPrefix).toBe('HE/');
    expect(snapshot.documents.validityDays).toBe(15);
    expect(snapshot.documents.bankAccountName).toBe('Hakimi Enterprise');
  });

  it('fills safe defaults for a company that has set nothing', () => {
    const snapshot = toSnapshot({ name: 'New Co', phone: '9000000001', phone_no2: '9000000001', gst_registration_type: null });
    expect(snapshot.company.registrationType).toBe('regular');
    expect(snapshot.company.phone2).toBe('');
    expect(snapshot.tax.gstRate).toBe(18);
    expect(snapshot.documentsStored).toBeFalse();
    expect(snapshot.documents.numberPrefix).toBe('Q-');
    expect(snapshot.documents.validityDays).toBe(30);
  });

  it('treats an HTTP 200 refusal as an error and words it for people', () => {
    expect(() => unwrap({ status: 0, message: 'state_code does not match the state in the GSTIN' })).toThrowError(
      'State does not match the state in the GSTIN'
    );
    expect(readableMessage('gstin is not a valid GSTIN')).toBe('GSTIN is not a valid GSTIN');
    expect(errorText({ status: 0 })).toContain('could not reach the server');
  });

  it('loads through company/settings', (done) => {
    api.get.and.returnValue(of({ success: true, data: API_ROW }));
    adapter.load().subscribe((snapshot) => {
      expect(api.get).toHaveBeenCalledWith(SETTINGS_API.settings);
      expect(snapshot.company.gstin).toBe('24ABCDE1234F1Z5');
      done();
    });
  });

  it('saves the company in two calls: identity, then the GST fields', (done) => {
    api.post.and.returnValue(of({ success: true, data: API_ROW }));
    const company: CompanySettings = {
      ...toSnapshot(API_ROW).company,
      gstin: ' 24abcde1234f1z5 ',
      phone2: '',
    };
    adapter.saveCompany(company).subscribe(() => {
      const [identityUrl, form] = api.post.calls.argsFor(0);
      expect(identityUrl).toBe(SETTINGS_API.identity);
      expect((form as FormData).get('name')).toBe('Hakimi Enterprise');
      // No second number: the field is left out and the API stores none.
      expect((form as FormData).has('phone_no2')).toBeFalse();
      expect((form as FormData).has('main_logo')).toBeFalse();
      expect(api.post.calls.argsFor(1)).toEqual([
        SETTINGS_API.settings,
        { gst_registration_type: 'regular', gstin: '24ABCDE1234F1Z5', state_code: '24' },
      ]);
      done();
    });
  });

  it('sends no GSTIN for a company that is not registered', (done) => {
    api.post.and.returnValue(of({ success: true, data: API_ROW }));
    adapter.saveCompany({ ...toSnapshot(API_ROW).company, registrationType: 'unregistered' }).subscribe(() => {
      expect(api.post.calls.argsFor(1)[1].gstin).toBeNull();
      done();
    });
  });

  it('stops at the first refusal', (done) => {
    api.post.and.returnValue(of({ status: 0, message: 'email field is required' }));
    adapter.saveCompany(toSnapshot(API_ROW).company).subscribe({
      error: (err) => {
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(err.message).toBe('Email field is required');
        done();
      },
    });
  });

  it('saves the document fields under the API names', (done) => {
    api.post.and.returnValue(of({ success: true, data: API_ROW }));
    adapter.saveDocuments(toSnapshot(API_ROW).documents, true).subscribe(() => {
      const [url, body] = api.post.calls.mostRecent().args;
      expect(url).toBe(SETTINGS_API.settings);
      expect(Object.keys(body).sort()).toEqual(Object.values(DOCUMENT_FIELDS).sort());
      expect(body.quotation_number_prefix).toBe('HE/');
      expect(body.quotation_validity_days).toBe(15);
      done();
    });
  });

  it('refuses to save document fields the API cannot keep', (done) => {
    adapter.saveDocuments(toSnapshot({}).documents, false).subscribe({
      error: () => {
        expect(api.post).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('fetches the state list once', () => {
    api.get.and.returnValue(of({ success: true, data: [{ code: '24', name: 'Gujarat' }] }));
    adapter.states().subscribe();
    adapter.states().subscribe();
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});

describe('GSTIN helpers', () => {
  it('normalise and read the state', () => {
    expect(normaliseGstin(' 24abcde1234f1z5 ')).toBe('24ABCDE1234F1Z5');
    expect(normaliseGstin('')).toBeNull();
    expect(stateCodeFromGstin('27ABCDE1234F1Z5')).toBe('27');
    expect(stateCodeFromGstin('27ABC')).toBeNull();
  });

  it('reads the number series in a fixed order and builds the next number as the api prints it', () => {
    const snapshot = toSnapshot({
      number_series: {
        receipt: { label: 'Receipt', prefix: 'RCT', next: 13, last_used: 12, min_next: 13, example: 'RCT/26-27/0013', yearly: true, financial_year: '26-27' },
        quotation: { label: 'Quotation', prefix: 'Q-', next: 17, last_used: 16, min_next: 17, example: 'Q-0017', yearly: false, financial_year: null },
      },
    });
    expect(snapshot.numberSeries.map((series) => series.key)).toEqual(['quotation', 'receipt']);
    expect(snapshot.numberSeries[1].minNext).toBe(13);
    expect(seriesExample(snapshot.numberSeries[1], 'RC', 251)).toBe('RC/26-27/0251');
    expect(seriesExample(snapshot.numberSeries[0], 'Q-', 17)).toBe('Q-0017');
    expect(toSnapshot({}).numberSeries).toEqual([]);
  });

  it('keeps what the api sent beside a refusal, for the field it belongs to', () => {
    try {
      unwrap({ status: 0, message: 'gstin is required', data: { errors: { gstin: 'gstin is required for a Regular GST registration.' } } });
      fail('unwrap should throw');
    } catch (err) {
      expect(err instanceof SettingsRefusal).toBeTrue();
      expect((err as SettingsRefusal).fieldError('gstin')).toBe('GSTIN is required for a Regular GST registration.');
      expect((err as SettingsRefusal).fieldError('state_code')).toBe('');
    }
  });
});
