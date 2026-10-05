/**
 * How an address reads on screen, the same way the documents print it:
 * "Surat - 395007" when it has both a city and a PIN code.
 */

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

/** The 6-digit PIN of an address row; rows from before the PIN field hold it in `zip_code`. */
export function pinOf(address: any): string {
  return clean(address?.pincode) || clean(address?.zip_code);
}

/** "Surat - 395007", or the one of the two there is, or ''. */
export function cityPin(city: unknown, pin: unknown): string {
  return [clean(city), clean(pin)].filter(Boolean).join(' - ');
}

/**
 * An address row (or its JSON copy on a quotation, an order or a bill) on one
 * line: "14 Lake View, Adajan, Surat - 395007, Gujarat".
 */
export function addressLine(address: any): string {
  if (!address || typeof address !== 'object') {
    return clean(address);
  }
  return [clean(address.address), clean(address.address_line2), cityPin(address.city, pinOf(address)), clean(address.state)]
    .filter(Boolean)
    .join(', ');
}
