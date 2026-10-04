import { CHALLAN_PAGE_WIDTH, DOCUMENT_PAGE_WIDTH, fitZoom, previewPage } from './document-file';

describe('document preview page', () => {
  const page = '<html><head><title>Receipt</title></head><body><p>RCT/26-27/0001</p></body></html>';

  it('leaves a sheet that fits its frame at full size', () => {
    expect(fitZoom(1000)).toBe(1);
    expect(fitZoom(DOCUMENT_PAGE_WIDTH)).toBe(1);
    expect(fitZoom(0)).toBe(1);
    const html = previewPage(page, { frameWidth: 1000 });
    expect(html).not.toContain('zoom');
    expect(html).toContain('<p>RCT/26-27/0001</p>');
  });

  it("scales the whole sheet down to a phone, at the sheet's own width", () => {
    // 346 px of frame, 16 px of it the scrollbar: 330 / 560.
    expect(fitZoom(346)).toBe(0.589);
    expect(fitZoom(346, CHALLAN_PAGE_WIDTH)).toBe(0.5);
    const html = previewPage(page, { frameWidth: 346 });
    expect(html).toContain('zoom: 0.589');
    expect(html).toContain('width: 560px');
    expect(html.indexOf('zoom')).toBeLessThan(html.indexOf('</head>'));
  });

  it('never scales below what can be read, and shows the real size when asked', () => {
    expect(fitZoom(120)).toBe(0.4);
    const html = previewPage(page, { frameWidth: 346, zoom: 1 });
    expect(html).toContain('zoom: 1;');
    expect(html).toContain('width: 560px');
  });

  it('adds the screen rules to a page without a head', () => {
    expect(previewPage('<p>bare</p>')).toContain('<p>bare</p>');
    expect(previewPage('<p>bare</p>')).toContain('@media screen');
  });
});
