import { addressLine, cityPin, pinOf } from './address-text';

describe('address text', () => {
  it('reads "City - PIN" when an address has both', () => {
    expect(cityPin('Surat', '395007')).toBe('Surat - 395007');
    expect(cityPin('Surat', null)).toBe('Surat');
    expect(cityPin('', '395007')).toBe('395007');
    expect(cityPin(null, undefined)).toBe('');
  });

  it('takes the PIN from pincode, and from zip_code on a row saved before it', () => {
    expect(pinOf({ pincode: '395007', zip_code: '395 007' })).toBe('395007');
    expect(pinOf({ pincode: null, zip_code: '389151' })).toBe('389151');
    expect(pinOf(null)).toBe('');
  });

  it('puts an address on one line the way the documents print it', () => {
    expect(
      addressLine({ address: '14 Lake View', address_line2: 'Adajan', city: 'Surat', district: 'Surat', state: 'Gujarat', pincode: '395007' })
    ).toBe('14 Lake View, Adajan, Surat - 395007, Gujarat');
    expect(addressLine({ address: 'Villa 14', city: 'Godhra', state: 'Gujarat', zip_code: '389001' })).toBe(
      'Villa 14, Godhra - 389001, Gujarat'
    );
    expect(addressLine({ address: 'Site office', city: null, state: 'MH', zip_code: null }))
      .withContext('an address from before city and PIN code')
      .toBe('Site office, MH');
    expect(addressLine(null)).toBe('');
    expect(addressLine('Plain text')).toBe('Plain text');
  });
});
