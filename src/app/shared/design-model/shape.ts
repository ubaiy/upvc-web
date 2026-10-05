/**
 * design-model shaped frames (Phase 3 item 3.1, model level): shape
 * parameter validation and the setFrameShape operation. The geometry
 * itself (outlines, areas, member lengths, clipping) lives in
 * shape-geometry.ts.
 *
 * Shapes are a FRAME property: the pane tree stays rectangular (splits
 * keep their mm positions inside the bounding box) and panes CLIP to the
 * shape — clipPanesToShape() gives the renderer/pricing each pane's real
 * polygon and area.
 */

import { FRAME_MAX_MM, FRAME_MIN_MM } from './geometry';
import { OpOptions, resizeFrame } from './operations';
import { ClipOptions, clipPanesToShape } from './shape-geometry';
import { DesignError, FrameShape, LeafNode, WindowDesign } from './types';

/** Problems with a shape at a given frame size (empty = valid). */
export function checkShape(
  shape: FrameShape,
  widthMm: number,
  heightMm: number
): string[] {
  const problems: string[] = [];
  switch (shape.kind) {
    case 'rect':
      break;
    case 'arch-top': {
      const maxRise = Math.min(heightMm, widthMm / 2);
      if (!(shape.riseMm > 0)) {
        problems.push(`arch rise ${shape.riseMm} must be > 0`);
      } else if (shape.riseMm > maxRise + 1e-9) {
        problems.push(
          `arch rise ${shape.riseMm} above max ${maxRise} (min(height, width/2))`
        );
      }
      break;
    }
    case 'circle':
      if (Math.abs(widthMm - heightMm) > 1e-9) {
        problems.push(`circle needs width === height, got ${widthMm}×${heightMm}`);
      }
      break;
    case 'triangle':
      if (!['left', 'right', 'isosceles'].includes(shape.apex)) {
        problems.push(`unknown triangle apex '${String(shape.apex)}'`);
      }
      break;
    case 'trapezoid': {
      const { leftHeightMm: l, rightHeightMm: r } = shape;
      if (!(l > 0) || !(r > 0)) {
        problems.push(`trapezoid heights must be > 0, got ${l}/${r}`);
      } else {
        if (Math.abs(Math.max(l, r) - heightMm) > 1e-9) {
          problems.push(
            `trapezoid max(${l}, ${r}) must equal frame height ${heightMm}`
          );
        }
        if (Math.abs(l - r) < 1e-9) {
          problems.push('trapezoid with equal heights is a rect — use rect');
        }
        if (Math.min(l, r) < FRAME_MIN_MM) {
          problems.push(`trapezoid short side ${Math.min(l, r)} below ${FRAME_MIN_MM}`);
        }
      }
      break;
    }
    default:
      problems.push(`unknown shape kind '${(shape as { kind: string }).kind}'`);
  }
  return problems;
}

/** Is a semicircular arch (rise === width/2 within tolerance)? */
export function isSemicircular(shape: FrameShape, widthMm: number): boolean {
  return shape.kind === 'arch-top' && Math.abs(shape.riseMm - widthMm / 2) < 1e-6;
}

/**
 * Set the frame shape. Validates against the current frame size; for
 * 'circle' the frame height is normalised to the width (bounding square),
 * clamped to the legal frame range. Pure: returns a new document.
 */
export function setFrameShape(
  design: WindowDesign,
  shape: FrameShape,
  opts?: OpOptions
): WindowDesign {
  let next = design;
  if (shape.kind === 'circle' && design.frame.widthMm !== design.frame.heightMm) {
    // Square the box through resizeFrame (as a rect, so nothing but the
    // tree rescales): nested dividers and sliding panels follow the
    // height change instead of being left outside the new box.
    const d = Math.min(FRAME_MAX_MM, Math.max(FRAME_MIN_MM, design.frame.widthMm));
    next = resizeFrame(
      { ...design, frame: { ...design.frame, shape: { kind: 'rect' } } },
      d,
      d,
      opts
    );
    const side = Math.max(next.frame.widthMm, next.frame.heightMm);
    if (next.frame.widthMm !== next.frame.heightMm) {
      next = resizeFrame(next, side, side, opts);
    }
  }
  const { widthMm, heightMm } = next.frame;
  const problems = checkShape(shape, widthMm, heightMm);
  if (problems.length) {
    throw new DesignError(`invalid frame shape: ${problems.join('; ')}`);
  }
  return { ...next, frame: { ...next.frame, shape: { ...shape } } };
}

/* ------------------------------------------------------------------ */
/* Panes the shape cuts (how they can open: shaped-opening.ts)         */
/* ------------------------------------------------------------------ */

/** Ids of the panes whose glass the frame shape cuts (none in a rectangle). */
export function panesCutByShape(
  design: WindowDesign,
  opts?: ClipOptions
): Set<string> {
  const ids = new Set<string>();
  if (design.frame.shape.kind === 'rect') return ids;
  for (const clip of clipPanesToShape(design, opts)) {
    if (clip.clipped) ids.add(clip.leafId);
  }
  return ids;
}

/** True for a pane that opens or slides (anything but fixed glass). */
export function leafOpens(leaf: LeafNode): boolean {
  return leaf.category === 'Slidding' || leaf.casementType === 'Openable';
}
