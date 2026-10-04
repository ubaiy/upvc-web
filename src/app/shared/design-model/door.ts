/**
 * design-model doors (Phase 2 item 2.2, model level).
 *
 * A door IS a window document with productType 'Door' plus a DoorSpec:
 *  - the door leaf is an ordinary Openable casement leaf;
 *  - a double (French) door is a 2-child 'sash' split, exactly like a
 *    2-palla casement (splitPaneEqualSash);
 *  - side lights and top lights are ordinary 'mullion' splits AROUND the
 *    door node (wrapWithSplit), so all existing geometry/pricing math
 *    applies unchanged;
 *  - threshold / swing are DoorSpec fields the tree cannot express.
 *
 * Payload: product_type 'Door' already flows through toPayload via
 * design.productType; the api prices Door-specific costheads off it
 * (e.g. 3D hinges). Threshold and In/Out swing have NO payload key yet —
 * see the Phase 2 log's "what the api needs" list.
 */

import { DEFAULT_FRAME_FACE_MM, MIN_PANE_MM, regionOf } from './geometry';
import { OpOptions, SplitPaneOptions, createLeaf, splitPaneEqualSash } from './operations';
import { requiredAlong, resizeRegion } from './resize';
import {
  DesignError,
  DoorSpec,
  Id,
  LeafNode,
  PaneNode,
  SplitNode,
  ThresholdType,
  WindowDesign,
  findNode,
  isLeaf,
  nextIdSeq,
} from './types';

export interface MakeDoorOptions extends OpOptions {
  leaves?: 1 | 2;
  openingSide?: 'Left' | 'Right';
  swing?: 'In' | 'Out';
  threshold?: ThresholdType;
  /** Door sash / hardware for the door leaf (leaves). */
  sashId?: Id | null;
  handleId?: Id | null;
  hingesType?: string | null;
  productId?: Id | null;
}

/**
 * Turn leaf `paneId` into THE door of this design: the leaf becomes an
 * Openable casement (or a 2-sash split for a double door), productType
 * flips to 'Door', and design.door records side/swing/threshold. Any
 * previous door spec is replaced — a design has at most one door.
 */
export function makeDoor(
  design: WindowDesign,
  paneId: string,
  opts?: MakeDoorOptions
): WindowDesign {
  const node = findNode(design.root, paneId);
  if (!node) throw new DesignError(`no node with id '${paneId}'`);
  if (!isLeaf(node)) throw new DesignError(`node '${paneId}' is already split`);

  const leaves = opts?.leaves ?? 1;
  const openingSide = opts?.openingSide ?? 'Left';
  const door: DoorSpec = {
    leaves,
    openingSide,
    swing: opts?.swing ?? 'In',
    threshold: opts?.threshold ?? 'Standard',
    doorNodeId: paneId,
  };

  const doorLeaf: LeafNode = {
    ...node,
    category: 'Casement',
    casementType: 'Openable',
    sashId: opts?.sashId !== undefined ? opts.sashId : node.sashId,
    productId: opts?.productId !== undefined ? opts.productId : node.productId,
    opening: {
      direction: openingSide,
      handleId: opts?.handleId ?? node.opening?.handleId ?? null,
      hingesType: opts?.hingesType ?? node.opening?.hingesType ?? null,
    },
  };
  delete doorLeaf.slide;

  let next: WindowDesign = {
    ...design,
    productType: 'Door',
    root: replaceNode(design.root, paneId, () => doorLeaf),
    door,
  };
  if (leaves === 2) {
    // French door: 2 equal sash leaves; the active leaf's hinge side is
    // the DoorSpec's openingSide (left leaf opens Left, right leaf Right,
    // the legacy alternating seeding).
    next = splitPaneEqualSash(next, paneId, 2, opts);
  }
  return next;
}

/** Patch door-level fields (side/swing/threshold). */
export function setDoorSpec(
  design: WindowDesign,
  patch: Partial<Omit<DoorSpec, 'doorNodeId' | 'leaves'>>
): WindowDesign {
  if (!design.door) throw new DesignError('design has no door (makeDoor first)');
  const door: DoorSpec = { ...design.door, ...patch };
  let root = design.root;
  if (patch.openingSide && door.leaves === 1) {
    const node = findNode(root, door.doorNodeId);
    if (node && isLeaf(node)) {
      root = replaceNode(root, door.doorNodeId, (n) => ({
        ...(n as LeafNode),
        opening: {
          direction: patch.openingSide as string,
          handleId: (n as LeafNode).opening?.handleId ?? null,
          hingesType: (n as LeafNode).opening?.hingesType ?? null,
        },
      }));
    }
  }
  return { ...design, door, root };
}

/* ------------------------------------------------------------------ */
/* Wrapping splits (side lights / top light)                           */
/* ------------------------------------------------------------------ */

export interface WrapSplitOptions extends SplitPaneOptions {
  /** Spec for the NEW light pane; default = a Fixed casement leaf. */
  light?: Partial<Omit<LeafNode, 'id' | 'kind'>>;
}

