/**
 * design-model leaf-spec operations — pure setters for a leaf's own
 * system/type/hardware and the sliding conversion. Split out of
 * operations.ts only for file size; same op contract (new immutable
 * document, input untouched, invariants preserved).
 */

import {
  CasementType,
  Category,
  DesignError,
  Id,
  LeafNode,
  OpeningSpec,
  PaneNode,
  SlideSpec,
  WindowDesign,
  findNode,
  isLeaf,
} from './types';

function replaceNode(
  node: PaneNode,
  id: string,
  replacer: (n: PaneNode) => PaneNode
): PaneNode {
  if (node.id === id) return replacer(node);
  if (isLeaf(node)) return node;
  let changed = false;
  const children = node.children.map((c) => {
    const next = replaceNode(c, id, replacer);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

function withRoot(design: WindowDesign, root: PaneNode): WindowDesign {
  return root === design.root ? design : { ...design, root };
}

function mustFind(design: WindowDesign, id: string): PaneNode {
  const node = findNode(design.root, id);
  if (!node) throw new DesignError(`no node with id '${id}'`);
  return node;
}

export interface LeafSpecPatch {
  category?: Category;
  casementType?: CasementType;
  productId?: Id | null;
  sashId?: Id | null;
  opening?: OpeningSpec | null;
}

/** Set a leaf's opening type / spec (category, casement type, hardware). */
export function setLeafSpec(
  design: WindowDesign,
  paneId: string,
  patch: LeafSpecPatch
): WindowDesign {
  const node = mustFind(design, paneId);
  if (!isLeaf(node)) throw new DesignError(`node '${paneId}' is not a leaf`);
  return withRoot(
    design,
    replaceNode(design.root, paneId, (n) => {
      const leaf = { ...(n as LeafNode) };
      if (patch.category !== undefined) {
        leaf.category = patch.category;
        if (patch.category === 'Casement') delete leaf.slide;
        else {
          delete leaf.casementType;
          delete leaf.opening;
        }
      }
      if (patch.casementType !== undefined) {
        leaf.casementType = patch.casementType;
        if (patch.casementType === 'Fixed') delete leaf.opening;
      }
      if (patch.productId !== undefined) leaf.productId = patch.productId;
      if (patch.sashId !== undefined) leaf.sashId = patch.sashId;
      if (patch.opening !== undefined) {
        if (patch.opening === null) delete leaf.opening;
        else leaf.opening = { ...patch.opening };
      }
      return leaf;
    })
  );
}

/** Convert a leaf to a sliding section (or replace its slide spec). */
export function setSlide(
  design: WindowDesign,
  paneId: string,
  slide: SlideSpec
): WindowDesign {
  if (!slide.panels.length) throw new DesignError('slide needs >= 1 panel');
  if (slide.panels.some((p) => !(p.widthMm > 0))) {
    throw new DesignError('every slide panel needs a positive widthMm');
  }
  const node = mustFind(design, paneId);
  if (!isLeaf(node)) throw new DesignError(`node '${paneId}' is not a leaf`);
  return withRoot(
    design,
    replaceNode(design.root, paneId, (n) => {
      const leaf = { ...(n as LeafNode) };
      leaf.category = 'Slidding';
      delete leaf.casementType;
      delete leaf.opening;
      leaf.slide = {
        tracks: slide.tracks,
        mesh: slide.mesh,
        panels: slide.panels.map((p) => ({ ...p })),
      };
      return leaf;
    })
  );
}

