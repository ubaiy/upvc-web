import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { downloadedFile, fileNameFromHeader } from './download-file';

describe('download-file', () => {
  it('reads the file name the api sent, quoted, plain or encoded', () => {
    expect(fileNameFromHeader('attachment; filename=Quotation-Q-0003-Ahmed-Al-Rashid.pdf')).toBe(
      'Quotation-Q-0003-Ahmed-Al-Rashid.pdf'
    );
    expect(fileNameFromHeader('attachment; filename="Bill-INV-26-27-0001-Sharma-Residency.pdf"')).toBe(
      'Bill-INV-26-27-0001-Sharma-Residency.pdf'
    );
    expect(fileNameFromHeader("attachment; filename*=UTF-8''Delivery%20challan.pdf")).toBe('Delivery challan.pdf');
    expect(fileNameFromHeader('inline')).toBeNull();
    expect(fileNameFromHeader(null)).toBeNull();
  });

  it('pairs the body of a download with its name', () => {
    const body = new Blob(['pdf'], { type: 'application/pdf' });
    const named = downloadedFile(
      new HttpResponse({ body, headers: new HttpHeaders({ 'Content-Disposition': 'attachment; filename="Receipt-RCT-1.pdf"' }) })
    );
    expect(named.blob).toBe(body);
    expect(named.fileName).toBe('Receipt-RCT-1.pdf');
    expect(downloadedFile(new HttpResponse({ body })).fileName).toBeNull();
  });
});
