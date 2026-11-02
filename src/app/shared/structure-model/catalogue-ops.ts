/**
 * structure-model catalogue operations — the choices of catalogue rows: the
 * profile of a bar role, the item of a hub, the glass of roof panes, what a
 * solid panel is made of, and the window of a wall panel. All pure: each
 * returns a new document and leaves the one it was given alone.
 */

import { Id, WindowDesign, walkLeaves } from '../design-model';
import { chargedJoints } from './derive';
import { Face, FaceOpening, Structure, StructureDefaults } from './types';

/** Bars of these roles are priced from the accessories unless a profile is chosen for them. */
export const ACCESSORY_ROLES: readonly string[] = ['coupler', 'corner_post'];

/** The roles of the bars the catalogue charges on their own, in the order they first appear. */
export function chargedBarRoles(structure: Structure): string[] {
  return [...new Set(chargedJoints(structure).map((j) => j.role))];
}

export function setDefaults(structure: Structure, patch: Partial<StructureDefaults>): Structure {
  return { ...structure, defaults: { ...structure.defaults, ...patch } };
}

function withEntry(list: Record<string, Id>, key: string, id: Id | null): Record<string, Id> {
  const { [key]: _old, ...rest } = list;
  return id === null ? rest : { ...rest, [key]: id };
}

/** The catalogue profile of a bar role; null puts the role back on the accessories (or on nothing). */
export function setBarProfile(structure: Structure, role: string, id: Id | null): Structure {
  return setDefaults(structure, { bars: withEntry(structure.defaults.bars, role, id) });
}

/** The cost head of a hub role; null = not charged. */
export function setHubItem(structure: Structure, role: string, id: Id | null): Structure {
  return setDefaults(structure, { hubs: withEntry(structure.defaults.hubs, role, id) });
}

function mapFaces(structure: Structure, faceIds: string[], change: (face: Face) => Face): Structure {
  const ids = new Set(faceIds);
  let changed = false;
  const faces = structure.faces.map((f) => {
    if (!ids.has(f.id)) return f;
    const next = change(f);
    if (next !== f) changed = true;
    return next;
  });
  return changed ? { ...structure, faces } : structure;
}

/** The glass of roof panes: a Glazzing row; null = the glass of the structure. Windows have their own glass. */
export function setFaceGlass(structure: Structure, faceIds: string[], glassId: Id | null): Structure {
  return mapFaces(structure, faceIds, (f) => (f.fill.kind === 'glass' ? { ...f, fill: { kind: 'glass', glassId }, edited: true } : f));
}

/** What solid panels are made of: a Glazzing row. */
export function setFaceProduct(structure: Structure, faceIds: string[], productId: Id | null): Structure {
  return mapFaces(structure, faceIds, (f) => (f.fill.kind === 'panel' ? { ...f, fill: { kind: 'panel', productId }, edited: true } : f));
}

/** How a window opens, as a panel is described: from its design. */
export function openingOfDesign(design: WindowDesign): FaceOpening {
  if (design.productType === 'Door') return 'door';
  const leaves = walkLeaves(design.root);
  if (leaves.some((l) => l.category === 'Slidding')) return 'sliding';
  const opening = leaves.find((l) => l.category === 'Casement' && l.casementType === 'Openable');
  if (!opening) return 'fixed';
  return opening.opening?.direction === 'Top' ? 'top-hung' : 'casement';
}

/** A window for each of these panels (a panel not in the list, or not a window, is left as it is). */
export function setFaceDesigns(structure: Structure, designs: ReadonlyMap<string, WindowDesign>): Structure {
  return mapFaces(structure, [...designs.keys()], (f) => {
    const design = designs.get(f.id);
    if (!design || f.fill.kind !== 'design') return f;
    return { ...f, fill: { kind: 'design', opening: openingOfDesign(design), design }, edited: true };
  });
}
