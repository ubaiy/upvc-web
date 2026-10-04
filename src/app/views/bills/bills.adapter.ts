/**
 * Adapter between the bills list and the API as it is today.
 *
 * bill/list sends the quotation's identity, the customer and the amount. It
 * does not send a bill number, a date, a status or the quotation's id yet.
 * This file reads those fields where the API will put them and falls back
 * to what exists, so the screen does not change when they arrive.
 */

export interface BillRow {
  id: number;
  /** INV/26-27/0042 once the API numbers bills; "Bill 12" until then. */
  number: string;
  hasNumber: boolean;
  date: string | null;
  customerId: number | null;
  customer: string;
  quotationId: number | null;
  quotation: string;
  /** Q-0005, shown under the quotation's name. */
  quotationNumber: string;
  amount: number;
  cancelled: boolean;
}

function customerName(dto: any): string {
  if (dto.name) {
    return dto.name;
  }
  try {
    return JSON.parse(dto.customer_details || '{}').name || '';
  } catch {
    return '';
  }
}

/**
 * @param quotations quatation/list?status=all. It links the bill to the
 * quotation it came from (by identity until the bill carries the id) and
 * supplies the amount: a bill freezes its quotation's totals, and bill/list
 * only sends grand_total, which is the cost sum, not what the customer pays.
 */
export function toBillRow(dto: any, quotations: any[] = []): BillRow {
  const source =
    quotations.find((quotation) => dto.quatation_id != null && quotation.id === dto.quatation_id) ||
    quotations.find(
      (quotation) => !!dto.quatation_identity && quotation.quatation_identity === dto.quatation_identity
    );
  const number = dto.bill_number || dto.number || '';
  return {
    id: dto.id,
    number: number || `Bill ${dto.id}`,
    hasNumber: !!number,
    date: dto.bill_date || dto.created_at || null,
    customerId: dto.customer_id ?? null,
    customer: customerName(dto),
    quotationId: source?.id ?? dto.quatation_id ?? null,
    quotation: source?.quatation_name || dto.quatation_name || source?.number || dto.quatation_identity || '',
    quotationNumber: source?.number || '',
    amount: Number(dto.total ?? dto.totals?.total ?? source?.total ?? dto.grand_total ?? 0),
    cancelled: dto.status === 'cancelled' || !!dto.cancelled_at,
  };
}

export function toBillRows(bills: any[], quotations: any[] = []): BillRow[] {
  return (bills || []).map((bill) => toBillRow(bill, quotations));
}

export function billsOf(customerId: number, rows: BillRow[]): BillRow[] {
  return rows.filter((row) => Number(row.customerId) === Number(customerId));
}

export function matchesBill(row: BillRow, search: string): boolean {
  const text = search.trim().toLowerCase();
  return (
    !text ||
    [row.number, row.customer, row.quotation, row.quotationNumber].some((value) => value.toLowerCase().includes(text))
  );
}
