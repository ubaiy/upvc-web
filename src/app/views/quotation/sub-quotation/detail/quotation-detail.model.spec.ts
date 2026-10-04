import { pdfFileName, primaryAction, readDate, readSpec, toQuotationView } from './quotation-detail.model';
import { sampleQuotation } from './quotation-detail.testing';

describe('quotation-detail.model', () => {
  it('reads the number, the customer and the address stored as JSON text', () => {
    const view = toQuotationView(sampleQuotation());
    expect(view.number).toBe('Q-0003');
    expect(view.name).toBe('Al-Rashid Villa Windows');
    expect(view.customer.name).toBe('Ahmed Al-Rashid');
    expect(view.customer.initials).toBe('AA');
    expect(view.customer.address).toBe('Villa 14, Palm Street, Godhra, Gujarat, 389001');
  });

  it('never shows the hash: without a number it falls back to "No. <id>"', () => {
    const view = toQuotationView(sampleQuotation({ number: null }));
    expect(view.number).toBe('No. 14');
  });

  it('takes the total and every summary line from the API, in the order of the PDF', () => {
    const view = toQuotationView(sampleQuotation());
    expect(view.total).toBe(20730);
    expect(view.summary).toEqual([
      { label: 'Subtotal', amount: 17567.81 },
      { label: 'CGST 9%', amount: 1581.1 },
      { label: 'SGST 9%', amount: 1581.1 },
      { label: 'Round off', amount: -0.01 },
    ]);
  });

  it('shows IGST as the API returns it for a customer in another state', () => {
    const raw = sampleQuotation();
    raw.totals.tax.lines = [{ code: 'IGST', rate: 18, label: 'IGST 18%', amount: 3162.21 }];
    const labels = toQuotationView(raw).summary.map((line) => line.label);
    expect(labels).toEqual(['Subtotal', 'IGST 18%', 'Round off']);
  });

  it('says whose state is missing when the API had to assume the place of supply (M5)', () => {
    const raw = sampleQuotation();
    expect(toQuotationView(raw).stateMissing).toBeNull();
    raw.totals.tax.place_of_supply_assumed = true;
    raw.totals.tax.seller_state_code = null;
    expect(toQuotationView(raw).stateMissing).withContext('no company state').toBe('company');
    raw.totals.tax.seller_state_code = '24';
    expect(toQuotationView(raw).stateMissing).withContext('company state known').toBe('customer');
    raw.totals.tax.applicable = false;
    expect(toQuotationView(raw).stateMissing).withContext('no tax, no sentence').toBeNull();
  });

  it('prints charges where the PDF does: taxed ones above the taxable value, the others under the tax (M9)', () => {
    const raw = sampleQuotation();
    raw.totals.discount = { type: 'percent', value: 5, amount: 878.39 };
    raw.totals.charges = [
      { id: 4, kind: 'transport', label: 'Transport', amount: 1500, taxable: true, hsn_code: null },
      { id: 5, kind: 'other', label: 'Unloading', amount: 400, taxable: false, hsn_code: null },
    ];
    raw.totals.taxable_value = 18189.42;
    raw.charges = raw.totals.charges;
    const view = toQuotationView(raw);
    expect(view.summary.map((line) => line.label)).toEqual([
      'Subtotal',
      'Discount 5%',
      'Transport',
      'Taxable value',
      'CGST 9%',
      'SGST 9%',
      'Unloading (not taxed)',
      'Round off',
    ]);
    expect(view.summary[2].amount).toBe(1500);
    expect(view.summary[3].amount).toBe(18189.42);
    expect(view.charges.map((c) => [c.kind, c.label, c.amount, c.taxable])).toEqual([
      ['transport', 'Transport', 1500, true],
      ['other', 'Unloading', 400, false],
    ]);
  });

  it('has no charge line and no charge on a quotation without any', () => {
    const view = toQuotationView(sampleQuotation());
    expect(view.charges).toEqual([]);
    expect(view.summary.map((line) => line.label)).toEqual(['Subtotal', 'CGST 9%', 'SGST 9%', 'Round off']);
  });

  it('shows the discount and the taxable value only when a discount applies', () => {
    const raw = sampleQuotation();
    raw.totals.discount = { type: 'percent', value: 5, amount: 878.39 };
    raw.totals.taxable_value = 16689.42;
    const summary = toQuotationView(raw).summary;
    expect(summary[1]).toEqual({ label: 'Discount 5%', amount: -878.39 });
    expect(summary[2]).toEqual({ label: 'Taxable value', amount: 16689.42 });
  });

  it('prices each line at the selling amount, margin included, not at cost', () => {
    const [first, second] = toQuotationView(sampleQuotation()).lines;
    expect(first.amount).toBe(8851.86);
    expect(first.ratePerSqFt).toBe(380.72);
    expect(first.name).toBe('Master bedroom');
    expect(first.description).toBe('Casement · 1800 × 1200 mm · 5mm plain glass');
    expect(first.image).toBe('data:image/png;base64,AAAA');
    expect(second.name).toBe('Window 2');
    expect(second.quantity).toBe(2);
    expect(second.position).toBe(2);
    expect(second.image).toBeNull();
  });

  it('draws a thumbnail from the stored request when there is no saved image', () => {
    const raw = sampleQuotation();
    expect(readSpec(raw.quatation_product[0]).cols).toEqual([
      { f: 0.5, t: 'L' },
      { f: 0.5, t: 'fixed' },
    ]);
    expect(readSpec(raw.quatation_product[1])).toEqual({ w: 1200, h: 1500, cols: [{ f: 1, t: 'fixed' }] });
  });

  it('opens against an API without totals, on the cost figures', () => {
    const view = toQuotationView(sampleQuotation({ totals: undefined, status: undefined }));
    expect(view.status).toBe('draft');
    expect(view.total).toBe(25039.21);
    expect(view.summary).toEqual([]);
    expect(view.lines[0].amount).toBe(7376.55);
  });

  it('reads margin, terms, advance and validity for the Summary card', () => {
    const view = toQuotationView(sampleQuotation());
    expect(view.marginText).toBe('Retail margin 20%');
    expect(view.termsText).toBe('50% Advance, 50% on Delivery');
    expect(view.advance).toEqual({ percent: 50, amount: 10365 });
    expect(view.validUntilIso).toBe('2026-11-03');
    expect(view.validUntil?.getDate()).toBe(3);
  });

  it('keeps a plain date on its own day', () => {
    expect(readDate('2026-11-03')?.getDate()).toBe(3);
    expect(readDate('')).toBeNull();
    expect(readDate('not a date')).toBeNull();
  });

  describe('primary button', () => {
    const action = (overrides: any) => primaryAction(toQuotationView(sampleQuotation(overrides)));

    it('follows the status: send, accept, create bill, download bill', () => {
      expect(action({ status: 'draft' })).toBe('send');
      expect(action({ status: 'sent' })).toBe('accept');
      expect(action({ status: 'expired' })).toBe('accept');
      expect(action({ status: 'accepted' })).toBe('bill');
      expect(action({ status: 'declined' })).toBe('revise');
      expect(action({ status: 'billed', bill: { id: 3, number: 'INV/26-27/0002', total: 20730 } })).toBe('bill-pdf');
    });

    it('is left to the empty state for a draft with no window', () => {
      expect(action({ status: 'draft', quatation_product: [] })).toBeNull();
    });

    it('points an earlier version at the current one', () => {
      const view = toQuotationView(
        sampleQuotation({
          status: 'sent',
          superseded_by_id: 31,
          revisions: [
            { id: 14, number: 'Q-0003', status: 'sent', is_current: false },
            { id: 31, number: 'Q-0003 R1', status: 'draft', is_current: true },
          ],
        })
      );
      expect(primaryAction(view)).toBe('open-current');
      expect(view.supersededBy).toEqual({ id: 31, number: 'Q-0003 R1' });
      expect(view.editable).toBeFalse();
      expect(view.revisable).toBeFalse();
    });
  });

  it('edits a draft in place and sends everything else through a revision', () => {
    expect(toQuotationView(sampleQuotation({ status: 'draft' })).editable).toBeTrue();
    const sent = toQuotationView(sampleQuotation({ status: 'sent', revision_no: 1 }));
    expect(sent.editable).toBeFalse();
    expect(sent.revisable).toBeTrue();
    expect(sent.nextRevision).toBe('R2');
    const billed = toQuotationView(sampleQuotation({ status: 'billed' }));
    expect(billed.editable || billed.revisable).toBeFalse();
  });

  it('names the PDF after the number and the customer', () => {
    expect(pdfFileName(toQuotationView(sampleQuotation({ number: 'Q-0003 R1' })))).toBe(
      'Quotation-Q-0003-R1-Ahmed-Al-Rashid.pdf'
    );
  });
});
