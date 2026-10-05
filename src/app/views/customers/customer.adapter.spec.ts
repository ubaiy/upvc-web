import {
  AddressValue,
  CustomerFormValue,
  GstState,
  gstinStateCode,
  isValidGstin,
  normaliseGstin,
  quotationsOf,
  stateCodeFor,
  toAddressPayload,
  toAddressValues,
  toCustomerPayload,
  toCustomerRow,
  defaultAddresses,
} from './customer.adapter';

const STATES: GstState[] = [
  { code: '24', name: 'Gujarat', abbreviation: 'GJ' },
  { code: '27', name: 'Maharashtra', abbreviation: 'MH' },
];

const address = (over: Partial<AddressValue> = {}): AddressValue => ({
  id: null,
  address: '12 MG Road',
  address_line2: '',
  city: 'Dahod',
  district: 'Dahod',
  state_code: '24',
  zip_code: '389151',
  ...over,
});

const form = (over: Partial<CustomerFormValue> = {}): CustomerFormValue => ({
  name: ' Amit Mehta ',
  phone: '9812345670',
  email: '',
  gstin: '',
  price_list: 'retail',
  addresses: [address()],
  ...over,
});

describe('customer adapter', () => {
  it('reads the state from a valid GSTIN and rejects a malformed one', () => {
    expect(normaliseGstin(' 24abcde1234f1z5 ')).toBe('24ABCDE1234F1Z5');
    expect(isValidGstin('24ABCDE1234F1Z5')).toBeTrue();
    expect(isValidGstin('24ABCDE1234F1X5')).toBeFalse();
    expect(gstinStateCode('24abcde1234f1z5')).toBe('24');
    expect(gstinStateCode('24ABC')).toBe('');
  });

  it('matches old free-text states by code, name or abbreviation', () => {
    expect(stateCodeFor('MH', STATES)).toBe('27');
    expect(stateCodeFor('gujarat', STATES)).toBe('24');
    expect(stateCodeFor('27', STATES)).toBe('27');
    expect(stateCodeFor('qqq', STATES)).toBe('');
    expect(stateCodeFor(null, STATES)).toBe('');
  });

  it('maps a customer to a list row, "is dealer" becoming the price list', () => {
    const row = toCustomerRow({ id: 4, name: 'Modern Homes LLP', phone: '98', is_dealer: 1, state_code: '27' }, STATES);
    expect(row.priceList).toBe('dealer');
    expect(row.stateName).toBe('Maharashtra');
    expect(row.gstin).toBe('');
    expect(toCustomerRow({ id: 1, name: 'A', is_dealer: 0 }, STATES).priceList).toBe('retail');
  });

  it('gives a list row the city and PIN code of the default address, and its state when the customer has none', () => {
    const byCustomer = defaultAddresses([
      { id: 6, customer_id: 4, is_default: 0, city: 'Nashik', state: 'Maharashtra', pincode: '422010' },
      { id: 5, customer_id: 4, is_default: 1, city: 'Surat', state: 'GJ', pincode: null, zip_code: '395007' },
      { id: 9, customer_id: 7, is_default: 0, city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    ]);
    expect(byCustomer.get(4).id).toBe(5);
    expect(byCustomer.get(7).id).withContext('no default: the first address').toBe(9);
    const row = toCustomerRow({ id: 4, name: 'Modern Homes LLP', is_dealer: 1 }, STATES, byCustomer.get(4));
    expect(row.place).toBe('Surat - 395007');
    expect(row.stateName).toBe('Gujarat');
    expect(toCustomerRow({ id: 1, name: 'A', is_dealer: 0 }, STATES).place).toBe('');
    expect(defaultAddresses(null).size).toBe(0);
  });

  it('puts the default address first', () => {
    const values = toAddressValues(
      {
        addresses: [
          { id: 1, address: 'b', is_default: 0, state: 'MH' },
          { id: 2, address: 'a', is_default: 1, state: 'x' },
        ],
      },
      STATES
    );
    expect(values.map((value) => value.id)).toEqual([2, 1]);
    expect(values[0].state_code).toBe('');
    expect(values[1].state_code).toBe('27');
  });

  it('sends a new customer with its first address in one request', () => {
    const payload = toCustomerPayload(form(), STATES, true);
    expect(payload).toEqual({
      name: 'Amit Mehta',
      phone: '9812345670',
      email: null,
      is_dealer: 0,
      gstin: null,
      state_code: '24',
      address: {
        address: '12 MG Road',
        address_line2: null,
        city: 'Dahod',
        district: 'Dahod',
        state: 'Gujarat',
        zip_code: '389151',
        pincode: '389151',
      },
    });
  });

  it('needs only a name and a phone: an empty address is left out', () => {
    const blank = address({ address: '', city: '', zip_code: '' });
    expect(toCustomerPayload(form({ addresses: [blank] }), STATES, true).address).toBeUndefined();
  });

  it('never nests an address on update, and takes the state from the GSTIN', () => {
    const payload = toCustomerPayload(form({ gstin: '27abcde1234f1z5', price_list: 'dealer' }), STATES, false);
    expect(payload.address).toBeUndefined();
    expect(payload.gstin).toBe('27ABCDE1234F1Z5');
    expect(payload.state_code).toBe('27');
    expect(payload.is_dealer).toBe(1);
  });

  it('builds the body the address endpoints require', () => {
    expect(toAddressPayload(address({ id: 9 }), 3, true, STATES)).toEqual({
      id: 9,
      customer_id: 3,
      is_default: 1,
      address: '12 MG Road',
      address_line2: '',
      city: 'Dahod',
      district: 'Dahod',
      state: 'Gujarat',
      zip_code: '389151',
      pincode: '389151',
    });
    expect(toAddressPayload(address({ id: 9, district: '' }), 3, true, STATES).district).withContext('a city typed by hand').toBeNull();
  });

  it('keeps only the quotations of one customer and reads status and total with fallbacks', () => {
    const rows = quotationsOf(3, [
      {
        id: 1,
        customer_id: 3,
        quatation_name: 'Flat',
        quatation_identity: 'abc',
        number: 'Q-0005',
        is_convert_bill: 1,
        grand_total: 10,
        total: 12,
        item_count: 2,
      },
      { id: 2, customer_id: '3', quatation_name: null, name: 'Sharma', quatation_identity: 'def', status: 'sent', grand_total: 5 },
      { id: 3, customer_id: 4, quatation_name: 'Other' },
    ]);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual({ id: 1, name: 'Flat', number: 'Q-0005', status: 'billed', windows: 2, total: 12 });
    expect(rows[1].status).toBe('sent');
    expect(rows[1].total).toBe(5);
    expect(rows[1].name).toBe('Sharma');
    expect(rows[1].number).toBe('def');
  });
});
