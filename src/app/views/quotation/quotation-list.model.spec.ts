import {
  apiHasStatus,
  buildStatusTabs,
  defaultQuotationName,
  errorText,
  matchesSearch,
  readStatus,
  shortDate,
  toQuotationRow,
  toQuotationRows,
} from './quotation-list.model';

/** A row as the API returns it today, before the status and number migrations. */
const OLD_ROW = {
  id: 14,
  quatation_identity: '6ac2034603094',
  quatation_name: 'Al-Rashid Villa Windows',
  name: 'Ahmed Al-Rashid',
  phone: '9812345670',
  customer_id: 2,
  is_convert_bill: 0,
  grand_total: 25039.21,
  total: 29546,
  item_count: 3,
};

/** The same row once cards A1 and A3 are live. */
const NEW_ROW = { ...OLD_ROW, number: 'Q-0014', status: 'sent', updated_at: '2026-09-28T10:00:00.000000Z' };

describe('quotation list adapter', () => {
  it('shows a number, never the hash', () => {
    expect(toQuotationRow(OLD_ROW).number).toBe('No. 14');
    expect(toQuotationRow(NEW_ROW).number).toBe('Q-0014');
    expect(JSON.stringify(toQuotationRow(OLD_ROW))).not.toContain('6ac2034603094');
  });

  it('uses the customer-facing total, and the old grand total only without it', () => {
    expect(toQuotationRow(OLD_ROW).total).toBe(29546);
    expect(toQuotationRow({ ...OLD_ROW, total: undefined }).total).toBe(25039.21);
    expect(toQuotationRow({ id: 1 }).total).toBe(0);
  });

  it('reads the status, and falls back to draft or billed', () => {
    expect(readStatus(NEW_ROW)).toBe('sent');
    expect(readStatus({ status: 'expired' })).toBe('expired');
    expect(readStatus(OLD_ROW)).toBe('draft');
    expect(readStatus({ ...OLD_ROW, is_convert_bill: 1 })).toBe('billed');
    expect(readStatus({ status: 'something-new' })).toBe('draft');
  });

  it('knows whether the API reports statuses', () => {
    expect(apiHasStatus([OLD_ROW])).toBeFalse();
    expect(apiHasStatus([OLD_ROW, NEW_ROW])).toBeTrue();
    expect(apiHasStatus(null)).toBeFalse();
  });

  it('names a quotation that has no name after its customer', () => {
    expect(toQuotationRow({ id: 1, name: 'Test', quatation_name: null }).name).toBe('Test – windows');
    expect(toQuotationRow({ id: 1 }).name).toBe('Untitled quotation');
    expect(defaultQuotationName(' Anil Kulkarni ')).toBe('Anil Kulkarni – windows');
    expect(defaultQuotationName('')).toBe('');
  });

  it('keeps the window count unknown when the API does not send it', () => {
    expect(toQuotationRow(OLD_ROW).windows).toBe(3);
    expect(toQuotationRow({ id: 1 }).windows).toBeNull();
  });

  it('sorts newest first: by date when there is one, otherwise by id', () => {
    expect(toQuotationRows([{ id: 1 }, { id: 22 }, { id: 14 }]).map((r) => r.id)).toEqual([22, 14, 1]);
    const dated = toQuotationRows([
      { id: 1, updated_at: '2026-10-02T00:00:00Z' },
      { id: 2, updated_at: '2026-09-01T00:00:00Z' },
    ]);
    expect(dated.map((r) => r.id)).toEqual([1, 2]);
    expect(toQuotationRows(null)).toEqual([]);
  });

  it('builds the tabs with counts, and rare statuses only when present', () => {
    const rows = toQuotationRows([
      NEW_ROW,
      { ...NEW_ROW, id: 15, status: 'draft' },
      { ...NEW_ROW, id: 16, status: 'draft' },
      { ...NEW_ROW, id: 17, status: 'declined' },
    ]);
    expect(buildStatusTabs(rows).map((t) => `${t.label} ${t.count}`)).toEqual([
      'All 4',
      'Draft 2',
      'Sent 1',
      'Accepted 0',
      'Billed 0',
      'Declined 1',
    ]);
  });

  it('searches name, customer, number and phone', () => {
    const row = toQuotationRow(NEW_ROW);
    expect(matchesSearch(row, 'villa')).toBeTrue();
    expect(matchesSearch(row, 'AHMED')).toBeTrue();
    expect(matchesSearch(row, 'q-0014')).toBeTrue();
    expect(matchesSearch(row, '98123')).toBeTrue();
    expect(matchesSearch(row, '  ')).toBeTrue();
    expect(matchesSearch(row, 'sharma')).toBeFalse();
  });

  it('writes dates the short way', () => {
    const now = new Date(2026, 9, 4, 15, 0);
    expect(shortDate(new Date(2026, 9, 4, 1, 0), now)).toBe('Today');
    expect(shortDate(new Date(2026, 9, 3, 23, 0), now)).toBe('Yesterday');
    expect(shortDate(new Date(2026, 8, 28), now)).toBe('28 Sep');
    expect(shortDate(new Date(2025, 8, 3), now)).toBe('3 Sep 2025');
    expect(shortDate(null, now)).toBe('');
  });

  it('turns an error into a sentence', () => {
    expect(errorText({ error: { message: 'Invalid customer id' } }, 'x')).toBe('Invalid customer id');
    expect(errorText('phone field is required', 'x')).toBe('phone field is required');
    expect(errorText({ status: 0 }, 'Try again.')).toBe('Try again.');
  });
});
