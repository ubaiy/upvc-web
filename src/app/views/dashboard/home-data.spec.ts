import { IDashboardModelDto } from 'src/app/shared/model/dashboard.model';
import {
  ATTENTION_LIMIT,
  HomeQuotationRow,
  buildHomeView,
  greeting,
  hasStatus,
  relativeDay,
  toHomeQuotation,
} from './home-data';

const TODAY = new Date(2026, 9, 4, 10, 0); // Sunday 4 October 2026

const FIGURES: IDashboardModelDto = {
  total_customer: 4,
  total_quatation: 9,
  total_quatation_product: 25,
  total_revenue_quatation: 231390.33,
  total_revenue_quatation_current_month: 214729.92,
  total_revenue_quatation_converted_to_bill: 14159.58,
  total_revenue_quatation_converted_to_bill_current_month: 14159.58,
};

/** Rows as the API sends them today: no status, no dates. */
const TODAY_ROWS: HomeQuotationRow[] = [
  { id: 12, quatation_name: null, name: 'Test', grand_total: 16660.41, total: 19659, item_count: 2, is_convert_bill: 0 },
  { id: 14, quatation_name: 'Al-Rashid Villa Windows', name: 'Ahmed Al-Rashid', grand_total: 25039.21, total: 29546, item_count: 3, is_convert_bill: 0 },
  { id: 15, quatation_name: 'Sharma Flat Renovation', name: 'Sharma Residency', grand_total: 14159.58, is_convert_bill: 1 },
];

/** Rows as cards A1 and A3 will send them. */
const STATUS_ROWS: HomeQuotationRow[] = [
  { id: 1, quatation_name: 'Mehta Villa Windows', name: 'Amit Mehta', status: 'sent', total: 29546.27, sent_at: '2026-09-28T09:00:00', created_at: '2026-09-27T09:00:00', updated_at: '2026-09-28T09:00:00' },
  { id: 2, quatation_name: 'Modern Homes — Block C', name: 'Modern Homes LLP', status: 'accepted', total: 16660.41, accepted_at: '2026-10-03T12:00:00', created_at: '2026-10-01T09:00:00', updated_at: '2026-10-03T12:00:00' },
  { id: 3, quatation_name: 'Kulkarni Bungalow', name: 'S. Kulkarni', status: 'draft', total: 9813.29, item_count: 2, created_at: '2026-10-01T09:00:00', updated_at: '2026-10-01T15:00:00' },
  { id: 4, quatation_name: 'Sharma Flat Renovation', name: 'Sharma Residency', status: 'billed', total: 14159.58, created_at: '2026-10-02T09:00:00', updated_at: '2026-10-02T09:00:00' },
  { id: 5, quatation_name: 'Fresh quote', name: 'New Customer', status: 'sent', total: 5000, sent_at: '2026-10-03T09:00:00', created_at: '2026-10-03T09:00:00', updated_at: '2026-10-03T09:00:00' },
  { id: 6, quatation_name: 'Lost job', name: 'Someone', status: 'declined', total: 7000, created_at: '2026-09-10T09:00:00', updated_at: '2026-09-12T09:00:00' },
];

