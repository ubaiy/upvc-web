import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from 'src/environments/environment';
import { DownloadedFile } from 'src/app/shared/class/download-file';
import { QuotationService } from './quotation.service';

const API = environment.API_URL;

describe('QuotationService', () => {
  let service: QuotationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(QuotationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('downloads the quotation PDF under the file name the api sent', () => {
    let file: DownloadedFile | undefined;
    service.getQuotationPdf(14).subscribe((f) => (file = f));
    const call = http.expectOne(`${API}/quatation/pdf`);
    expect(call.request.body).toEqual({ quatation_id: 14, download: 1 });
    call.flush(new Blob(['pdf'], { type: 'application/pdf' }), {
      headers: { 'Content-Disposition': 'attachment; filename=Quotation-Q-0003-Ahmed-Al-Rashid.pdf' },
    });
    expect(file?.fileName).toBe('Quotation-Q-0003-Ahmed-Al-Rashid.pdf');
    expect(file?.blob.size).toBe(3);
  });

  it('downloads the bill PDF the same way, and says so when the api sent no name', () => {
    let file: DownloadedFile | undefined;
    service.getBillPdf(2).subscribe((f) => (file = f));
    const call = http.expectOne(`${API}/bill/pdf`);
    expect(call.request.body).toEqual({ bill_id: 2, download: 1 });
    call.flush(new Blob(['pdf']));
    expect(file?.fileName).toBeNull();
  });

  it('takes every flow address from api.config', () => {
    service.copyQuotation(14, {}).subscribe();
    service.changeQuotationStatus(14, 'sent').subscribe();
    service.saveQuotationSummary(14, {}).subscribe();
    service.duplicateLine(51).subscribe();
    service.renameLine(51, 'Hall').subscribe();
    service.reviseQuotation(14).subscribe();
    service.sendQuotation(14, { channel: 'download' }).subscribe();
    service.getStatusCounts().subscribe();
    for (const path of [
      'quatation/copy/14',
      'quatation/status/14',
      'quatation/summary/14',
      'quatation/product/duplicate/51',
      'quatation/product/details/51',
      'quatation/revise/14',
      'quatation/send/14',
      'quatation/status-counts',
    ]) {
      http.expectOne(`${API}/${path}`).flush({ success: true, data: {} });
    }
  });
});
