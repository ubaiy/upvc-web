import { HttpContext, HttpContextToken } from '@angular/common/http';

/** The request does not raise the global loading overlay. */
export const SKIP_LOADER = new HttpContextToken<boolean>(() => false);

/** A failure of the request raises no global toast. An expired session is still announced. */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/**
 * Request options for a screen that shows its own loading and error states.
 *
 *   this.api.get('customer/list', quiet())            skeleton and inline error on the screen
 *   this.api.get('customer/list', quiet('loader'))    own skeleton, global error toast kept
 *   this.api.post('customer/add', body, quiet('errors'))   global overlay kept, error shown by the form
 *
 * Without it every request dims the page and every failure raises a toast,
 * which is still right for the old screens.
 */
export function quiet(what: 'all' | 'loader' | 'errors' = 'all'): { context: HttpContext } {
  const context = new HttpContext();
  if (what !== 'errors') {
    context.set(SKIP_LOADER, true);
  }
  if (what !== 'loader') {
    context.set(SKIP_ERROR_TOAST, true);
  }
  return { context };
}
