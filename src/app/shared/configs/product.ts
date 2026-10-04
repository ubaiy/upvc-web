/**
 * The product's name. The one place it is written: the browser tab title, the
 * sidebar before the company name has loaded, and the pages outside the shell.
 * Open decision for the owner (design-system.md §1): "UPVC" is a placeholder.
 */
export const PRODUCT_NAME = 'UPVC';

/**
 * Browser tab title: "<page> · <owner>". Inside the shell the owner is the
 * fabricator's company; outside it (sign in, 404) it is the product.
 */
export function documentTitle(page?: string | null, owner?: string | null): string {
  const name = owner?.trim() || PRODUCT_NAME;
  return page ? `${page} · ${name}` : name;
}
