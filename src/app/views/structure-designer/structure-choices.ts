/**
 * What a structure is made of, chosen from the catalogue: the colour, the
 * glass, the profile of each bar, the item of each hub. The first choices
 * fill a new structure so it can be priced with no typing; the rest are the
 * dropdowns of the designer. Pure: the catalogue comes in as data.
 */

import { Id, walkLeaves, WindowDesign } from '../../shared/design-model';
import {
  ACCESSORY_ROLES,
  barSection,
  chargedBarRoles,
  DEFAULT_APPEARANCE,
  FILL_LABEL,
  hubLabel,
  openingOfDesign,
  Structure,
  setDefaults,
} from '../../shared/structure-model';
import { DesignerCatalog, tintsOf } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog';

export interface Choice {
  id: Id;
  label: string;
}

/** The glass rows of the catalogue: roof panes, solid panels and window glass are all chosen from them. */
export const glassChoices = (catalog: DesignerCatalog): Choice[] => catalog.glass.map((g) => ({ id: g.id, label: g.label }));

/** The profile colour rows of the catalogue. */
export const colourChoices = (catalog: DesignerCatalog): Choice[] => catalog.colours.map((o) => ({ id: o.id, label: o.label }));

/** The profiles a bar can be: the catalogue's mullion profiles. */
export const barChoices = (catalog: DesignerCatalog): Choice[] => catalog.mullions.map((m) => ({ id: m.id, label: m.label }));

const same = (a: Id | null | undefined, b: Id | null | undefined): boolean => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
const has = (list: { id: Id }[], id: Id | null | undefined): boolean => list.some((o) => same(o.id, id));

/** How a glass is drawn: its tint from its name, the usual glass otherwise. */
export function tintOfGlass(catalog: DesignerCatalog, glassId: Id | null | undefined): string {
  return (glassId !== null && glassId !== undefined && tintsOf(catalog)[String(glassId)]) || DEFAULT_APPEARANCE.glassTint;
}

const defaultGlass = (catalog: DesignerCatalog): Id | null => (catalog.glass.find((g) => g.isDefault) ?? catalog.glass[0])?.id ?? null;
const defaultColour = (catalog: DesignerCatalog) => catalog.colours.find((c) => c.isDefault) ?? catalog.colours[0] ?? null;

/**
 * The choices a new structure starts with: the default glass and colour of the catalogue and the first
 * mullion profile for every bar the catalogue charges. What is chosen already stays. The very same
 * document when there is nothing to fill.
 */
export function firstChoices(structure: Structure, catalog: DesignerCatalog): Structure {
  const d = structure.defaults;
  const colour = has(catalog.colours, d.colorId) ? catalog.colours.find((c) => same(c.id, d.colorId)) ?? null : defaultColour(catalog);
  const glassId = has(catalog.glass, d.glassId) || !catalog.glass.length ? d.glassId : defaultGlass(catalog);
  const profile = catalog.mullions[0]?.id;
  const bars = { ...d.bars };
  if (profile !== undefined) {
    for (const role of chargedBarRoles(structure)) {
      if (ACCESSORY_ROLES.includes(role) && !(role in bars)) continue;
      if (!has(catalog.mullions, bars[role])) bars[role] = profile;
    }
  }
  const colorId = colour ? colour.id : d.colorId;
  const profileColour = colour ? colour.hex : structure.appearance.profileColour;
  const glassTint = glassId !== d.glassId ? tintOfGlass(catalog, glassId) : structure.appearance.glassTint;
  const unchanged =
    colorId === d.colorId && glassId === d.glassId && JSON.stringify(bars) === JSON.stringify(d.bars) && profileColour === structure.appearance.profileColour && glassTint === structure.appearance.glassTint;
  if (unchanged) return structure;
  return { ...setDefaults(structure, { colorId, glassId, bars }), appearance: { ...structure.appearance, profileColour, glassTint } };
}

/** The dropdown of one bar role. `automatic`: with none chosen the bar is priced from the accessories. */
export interface BarControl {
  role: string;
  label: string;
  value: Id | null;
  automatic: boolean;
}

