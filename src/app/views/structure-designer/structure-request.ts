/**
 * What goes to the api with a structure: its windows (one entry for each
 * group of equal windows) and the document with every window complete with
 * its catalogue ids. The lists the windows need are fetched first.
 */

import { Structure } from '../../shared/structure-model';
import { DesignerCatalog } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog';
import { DesignerCatalogService } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog.service';
import { documentFor, ensureWindows, StructureWindow, windowsOf } from './structure-windows';

export interface WindowsAndDocument {
  document: Structure;
  windows: StructureWindow[];
}

export async function windowsAndDocument(
  structure: Structure,
  quotationId: number,
  catalogs: DesignerCatalogService,
  catalog: DesignerCatalog
): Promise<WindowsAndDocument> {
  await ensureWindows(structure, catalogs, catalog);
  return { document: documentFor(structure, catalog), windows: windowsOf(structure, catalog, { quotationId }) };
}
