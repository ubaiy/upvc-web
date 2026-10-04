const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * Keeps Tab inside an open dialog: from the last control it goes to the
 * first, and with Shift from the first to the last.
 */
export function keepFocusInside(event: KeyboardEvent, dialog: HTMLElement): void {
  if (event.key !== 'Tab') {
    return;
  }
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (!controls.length) {
    return;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}