/** One control for each bar role the catalogue charges: the ones that take a profile first, then the accessories. */
export function barControls(structure: Structure): BarControl[] {
  const rows = chargedBarRoles(structure).map((role) => ({
    role,
    label: barSection(role).label,
    value: structure.defaults.bars[role] ?? null,
    automatic: ACCESSORY_ROLES.includes(role),
  }));
  return [...rows.filter((r) => !r.automatic), ...rows.filter((r) => r.automatic)];
}

export interface HubControl {
  role: string;
  label: string;
  value: Id | null;
}

/** One control for each kind of hub the structure has; with none chosen the hub is not charged. */
export function hubControls(structure: Structure): HubControl[] {
  const roles = [...new Set(structure.hubs.map((h) => h.role))];
  return roles.map((role) => ({ role, label: hubLabel(role), value: structure.defaults.hubs[role] ?? null }));
}

/** The control a refusal asks the user to fill in. */
export type ChosenControl = { kind: 'glass' } | { kind: 'colour' } | { kind: 'solid_panel' } | { kind: 'bar'; role: string };

/** `missing` of a refusal ("glass", "colour", "solid_panel", "bar.rafter") as the control to open; null for anything else. */
export function controlOf(missing: string): ChosenControl | null {
  if (missing === 'glass') return { kind: 'glass' };
  if (missing === 'colour') return { kind: 'colour' };
  if (missing === 'solid_panel') return { kind: 'solid_panel' };
  const role = /^bar\.(.+)$/.exec(missing)?.[1];
  return role ? { kind: 'bar', role } : null;
}

/** The glass of the whole structure. A window that had the old glass, or none of its own, takes the new one. */
export function setStructureGlass(structure: Structure, catalog: DesignerCatalog, glassId: Id): Structure {
  const old = structure.defaults.glassId;
  const faces = structure.faces.map((f) => {
    if (f.fill.kind !== 'design' || !f.fill.design) return f;
    const own = f.fill.design.glazing.glassId;
    if (own !== null && !same(own, old)) return f;
    const design = { ...f.fill.design, glazing: { ...f.fill.design.glazing, glassId } };
    return { ...f, fill: { ...f.fill, design } };
  });
  return {
    ...setDefaults({ ...structure, faces }, { glassId }),
    appearance: { ...structure.appearance, glassTint: tintOfGlass(catalog, glassId) },
  };
}

/** The colour of the whole structure: every window and every bar has it. */
export function setStructureColour(structure: Structure, catalog: DesignerCatalog, colorId: Id): Structure {
  const colour = catalog.colours.find((c) => same(c.id, colorId));
  if (!colour) return structure;
  const faces = structure.faces.map((f) => {
    if (f.fill.kind !== 'design' || !f.fill.design) return f;
    const design = { ...f.fill.design, frame: { ...f.fill.design.frame, colorId: colour.id, profileColor: colour.hex } };
    return { ...f, fill: { ...f.fill, design } };
  });
  return { ...setDefaults({ ...structure, faces }, { colorId: colour.id }), appearance: { ...structure.appearance, profileColour: colour.hex } };
}

/** A window in one line for the panel it is: its size, its glass, how it opens and its handle. */
export function describeWindow(design: WindowDesign, catalog: DesignerCatalog): string {
  const parts = [`${Math.round(design.frame.widthMm)} × ${Math.round(design.frame.heightMm)} mm`];
  const glass = catalog.glass.find((g) => same(g.id, design.glazing.glassId));
  if (glass) parts.push(glass.label);
  parts.push(FILL_LABEL[openingOfDesign(design)]);
  const handleId = walkLeaves(design.root).find((l) => l.opening?.handleId !== null && l.opening?.handleId !== undefined)?.opening?.handleId;
  const handle = (catalog.handles['Casement'] ?? []).find((h) => same(h.id, handleId));
  if (handle) parts.push(handle.label);
  return parts.join(' · ');
}
