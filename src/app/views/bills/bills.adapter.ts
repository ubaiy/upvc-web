/**
 * Adapter between the bills list and bill/list.
 *
 * Since card A5 a bill row carries number (INV/26-27/0042), bill_date,
 * status with cancelled_at, quatation_id, quatation_number and total. The
 * fallbacks below keep the screen working against an API without them.
 */

export interface BillRow {
  id: number;
  /** INV/26-27/0042; "Bill 12" for a bill that has no number. */
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
  /** Why it was cancelled, as typed in the Cancel dialog; '' when none was given. */
  cancelReason: string;
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
 * @param quotations quatation/list?status=all. It gives the name of the
 * quotation a bill came from, and stands in for the id, number and total
 * when the bill row does not carry them. grand_total is the cost sum, not
 * what the customer pays, so it is the last fallback for the amount.
 */
export function toBillRow(dto: any, quotations: any[] = []): BillRow {
  const source =
    quotations.find((quotation) => dto.quatation_id != null && quotation.id === dto.quatation_id) ||
    quotations.find(
      (quotation) => !!dto.quatation_identity && quotation.quatation_identity === dto.quatation_identity
    );
  const number = dto.number || dto.bill_number || '';
  return {
    id: dto.id,
    number: number || `Bill ${dto.id}`,
    hasNumber: !!number,
    date: dto.bill_date || dto.created_at || null,
    customerId: dto.customer_id ?? null,
    customer: customerName(dto),
    quotationId: source?.id ?? dto.quatation_id ?? null,
    quotation: source?.quatation_name || dto.quatation_name || source?.number || dto.quatation_number || dto.quatation_identity || '',
    quotationNumber: source?.number || dto.quatation_number || '',
    amount: Number(dto.total ?? dto.totals?.total ?? source?.total ?? dto.grand_total ?? 0),
    cancelled: dto.status === 'cancelled' || !!dto.cancelled_at,
    cancelReason: (dto.cancel_reason || '').toString().trim(),
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
