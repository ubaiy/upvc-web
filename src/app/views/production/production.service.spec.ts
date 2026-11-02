import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { SKIP_ERROR_TOAST, SKIP_LOADER } from '../../shared/interceptors/request-options';
import { BAR_PLAN, JOB } from './production.adapter.spec';
import { ProductionService } from './production.service';

const API = environment.API_URL;

describe('ProductionService', () => {
  let service: ProductionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(ProductionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the newest job quietly: no global overlay, no global toast', () => {
    let kind = '';
    service.getJob(14).subscribe((result) => (kind = result.kind));
    const req = http.expectOne(`${API}/production/job/14`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SKIP_LOADER)).toBeTrue();
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBeTrue();
    req.flush({ success: true, data: JOB, message: 'ok' });
    expect(kind).toBe('job');
  });

  it('asks for an older revision by number', () => {
    let revision = 0;
    service.getJob(14, 2).subscribe((result) => (revision = result.kind === 'job' ? result.job.revision : 0));
    http.expectOne(`${API}/production/job/14?revision=2`).flush({ success: true, data: { ...JOB, revision: 2 } });
    expect(revision).toBe(2);
  });

  it('turns "no job yet" into its own answer, not an error', () => {
    let kind = '';
    service.getJob(14).subscribe((result) => (kind = result.kind));
    http
      .expectOne(`${API}/production/job/14`)
      .flush({ status: 0, message: 'This quatation has no production job yet; create one first' });
    expect(kind).toBe('no-job');
  });

  it('freezes with an empty body and refreshes with refresh: true', () => {
    service.freeze(14).subscribe();
    const first = http.expectOne(`${API}/production/job/14`);
    expect(first.request.method).toBe('POST');
    expect(first.request.body).toEqual({});
    first.flush({ success: true, data: JOB });

    service.freeze(14, true).subscribe();
    const second = http.expectOne(`${API}/production/job/14`);
    expect(second.request.body).toEqual({ refresh: true });
    second.flush({ success: true, data: { ...JOB, revision: 2 } });
  });

  it('fetches a document of the shown revision as a file, with the name the api sent', async () => {
    const done = new Promise<any>((resolve, reject) =>
      service.getDocument(14, 'cutting-list', 'pdf', 1, true).subscribe({ next: resolve, error: reject })
    );
    const req = http.expectOne((r) => r.url === `${API}/production/document/14/cutting-list`);
    expect(req.request.params.get('format')).toBe('pdf');
    expect(req.request.params.get('revision')).toBe('1');
    expect(req.request.params.has('download')).toBeTrue();
    expect(req.request.responseType).toBe('blob');
    expect(req.request.context.get(SKIP_LOADER)).toBeTrue();
    req.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), {
      headers: { 'Content-Disposition': 'attachment; filename="Cutting-list-Q-0003-P1.pdf"' },
    });
    const file = await done;
    expect(file.fileName).toBe('Cutting-list-Q-0003-P1.pdf');
    expect(file.blob.type).toBe('application/pdf');
  });

  it('asks for the preview as html, inline', async () => {
    const done = new Promise<any>((resolve, reject) =>
      service.getDocument(14, 'sheet', 'html', 3).subscribe({ next: resolve, error: reject })
    );
    const req = http.expectOne((r) => r.url === `${API}/production/document/14/sheet`);
    expect(req.request.params.get('format')).toBe('html');
    expect(req.request.params.get('revision')).toBe('3');
    expect(req.request.params.has('download')).toBeFalse();
    req.flush(new Blob(['<html></html>'], { type: 'text/html' }));
    const file = await done;
    expect(file.fileName).toBeNull();
    expect(file.blob.type).toContain('text/html');
  });

  it('reports a JSON refusal as an error with the reason the api gave', async () => {
    const done = new Promise<Error>((resolve) =>
      service
        .getDocument(14, 'pack', 'pdf', 1, true)
        .subscribe({ next: () => resolve(new Error('no error')), error: resolve })
    );
    const refusal = JSON.stringify({ status: 0, message: 'This quatation has no production job with that revision' });
    http
      .expectOne((r) => r.url === `${API}/production/document/14/pack`)
      .flush(new Blob([refusal], { type: 'application/json' }));
    expect((await done).message).toBe('This quatation has no production job with that revision');
  });

  it('asks for the bar plan document like any other', async () => {
    const done = new Promise<any>((resolve, reject) =>
      service.getDocument(14, 'bar-plan', 'pdf', 2, true).subscribe({ next: resolve, error: reject })
    );
    const req = http.expectOne((r) => r.url === `${API}/production/document/14/bar-plan`);
    expect(req.request.params.get('revision')).toBe('2');
    req.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), {
      headers: { 'Content-Disposition': 'attachment; filename="Bar-plan-Q-0003-P2.pdf"' },
    });
    expect((await done).fileName).toBe('Bar-plan-Q-0003-P2.pdf');
  });

  it('hands the job over with the bar plan the api sent, and without one from an older api', () => {
    const plans: (unknown)[] = [];
    service.getJob(14).subscribe((result) => plans.push(result.kind === 'job' ? result.job.bar_plan : 'not a job'));
    http.expectOne(`${API}/production/job/14`).flush({ success: true, data: { ...JOB, bar_plan: BAR_PLAN } });
    service.getJob(14).subscribe((result) => plans.push(result.kind === 'job' ? result.job.bar_plan : 'not a job'));
    http.expectOne(`${API}/production/job/14`).flush({ success: true, data: JOB });
    expect(plans).toEqual([BAR_PLAN, undefined]);
  });

  describe('bar settings', () => {
    const SETTINGS = { bar_mm: 6000, blade_mm: 5.7, end_trim_mm: 25, min_offcut_mm: 400 };
    const DEFAULTS = { bar_mm: 5800, blade_mm: 6, end_trim_mm: 20, min_offcut_mm: 500 };

    it('reads the settings and the standard values, quietly', () => {
      let got: any;
      service.getBarSettings().subscribe((answer) => (got = answer));
      const req = http.expectOne(`${API}/production/bar-settings`);
      expect(req.request.method).toBe('GET');
      expect(req.request.context.get(SKIP_LOADER)).toBeTrue();
      expect(req.request.context.get(SKIP_ERROR_TOAST)).toBeTrue();
      req.flush({ success: true, data: { settings: SETTINGS, defaults: DEFAULTS } });
      expect(got).toEqual({ settings: SETTINGS, defaults: DEFAULTS });
    });

    it('saves the four numbers with one POST and answers what GET answers', () => {
      let got: any;
      service.saveBarSettings(SETTINGS).subscribe((answer) => (got = answer));
      const req = http.expectOne(`${API}/production/bar-settings`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(SETTINGS);
      expect(req.request.context.get(SKIP_LOADER)).toBeTrue();
      expect(req.request.context.get(SKIP_ERROR_TOAST)).toBeTrue();
      req.flush({ success: true, data: { settings: SETTINGS, defaults: DEFAULTS } });
      expect(got.settings).toEqual(SETTINGS);
    });

    it("turns the api's 422 into an error with its sentence", () => {
      let error: Error | undefined;
      service.saveBarSettings({ ...SETTINGS, bar_mm: 100 }).subscribe({ error: (e) => (error = e) });
      http.expectOne(`${API}/production/bar-settings`).flush(
        { success: false, status: 0, code: 'validation_failed', message: 'The bar length must be 500 to 20000 mm.', data: { errors: ['The bar length must be 500 to 20000 mm.'] } },
        { status: 422, statusText: 'Unprocessable Entity' }
      );
      expect(error?.message).toBe('The bar length must be 500 to 20000 mm.');
    });

    it('says the connection is down when nothing answers, and when an answer has no settings', () => {
      const errors: string[] = [];
      service.getBarSettings().subscribe({ error: (e) => errors.push(e.message) });
      http.expectOne(`${API}/production/bar-settings`).error(new ProgressEvent('error'), { status: 0 });
      service.getBarSettings().subscribe({ error: (e) => errors.push(e.message) });
      http.expectOne(`${API}/production/bar-settings`).flush({ success: true, data: {} });
      expect(errors).toEqual(['We could not reach the server. Check your connection.', 'The bar settings could not be loaded.']);
    });
  });

  it('reports an empty answer as an error', async () => {
    const done = new Promise<Error>((resolve) =>
      service
        .getDocument(14, 'glass-order', 'xlsx', 1, true)
        .subscribe({ next: () => resolve(new Error('no error')), error: resolve })
    );
    http.expectOne((r) => r.url === `${API}/production/document/14/glass-order`).flush(new Blob([]));
    expect((await done).message).toBe('The document came back empty.');
  });
});
