/**
 * Designer catalogue: the master data a WindowDesign needs before it can be
 * priced, and the ONE rule that fills it in.
 *
 * The canvas and the inspector edit the drawing; they do not know which
 * frame profile a 3-track slider uses or which handles exist. Pricing needs
 * those ids on every pane. `completeDesign` fills them from the catalogue,
 * the same way every time:
 *
 *   an id the pane already has is kept if the catalogue still offers it for
 *   that pane's system; otherwise the first entry of the list is used.
 *
 * So the ids are a function of the drawing, not of how it was drawn, which
 * is half of the pricing rule (the other half is in design-model/payload.ts).
 * Pure: no Angular, no HTTP.
 */

import {
  Id,
  LeafNode,
  PaneNode,
  TrackType,
  WindowDesign,
  isLeaf,
  walkLeaves,
} from 'src/app/shared/design-model';

export interface CatalogOption {
  id: Id;
  label: string;
}

export interface ColourOption extends CatalogOption {
  hex: string;
  isDefault: boolean;
  /** The dropdown row as the api sent it; the pricing request sends it back. */
  row: unknown;
}

export interface GlassChoice extends CatalogOption {
  isDefault: boolean;
}

export interface HandleChoice extends CatalogOption {
  door: boolean;
  window: boolean;
}

/** Frame and sash profiles of one system (see {@link systemKeyOf}). */
export interface SystemLists {
  frames: CatalogOption[];
  sashes: CatalogOption[];
}

export interface DesignerCatalog {
  glass: GlassChoice[];
  colours: ColourOption[];
  hinges: string[];
  tracks: TrackType[];
  mullions: CatalogOption[];
  /** Keyed by {@link systemKeyOf}; filled lazily as systems are used. */
  systems: Record<string, SystemLists>;
  /** Handles per category ('Casement' | 'Slidding'); filled lazily. */
  handles: Record<string, HandleChoice[]>;
}

/** What identifies a profile system to the product dropdown endpoint. */
export interface SystemQuery {
  productType: 'Window' | 'Door';
  category: 'Casement' | 'Slidding';
  casementType: 'Fixed' | 'Openable' | '';
  track: TrackType | null;
}

export function systemQueryOf(
  productType: 'Window' | 'Door',
  leaf: LeafNode
): SystemQuery {
  if (leaf.category === 'Slidding') {
    return {
      productType,
      category: 'Slidding',
      casementType: '',
      track: leaf.slide?.tracks ?? '2 Track',
    };
  }
  return {
    productType,
    category: 'Casement',
    casementType: leaf.casementType === 'Openable' ? 'Openable' : 'Fixed',
    track: null,
  };
}

export function systemKey(q: SystemQuery): string {
  return [q.productType, q.category, q.casementType, q.track ?? ''].join('|');
}

export function systemKeyOf(productType: 'Window' | 'Door', leaf: LeafNode): string {
  return systemKey(systemQueryOf(productType, leaf));
}

/** Every system the design uses, without repeats, in leaf order. */
export function systemQueriesOf(design: WindowDesign): SystemQuery[] {
  const seen = new Set<string>();
  const out: SystemQuery[] = [];
  for (const leaf of walkLeaves(design.root)) {
    const q = systemQueryOf(design.productType, leaf);
    const key = systemKey(q);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(q);
    }
  }
  return out;
}

const same = (a: Id | null | undefined, b: Id | null | undefined): boolean =>
  a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

/** The kept id (in the list's own type) or the first entry; null for an empty list. */
function keepOrFirst(list: CatalogOption[], current: Id | null | undefined): Id | null {
  const kept = list.find((o) => same(o.id, current));
  if (kept) return kept.id;
  return list.length ? list[0].id : null;
}

