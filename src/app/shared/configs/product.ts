/**
 * The product's name. The one place it is written: the browser tab title, the
 * sidebar before the company name has loaded, and the pages outside the shell.
 * `src/index.html` cannot import it and repeats it in its <title>, shown
 * until the app starts: change both together.
 * "Framekar" is a working name (T108) and will change: change it here and in
 * the <title> of src/index.html, nowhere else.
 */
export const PRODUCT_NAME = 'Framekar';

/**
 * Browser tab title: "<page> · <owner>". Inside the shell the owner is the
 * fabricator's company; outside it (sign in, 404) it is the product.
 */
export function documentTitle(page?: string | null, owner?: string | null): string {
  const name = owner?.trim() || PRODUCT_NAME;
  return page ? `${page} · ${name}` : name;
}
