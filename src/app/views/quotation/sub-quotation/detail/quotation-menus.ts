/**
 * What the two "more" menus of the quotation page offer, by status. Pure:
 * the page passes in what each entry does.
 */
import { MenuItem } from 'primeng/api';

import { QuotationLine, QuotationView } from './quotation-detail.model';

export type PageMenuAction =
  | 'edit'
  | 'duplicate'
  | 'production'
  | 'revise'
  | 'send'
  | 'decline'
  | 'back-to-sent'
  | 'prices'
  | 'delete';

export type LineMenuAction = 'edit' | 'rename' | 'duplicate' | 'delete';

function entry(label: string, icon: string, command: () => void, danger = false): MenuItem {
  return { label, state: { icon }, command, ...(danger ? { styleClass: 'danger' } : {}) };
}

/** `reviseIsPrimary`: the header button already says "Revise quotation". */
export function pageMenu(view: QuotationView, reviseIsPrimary: boolean, run: (action: PageMenuAction) => void): MenuItem[] {
  const status = view.status;
  const open = !view.supersededBy && status !== 'billed';
  const hasLines = view.lines.length > 0;
  const items: MenuItem[] = [];
  if (open) {
    items.push(entry('Edit details', 'pencil', () => run('edit')));
  }
  items.push(entry('Duplicate', 'copy', () => run('duplicate')));
  if (hasLines) {
    // Cutting lists and the glass order for this quotation (card T69).
    items.push(entry('Production', 'layers', () => run('production')));
  }
  if (view.revisable && !reviseIsPrimary) {
    items.push(entry(`Revise (${view.nextRevision})`, 'file-plus', () => run('revise')));
  }
  if (open && status !== 'draft' && status !== 'declined' && hasLines) {
    items.push(entry('Send again', 'send', () => run('send')));
  }
  if (open && (status === 'sent' || status === 'expired')) {
    items.push(entry('Mark as declined', 'circle-x', () => run('decline')));
  }
  if (open && (status === 'accepted' || status === 'declined')) {
    items.push(entry('Move back to Sent', 'undo', () => run('back-to-sent')));
  }
  if (view.editable && hasLines) {
    items.push(entry('Update prices', 'refresh', () => run('prices')));
  }
  if (open) {
    items.push({ separator: true }, entry('Delete', 'trash', () => run('delete'), true));
  }
  return items;
}

export function lineMenu(view: QuotationView, line: QuotationLine, run: (action: LineMenuAction) => void): MenuItem[] {
  const items: MenuItem[] = [entry('Edit', 'pencil', () => run('edit'))];
  if (view.editable) {
    items.push(
      entry(line.label ? 'Rename' : 'Name this window', 'tag', () => run('rename')),
      entry('Duplicate', 'copy', () => run('duplicate')),
      { separator: true },
      entry('Delete', 'trash', () => run('delete'), true)
    );
  }
  return items;
}