describe('home data adapter', () => {
  describe('with the API as it is today (no status, no dates)', () => {
    const view = buildHomeView(FIGURES, TODAY_ROWS, TODAY);

    it('treats a row without status as draft, or billed when it became a bill', () => {
      expect(hasStatus(TODAY_ROWS)).toBeFalse();
      expect(toHomeQuotation(TODAY_ROWS[0], TODAY).status).toBe('draft');
      expect(toHomeQuotation(TODAY_ROWS[2], TODAY).status).toBe('billed');
    });

    it('shows drafts only under "Needs your attention"', () => {
      expect(view.attention.map((item) => item.kind)).toEqual(['draft', 'draft']);
      expect(view.attention[0].quotation.id).toBe(14);
      expect(view.attention[0].detail).toBe('3 windows · Ahmed Al-Rashid');
      expect(view.attention[0].action).toBe('Continue');
    });

    it('uses the total the API sends, falling back to grand_total', () => {
      expect(view.recent.find((quotation) => quotation.id === 14)?.amount).toBe(29546);
      expect(view.recent.find((quotation) => quotation.id === 15)?.amount).toBe(14159.58);
    });

    it('names a quotation that has no name after its customer', () => {
      expect(toHomeQuotation(TODAY_ROWS[0], TODAY).title).toBe('Quotation for Test');
    });

    it('lists recent quotations newest first by id', () => {
      expect(view.recent.map((quotation) => quotation.id)).toEqual([15, 14, 12]);
    });

    it('takes the month figures from the dashboard endpoint and shows open quotations in the middle', () => {
      expect(view.stats.map((stat) => stat.label)).toEqual(['Quoted this month', 'Open quotations', 'Billed this month']);
      expect(view.stats[0].amount).toBe(214729.92);
      expect(view.stats[1].amount).toBe(19659 + 29546);
      expect(view.stats[1].detail).toBe('2 not yet billed');
      expect(view.stats[2].amount).toBe(14159.58);
    });
  });

  describe('with status and dates (cards A1 and A3)', () => {
    const view = buildHomeView(FIGURES, STATUS_ROWS, TODAY);

    it('orders attention: accepted, then follow-ups, then drafts', () => {
      expect(view.attention.map((item) => [item.kind, item.quotation.id])).toEqual([
        ['accepted', 2],
        ['follow-up', 1],
        ['draft', 3],
      ]);
    });

    it('describes each row in plain words', () => {
      expect(view.attention[0].detail).toBe('Accepted yesterday · ready to bill');
      expect(view.attention[0].action).toBe('Create bill');
      expect(view.attention[1].detail).toBe('Sent 6 days ago · Amit Mehta');
      expect(view.attention[2].detail).toBe('2 windows · last edited 3 days ago · S. Kulkarni');
    });

    it('leaves a quotation sent yesterday alone', () => {
      expect(view.attention.some((item) => item.quotation.id === 5)).toBeFalse();
    });

    it('asks for a follow-up at once when validity has ended', () => {
      const rows: HomeQuotationRow[] = [
        { id: 9, name: 'A', status: 'sent', sent_at: '2026-10-03T09:00:00', valid_until: '2026-10-03' },
        { id: 10, name: 'B', status: 'expired' },
      ];
      const expired = buildHomeView(FIGURES, rows, TODAY).attention;
      expect(expired.map((item) => item.kind)).toEqual(['follow-up', 'follow-up']);
      expect(expired[1].detail).toBe('Sent yesterday · validity has ended · A');
    });

    it('adds up this month from the row totals and counts what waits for the customer', () => {
      expect(view.stats[0]).toEqual({ label: 'Quoted this month', amount: 16660.41 + 9813.29 + 14159.58 + 5000, detail: '4 quotations' });
      expect(view.stats[1]).toEqual({ label: 'Waiting for customer', amount: 29546.27 + 5000, detail: '2 sent, not yet accepted' });
    });

    it('lists recent quotations by last edit', () => {
      expect(view.recent.map((quotation) => quotation.id)).toEqual([2, 5, 4, 3, 1]);
    });
  });

  it('shows the month figures and counts the API sends, and adds nothing up itself', () => {
    const figures = { ...FIGURES, quatation_count_current_month: 8, bill_count_current_month: 1 };
    const rows: HomeQuotationRow[] = [{ id: 1, name: 'A', total: 999, created_at: TODAY.toISOString() }];
    const stats = buildHomeView(figures, rows, TODAY).stats;
    expect(stats[0]).toEqual({ label: 'Quoted this month', amount: 214729.92, detail: '8 quotations' });
    expect(stats[2]).toEqual({ label: 'Billed this month', amount: 14159.58, detail: '1 bill' });
  });

  it('caps the attention list and counts the rest', () => {
    const rows: HomeQuotationRow[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: 'C' }));
    const view = buildHomeView(FIGURES, rows, TODAY);
    expect(view.attention.length).toBe(ATTENTION_LIMIT);
    expect(view.attentionMore).toBe(3);
  });

  it('reports an empty account and survives missing data', () => {
    const view = buildHomeView(null, null, TODAY);
    expect(view.empty).toBeTrue();
    expect(view.attention).toEqual([]);
    expect(view.stats.map((stat) => stat.amount)).toEqual([0, 0, 0]);
    expect(view.stats[1].label).toBe('Waiting for customer');
  });

  it('words days and greetings', () => {
    expect(relativeDay(new Date(2026, 9, 4, 1), TODAY)).toBe('today');
    expect(relativeDay(new Date(2026, 9, 3, 23), TODAY)).toBe('yesterday');
    expect(relativeDay(new Date(2026, 7, 1), TODAY)).toBe('1 Aug');
    expect(greeting(new Date(2026, 9, 4, 9))).toBe('Good morning');
    expect(greeting(new Date(2026, 9, 4, 13))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 9, 4, 19))).toBe('Good evening');
  });
});
