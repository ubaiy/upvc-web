/**
 * The windows of a structure as the price asks for them. Every wall panel is
 * a window, so it is priced with the very body the window designer sends to
 * be priced; windows that come out equal are one group, and every window is
 * named exactly once.
 */

import { WindowDesign } from '../../shared/design-model';
import { Structure } from '../../shared/structure-model';
import { DesignerCatalog, FRAME_FACE_MM, completeDesign } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog';
import { DesignerCatalogService } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog.service';
import { ManageProductBody, buildManageProductBody } from '../quotation/sub-quotation/sub-quotation-design/designer-request';

export const WALL_FRAME_FACE_MM = FRAME_FACE_MM;

/** One group of equal windows: the panels that have it, and the body that prices one of them. */
export interface StructureWindow {
  face_ids: string[];
  body: ManageProductBody;
}

export interface WindowContext {
  quotationId: string | number;
}

/** The window of every panel that is a window, with the colour and the glass of the structure. */
export function windowDesigns(structure: Structure): Map<string, WindowDesign> {
  const { colorId, glassId } = structure.defaults;
  const out = new Map<string, WindowDesign>();
  for (const face of structure.faces) {
    if (face.fill.kind !== 'design' || !face.fill.design) continue;
    const d = face.fill.design;
    out.set(face.id, {
      ...d,
      frame: colorId === null ? d.frame : { ...d.frame, colorId, profileColor: structure.appearance.profileColour },
      glazing: d.glazing.glassId === null ? { ...d.glazing, glassId } : d.glazing,
    });
  }
  return out;
}

/** The windows to be priced, equal ones together. The catalogue must hold the lists the windows need (see ensureWindows). */
export function windowsOf(structure: Structure, catalog: DesignerCatalog, ctx: WindowContext): StructureWindow[] {
  const groups = new Map<string, StructureWindow>();
  for (const [id, design] of windowDesigns(structure)) {
    const body = buildManageProductBody(completeDesign(design, catalog), catalog, {
      quotationId: ctx.quotationId,
      lineId: null,
      quantity: 1,
      label: '',
      frameFaceMm: WALL_FRAME_FACE_MM,
    });
    const key = JSON.stringify(body);
    const group = groups.get(key);
    if (group) group.face_ids.push(id);
    else groups.set(key, { face_ids: [id], body });
  }
  return [...groups.values()];
}

/** The document as it is stored and priced: every window complete with its catalogue ids. */
export function documentFor(structure: Structure, catalog: DesignerCatalog): Structure {
  const designs = windowDesigns(structure);
  if (!designs.size) return structure;
  return {
    ...structure,
    faces: structure.faces.map((f) => {
      const design = designs.get(f.id);
      return design && f.fill.kind === 'design' ? { ...f, fill: { ...f.fill, design: completeDesign(design, catalog) } } : f;
    }),
  };
}

/** Fetch the profile lists the windows of this structure need and the catalogue does not hold yet. */
export async function ensureWindows(structure: Structure, catalogs: DesignerCatalogService, catalog: DesignerCatalog): Promise<void> {
  await Promise.all([...windowDesigns(structure).values()].map((d) => catalogs.ensure(d, catalog)));
}
