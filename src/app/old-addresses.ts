import { Routes } from '@angular/router';

/**
 * Addresses of screens of the old app that were removed (card T138). Nothing links to them; a
 * bookmark or a typed address lands on the page of Settings that is nearest to what the screen was.
 *
 *   /crm/header, /crm/footer (+ add, edit/:id)  "document headers and footers": the api never had these
 *       endpoints (no route, no table) and no PDF prints a stored block; the footer line of a document
 *       is made by the api from the company name and the document number.  -> Settings > Documents
 *   /area  a list of area names: the api keeps `area_id` on a quotation and fills it with "General"
 *       itself; the web never sent one and no document, sheet or report prints an area.  -> Settings
 */
export const OLD_ADDRESSES: Routes = [
  { path: 'crm', pathMatch: 'full', redirectTo: '/profile?tab=documents' },
  { path: 'crm', children: [{ path: '**', redirectTo: '/profile?tab=documents' }] },
  { path: 'area', pathMatch: 'full', redirectTo: '/profile' },
  { path: 'area', children: [{ path: '**', redirectTo: '/profile' }] },
];
