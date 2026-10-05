/**
 * design-canvas — small pure editing helpers composed from design-model
 * operations. Shared by the canvas (typed dimensions, split guard) and the
 * inspector panel. Each returns a NEW document or throws DesignError.
 */

import {
  DesignError,
  FRAME_MAX_MM,
  FRAME_MIN_MM,
  FrameShape,
  FrameShapeKind,
  LeafNode,
  OpOptions,
  SHAPED_OPENING_PROBLEM,
  WindowDesign,
  clipPanesToShape,
  equalPanels,
  findNode,
  isLeaf,
  layout,
  panesCutByShape,
  resizeFrame,
  setFrameShape,
  setLeafSpec,
  setSlide,
} from '../design-model';

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** A sensible starting shape of `kind` for the current frame size. */
export function defaultShape(kind: FrameShapeKind, wMm: number, hMm: number): FrameShape {
  switch (kind) {
    case 'arch-top':
      return { kind, riseMm: Math.round(Math.min(wMm / 4, hMm / 2)) };
    case 'circle':
      return { kind };
    case 'triangle':
      return { kind, apex: 'isosceles' };
    case 'trapezoid':
      return {
        kind,
        leftHeightMm: hMm,
        rightHeightMm: Math.max(FRAME_MIN_MM, Math.round(hMm * 0.6)),
      };
    default:
      return { kind: 'rect' };
  }
}

export function setShapeKind(
  design: WindowDesign,
  kind: FrameShapeKind,
  opts?: OpOptions
): WindowDesign {
  if (design.frame.shape.kind === kind) return design;
  const { widthMm, heightMm } = design.frame;
  return setFrameShape(design, defaultShape(kind, widthMm, heightMm), opts);
}

/** Arch rise, clamped to 1 .. min(height, width / 2). */
export function setArchRise(
  design: WindowDesign,
  riseMm: number,
  opts?: OpOptions
): WindowDesign {
  const { widthMm, heightMm } = design.frame;
  const rise = clamp(Math.round(riseMm), 1, Math.min(heightMm, widthMm / 2));
  return setFrameShape(design, { kind: 'arch-top', riseMm: rise }, opts);
}

/**
 * Both trapezoid jamb heights. The frame height follows the taller jamb
 * (the pane tree rescales through resizeFrame); equal heights are rejected
 * because that is a rectangle.
 */
export function setTrapezoidHeights(
  design: WindowDesign,
  leftMm: number,
  rightMm: number,
  opts?: OpOptions
): WindowDesign {
  const l = clamp(Math.round(leftMm), FRAME_MIN_MM, FRAME_MAX_MM);
  const r = clamp(Math.round(rightMm), FRAME_MIN_MM, FRAME_MAX_MM);
  if (l === r) {
    throw new DesignError('trapezoid jambs must differ; use a rectangle instead');
  }
  const asRect: WindowDesign = {
    ...design,
    frame: { ...design.frame, shape: { kind: 'rect' } },
  };
  const resized = resizeFrame(asRect, design.frame.widthMm, Math.max(l, r), opts);
  return setFrameShape(
    resized,
    { kind: 'trapezoid', leftHeightMm: l, rightHeightMm: r },
    opts
  );
}

/**
 * True when the frame shape leaves some pane with no glass at all (e.g. a
 * split whose corner pane lies wholly beyond a triangle's slope). The canvas
 * refuses such splits: pricing would still charge the pane as a rectangle.
 */
export function shapeRemovesAPane(design: WindowDesign, opts?: OpOptions): boolean {
  if (design.frame.shape.kind === 'rect') return false;
  try {
    return clipPanesToShape(design, opts).some(
      (c) => c.polygonMm.length < 3 || c.areaMm2 < 1
    );
  } catch {
    return true;
  }
}

function leafOf(design: WindowDesign, paneId: string): LeafNode {
  const node = findNode(design.root, paneId);
  if (!node || !isLeaf(node)) throw new DesignError(`'${paneId}' is not a pane`);
  return node;
}

/** Daylight width of a leaf, the basis for its sliding panel widths. */
export function leafWidthMm(
  design: WindowDesign,
  paneId: string,
  opts?: OpOptions
): number {
  const nl = layout(design, opts).nodes.get(paneId);
  if (!nl) throw new DesignError(`no pane '${paneId}'`);
  return nl.rect.wMm;
}

export type PaneKind = 'fixed' | 'openable' | 'sliding';

export function paneKindOf(leaf: LeafNode): PaneKind {
  if (leaf.category === 'Slidding') return 'sliding';
  return leaf.casementType === 'Openable' ? 'openable' : 'fixed';
}

/** Switch a pane between fixed glass, an openable casement and a slider. */
export function setPaneKind(
  design: WindowDesign,
  paneId: string,
  kind: PaneKind,
  opts?: OpOptions
): WindowDesign {
  const leaf = leafOf(design, paneId);
  if (paneKindOf(leaf) === kind) return design;
  if (kind !== 'fixed' && panesCutByShape(design, opts).has(paneId)) {
    throw new DesignError(SHAPED_OPENING_PROBLEM);
  }
  if (design.door && kind !== 'openable') {
    const doorNode = findNode(design.root, design.door.doorNodeId);
    const inDoor = doorNode && findNode(doorNode, paneId);
    if (inDoor) throw new DesignError('a door leaf must stay openable');
  }
  switch (kind) {
    case 'sliding':
      return setSlide(design, paneId, {
        tracks: '2 Track',
        mesh: false,
        panels: equalPanels(2, leafWidthMm(design, paneId, opts), 0, '2 Track'),
      });
    case 'openable':
      return setLeafSpec(design, paneId, {
        category: 'Casement',
        casementType: 'Openable',
        opening: {
          direction: leaf.opening?.direction ?? 'Left',
          handleId: leaf.opening?.handleId ?? null,
          hingesType: leaf.opening?.hingesType ?? null,
        },
      });
    default:
      return setLeafSpec(design, paneId, {
        category: 'Casement',
        casementType: 'Fixed',
      });
  }
}

/** Opening direction of an openable casement (hardware ids are kept). */
export function setOpeningDirection(
  design: WindowDesign,
  paneId: string,
  direction: string
): WindowDesign {
  const leaf = leafOf(design, paneId);
  return setLeafSpec(design, paneId, {
    opening: {
      direction,
      handleId: leaf.opening?.handleId ?? null,
      hingesType: leaf.opening?.hingesType ?? null,
    },
  });
}
