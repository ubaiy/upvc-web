/**
 * Adapter between the customer screens and the API as it is today.
 *
 * The screens work with the view types below. Everything that reads an API
 * field name, or guesses one that the API does not send yet, lives here, so a
 * contract change is one edit in this file.
 */

export interface GstState {
  code: string;
  name: string;
  abbreviation: string;
}

export type PriceList = 'retail' | 'dealer';

export interface CustomerRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  gstin: string;
  stateName: string;
  priceList: PriceList;
}

export interface AddressValue {
  id: number | null;
  address: string;
  address_line2: string;
  city: string;
  /** Filled by the PIN code directory; empty for a city typed by hand. */
  district: string;
  state_code: string;
  /** The PIN code. Sent as `pincode`, and as `zip_code` for readers of the old field. */
  zip_code: string;
  /** The api's sentence when the saved PIN belongs to another state. Read only. */
  warning?: string;
}

export interface CustomerFormValue {
  name: string;
  phone: string;
  email: string;
  gstin: string;
  price_list: PriceList;
  addresses: AddressValue[];
}

export interface CustomerQuotationRow {
  id: number;
  name: string;
  number: string;
  status: string;
  windows: number | null;
  total: number;
}

/** 15 characters: state code, PAN, entity number, "Z", check character. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normaliseGstin(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, '').toUpperCase();
}

export function isValidGstin(value: string | null | undefined): boolean {
  return GSTIN_PATTERN.test(normaliseGstin(value));
}

/** The state a GSTIN names (its first two digits), or '' when it is not a valid GSTIN. */
export function gstinStateCode(value: string | null | undefined): string {
  return isValidGstin(value) ? normaliseGstin(value).slice(0, 2) : '';
}

/**
 * Old address rows hold the state as free text ("MH", "Gujarat", "24").
 * Returns the GST state code it means, or '' when it matches nothing.
 */
export function stateCodeFor(value: string | null | undefined, states: GstState[]): string {
  const text = (value || '').trim().toLowerCase();
  if (!text) {
    return '';
  }
  const match = states.find(
    (state) =>
      state.code === text || state.name.toLowerCase() === text || state.abbreviation.toLowerCase() === text
  );
  return match ? match.code : '';
}

export function stateName(code: string | null | undefined, states: GstState[]): string {
  return states.find((state) => state.code === code)?.name || '';
}

export function toCustomerRow(dto: any, states: GstState[]): CustomerRow {
  return {
    id: dto.id,
    name: dto.name || '',
    phone: dto.phone || '',
    email: dto.email || '',
    gstin: dto.gstin || '',
    stateName: stateName(dto.state_code, states),
    priceList: Number(dto.is_dealer) ? 'dealer' : 'retail',
  };
}

/** The default address first, as the form shows it. */
export function toAddressValues(dto: any, states: GstState[]): AddressValue[] {
  const rows: any[] = Array.isArray(dto?.addresses) ? [...dto.addresses] : [];
  rows.sort((a, b) => Number(b.is_default) - Number(a.is_default));
  return rows.map((row) => ({
    id: row.id,
    address: row.address || '',
    address_line2: row.address_line2 || '',
    city: row.city || '',
    district: row.district || '',
    warning: (Array.isArray(row.warnings) && row.warnings[0]?.message) || '',
    // An address saved since the PIN directory carries the code; older rows only the name.
    state_code: stateCodeFor(row.state_code, states) || stateCodeFor(row.state, states),
    // "pincode" is the 6-digit PIN; "zip_code" is what older rows hold.
    zip_code: row.pincode || row.zip_code || '',
  }));
}

export function isBlankAddress(address: AddressValue): boolean {
  return !address.address.trim() && !address.city.trim() && !address.zip_code.trim();
}

/**
 * Body for customer/add and customer/update. A new customer carries its
 * first address in the same request; on update the addresses go through
 * their own endpoints, because a nested address always creates a row.
 */
export function toCustomerPayload(value: CustomerFormValue, states: GstState[], isNew: boolean): any {
  const first = value.addresses[0];
  const payload: any = {
    name: value.name.trim(),
    phone: value.phone.trim(),
    email: value.email.trim() || null,
    is_dealer: value.price_list === 'dealer' ? 1 : 0,
    gstin: normaliseGstin(value.gstin) || null,
    state_code: gstinStateCode(value.gstin) || first?.state_code || null,
  };
  if (isNew && first && !isBlankAddress(first)) {
    payload.address = {
      address: first.address.trim(),
      address_line2: first.address_line2.trim() || null,
      city: first.city.trim() || null,
      district: first.district.trim() || null,
      state: stateName(first.state_code, states) || null,
      zip_code: first.zip_code.trim() || null,
      pincode: first.zip_code.trim() || null,
    };
  }
  return payload;
}

/** Body for customer/address/add and customer/address/update. */
export function toAddressPayload(
  address: AddressValue,
  customerId: number,
  isDefault: boolean,
  states: GstState[]
): any {
  return {
    id: address.id,
    customer_id: customerId,
    is_default: isDefault ? 1 : 0,
    address: address.address.trim(),
    address_line2: address.address_line2.trim(),
    city: address.city.trim(),
    district: address.district.trim() || null,
    state: stateName(address.state_code, states),
    zip_code: address.zip_code.trim(),
    pincode: address.zip_code.trim() || null,
  };
}

/**
 * One row of "this customer's quotations", from quatation/list (phase 9
 * contract): number (Q-0005), status and total, the selling total.
 * grand_total is the cost sum and is only a fallback for an old API.
 */
export function toCustomerQuotationRow(dto: any): CustomerQuotationRow {
  const number = dto.number || dto.quatation_identity || '';
  return {
    id: dto.id,
    name: dto.quatation_name || dto.name || 'Quotation',
    number,
    status: dto.status || (Number(dto.is_convert_bill) ? 'billed' : 'draft'),
    windows: dto.item_count ?? null,
    total: Number(dto.total ?? dto.grand_total ?? 0),
  };
}

export function quotationsOf(customerId: number, quotations: any[]): CustomerQuotationRow[] {
  return (quotations || [])
    .filter((quotation) => Number(quotation.customer_id) === Number(customerId))
    .map(toCustomerQuotationRow);
}
