import { billsOf, matchesBill, toBillRow, toBillRows } from './bills.adapter';

const QUOTATIONS = [
  { id: 17, quatation_identity: '6ac205d330246', quatation_name: 'Sharma Flat Renovation' },
  { id: 18, quatation_identity: 'zzz', quatation_name: 'Other' },
];

describe('bills adapter', () => {
  it('reads what bill/list sends today and links the bill to its quotation by identity', () => {
    const row = toBillRow(
      { id: 2, quatation_identity: '6ac205d330246', grand_total: 14159.58, customer_id: 3, name: 'Sharma Residency' },
      QUOTATIONS
    );
    expect(row).toEqual({
      id: 2,
      number: 'Bill 2',
      hasNumber: false,
      date: null,
      customerId: 3,
      customer: 'Sharma Residency',
      quotationId: 17,
      quotation: 'Sharma Flat Renovation',
      amount: 14159.58,
      cancelled: false,
    });
  });

  it('uses the number, date, total and status once the API sends them', () => {
    const row = toBillRow(
      {
        id: 5,
        bill_number: 'INV/26-27/0042',
        bill_date: '2026-10-04',
        total: 16708,
        grand_total: 14159.58,
        quatation_id: 18,
        status: 'cancelled',
        customer_details: '{"name":"Amit Mehta"}',
      },
      QUOTATIONS
    );
    expect(row.number).toBe('INV/26-27/0042');
    expect(row.hasNumber).toBeTrue();
    expect(row.date).toBe('2026-10-04');
    expect(row.amount).toBe(16708);
    expect(row.quotationId).toBe(18);
    expect(row.customer).toBe('Amit Mehta');
    expect(row.cancelled).toBeTrue();
  });

  it('shows the identity, with no link, when the quotation is not found', () => {
    const row = toBillRow({ id: 7, quatation_identity: 'gone', grand_total: 1, customer_details: 'not json' });
    expect(row.quotationId).toBeNull();
    expect(row.quotation).toBe('gone');
    expect(row.customer).toBe('');
  });

  it('filters by customer and by search text', () => {
    const rows = toBillRows(
      [
        { id: 1, customer_id: 3, name: 'Sharma Residency', quatation_identity: '6ac205d330246' },
        { id: 2, customer_id: 4, name: 'Modern Homes LLP', quatation_identity: 'zzz' },
      ],
      QUOTATIONS
    );
    expect(billsOf(3, rows).map((row) => row.id)).toEqual([1]);
    expect(rows.filter((row) => matchesBill(row, 'modern')).map((row) => row.id)).toEqual([2]);
    expect(rows.filter((row) => matchesBill(row, 'renovation')).map((row) => row.id)).toEqual([1]);
    expect(rows.filter((row) => matchesBill(row, '  ')).length).toBe(2);
  });
});