/**
 * Wrap ANY node (leaf or split) in a new 'mullion' split, placing a new
 * Fixed light beside/above/below it. `where` picks the side the new light
 * goes; `lightMm` is the light's daylight size along the split axis.
 * This is how doors get side lights and top lights as ORDINARY splits —
 * but it is general: any pane group can be wrapped.
 *
 * The wrapped node keeps its id and its subtree's inner geometry (its
 * region shrinks; nested positions rescale through the next layout pass
 * only when operations change them — the stored mm positions are relative
 * to the node's own daylight and remain valid).
 */
export function wrapWithSplit(
  design: WindowDesign,
  nodeId: string,
  where: 'left' | 'right' | 'top' | 'bottom',
  lightMm: number,
  opts?: WrapSplitOptions
): WindowDesign {
  const node = findNode(design.root, nodeId);
  if (!node) throw new DesignError(`no node with id '${nodeId}'`);

  const axis = where === 'left' || where === 'right' ? 'x' : 'y';
  const faceMm = opts?.dividerFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const minPane = opts?.minPaneMm ?? MIN_PANE_MM;
  const region = regionOf(design, nodeId, opts);
  const span = axis === 'x' ? region.content.wMm : region.content.hMm;
  if (!(lightMm >= minPane)) {
    throw new DesignError(`light size ${lightMm} below minimum ${minPane}`);
  }

  const lightFirst = where === 'left' || where === 'top';
  const positionMm = lightFirst ? lightMm + faceMm / 2 : span - lightMm - faceMm / 2;

  // The wrapped subtree's region shrinks along the axis: honour its own
  // required minimum and rescale its nested positions / sliding panels.
  const frameFace = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const innerSpan = span - lightMm - faceMm;
  const required = requiredAlong(node, axis, frameFace, minPane);
  if (innerSpan < required) {
    throw new DesignError(
      `wrapping '${nodeId}' leaves ${innerSpan} mm but its content needs ${required} mm`
    );
  }

  let seq = nextIdSeq(design.root);
  const light = createLeaf(`p${seq++}`, {
    productId: isLeaf(node) ? node.productId : design.frame.productId,
    sashId: null,
    ...opts?.light,
  });
  // The wrapped node moves down one level under a NEW split that takes
  // over the original node's slot; the split gets a fresh id so the
  // wrapped node keeps its identity (and the DoorSpec's doorNodeId).
  const inner: PaneNode =
    axis === 'x'
      ? resizeRegion(node, region.content.wMm, region.content.hMm, innerSpan, region.content.hMm, frameFace, minPane)
      : resizeRegion(node, region.content.wMm, region.content.hMm, region.content.wMm, innerSpan, frameFace, minPane);
  const split: SplitNode = {
    id: `p${seq++}`,
    kind: 'split',
    axis,
    dividerKind: 'mullion',
    dividerProfileId: opts?.dividerProfileId ?? null,
    dividerFaceMm: faceMm,
    positionsMm: [positionMm],
    lockedMm: [true],
    children: lightFirst ? [light, inner] : [inner, light],
  };
  return {
    ...design,
    root: replaceNode(design.root, nodeId, () => split),
  };
}

/** Add a fixed side light beside the door node (ordinary mullion split). */
export function addDoorSideLight(
  design: WindowDesign,
  side: 'left' | 'right',
  widthMm: number,
  opts?: WrapSplitOptions
): WindowDesign {
  if (!design.door) throw new DesignError('design has no door (makeDoor first)');
  return wrapWithSplit(design, design.door.doorNodeId, side, widthMm, opts);
}

/** Add a fixed top light above the door node (ordinary transom split). */
export function addDoorTopLight(
  design: WindowDesign,
  heightMm: number,
  opts?: WrapSplitOptions
): WindowDesign {
  if (!design.door) throw new DesignError('design has no door (makeDoor first)');
  return wrapWithSplit(design, design.door.doorNodeId, 'top', heightMm, opts);
}

/** Problems a door design has beyond the core invariants (empty = valid). */
export function checkDoor(design: WindowDesign): string[] {
  const problems: string[] = [];
  if (design.productType === 'Door') {
    if (!design.door) {
      problems.push("productType 'Door' without a door spec");
      return problems;
    }
    const node = findNode(design.root, design.door.doorNodeId);
    if (!node) {
      problems.push(`door node '${design.door.doorNodeId}' not in the tree`);
      return problems;
    }
    if (design.door.leaves === 1) {
      if (!isLeaf(node) || node.casementType !== 'Openable') {
        problems.push('single door node must be an Openable casement leaf');
      }
    } else {
      if (
        isLeaf(node) ||
        (node.dividerKind ?? 'mullion') !== 'sash' ||
        node.children.length !== 2
      ) {
        problems.push("double door node must be a 2-child 'sash' split");
      }
    }
  } else if (design.door) {
    problems.push(`door spec on productType '${design.productType}'`);
  }
  return problems;
}

/* local tree surgery (same contract as operations.ts) */
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