function sameHex(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Handles that fit this product type, in catalogue order. */
export function handlesFor(
  catalog: DesignerCatalog,
  category: string,
  productType: 'Window' | 'Door'
): HandleChoice[] {
  const all = catalog.handles[category] ?? [];
  const fit = all.filter((h) => (productType === 'Door' ? h.door : h.window));
  return fit.length ? fit : all;
}

function completeLeaf(
  leaf: LeafNode,
  productType: 'Window' | 'Door',
  catalog: DesignerCatalog
): LeafNode {
  const lists = catalog.systems[systemKeyOf(productType, leaf)];
  const next: LeafNode = { ...leaf };
  if (lists) next.productId = keepOrFirst(lists.frames, leaf.productId);

  if (leaf.category === 'Slidding') {
    if (lists) next.sashId = keepOrFirst(lists.sashes, leaf.sashId);
    return next;
  }
  if (leaf.casementType !== 'Openable') {
    // Fixed glass has no sash and no hardware.
    next.sashId = null;
    delete next.opening;
    return next;
  }
  if (lists) next.sashId = keepOrFirst(lists.sashes, leaf.sashId);
  const handles = handlesFor(catalog, 'Casement', productType);
  const hinge = leaf.opening?.hingesType;
  next.opening = {
    direction: leaf.opening?.direction ?? 'Left',
    handleId: catalog.handles['Casement']
      ? keepOrFirst(handles, leaf.opening?.handleId)
      : leaf.opening?.handleId ?? null,
    hingesType:
      hinge && catalog.hinges.includes(hinge) ? hinge : catalog.hinges[0] ?? hinge ?? null,
  };
  return next;
}

function completeNode(
  node: PaneNode,
  productType: 'Window' | 'Door',
  catalog: DesignerCatalog
): PaneNode {
  if (isLeaf(node)) return completeLeaf(node, productType, catalog);
  const real = (node.dividerKind ?? 'mullion') === 'mullion';
  return {
    ...node,
    dividerProfileId: real ? keepOrFirst(catalog.mullions, node.dividerProfileId) : null,
    children: node.children.map((c) => completeNode(c, productType, catalog)),
  };
}

/** The colour the design means: its id if that matches the drawn hex, else the hex, else the default. */
export function colourOf(design: WindowDesign, catalog: DesignerCatalog): ColourOption | null {
  const byId = catalog.colours.find((c) => same(c.id, design.frame.colorId));
  const hex = design.frame.profileColor;
  if (byId && (!hex || sameHex(byId.hex, hex))) return byId;
  return (
    catalog.colours.find((c) => sameHex(c.hex, hex)) ??
    byId ??
    catalog.colours.find((c) => c.isDefault) ??
    catalog.colours[0] ??
    null
  );
}

/**
 * Fill every catalogue id of the design by the rule above. Returns a new
 * document; running it on its own output changes nothing.
 */
export function completeDesign(design: WindowDesign, catalog: DesignerCatalog): WindowDesign {
  const root = completeNode(design.root, design.productType, catalog);
  const colour = colourOf(design, catalog);
  const glass =
    catalog.glass.find((g) => same(g.id, design.glazing.glassId)) ??
    catalog.glass.find((g) => g.isDefault) ??
    catalog.glass[0];
  const first = walkLeaves(root)[0];
  return {
    ...design,
    frame: {
      ...design.frame,
      productId: first.productId ?? design.frame.productId,
      colorId: colour ? colour.id : design.frame.colorId,
      profileColor: colour ? colour.hex : design.frame.profileColor,
    },
    glazing: { ...design.glazing, glassId: glass ? glass.id : design.glazing.glassId },
    root,
  };
}

/** Whether the catalogue already holds every list this design needs. */
export function missingSystems(design: WindowDesign, catalog: DesignerCatalog): SystemQuery[] {
  return systemQueriesOf(design).filter((q) => !catalog.systems[systemKey(q)]);
}

export function needsCasementHandles(design: WindowDesign): boolean {
  return walkLeaves(design.root).some(
    (l) => l.category === 'Casement' && l.casementType === 'Openable'
  );
}
