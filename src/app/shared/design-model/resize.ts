/**
 * design-model resize core — shared by every operation that changes a
 * region's span (frame resize, divider move, divider removal, equalize).
 *
 * Deterministic resize semantics (architecture §1.1):
 *  - UNLOCKED divider positions scale proportionally with their span;
 *  - LOCKED positions keep their mm offset, clamped back into order;
 *  - clamping honours each child's REQUIRED minimum span (its own nested
 *    splits' minimum panes + divider faces), so no operation can ever
 *    produce a pane below minimum anywhere in the tree;
 *  - sliding panels scale proportionally with their leaf's daylight width.
 */

import { effectiveFaceMm, widthsFromPositions } from './geometry';
import { Axis, PaneNode, isLeaf } from './types';

/**
 * Minimum span node needs along `axis` so every pane in its subtree keeps
 * at least `minPane` daylight (divider faces and sash insets included).
 */
export function requiredAlong(
  node: PaneNode,
  axis: Axis,
  frameFaceMm: number,
  minPaneMm: number
): number {
  let req: number;
  if (isLeaf(node)) {
    req = minPaneMm;
  } else if (node.axis === axis) {
    const face = effectiveFaceMm(node);
    req =
      node.children.reduce(
        (acc, c) => acc + requiredAlong(c, axis, frameFaceMm, minPaneMm),
        0
      ) +
      (node.children.length - 1) * face;
  } else {
    req = Math.max(
      minPaneMm,
      ...node.children.map((c) =>
        requiredAlong(c, axis, frameFaceMm, minPaneMm)
      )
    );
  }
  return node.sashFramed ? req + 2 * frameFaceMm : req;
}

/**
 * Clamp a centreline list to strictly-increasing order where child `i`
 * keeps at least `minsMm[i]` span (two-pass: left bound then right bound).
 */
export function clampPositionsRequired(
  positions: number[],
  faceMm: number,
  spanMm: number,
  minsMm: number[]
): number[] {
  const out = positions.slice();
  for (let i = 0; i < out.length; i++) {
    const lo =
      i === 0
        ? minsMm[0] + faceMm / 2
        : out[i - 1] + faceMm + minsMm[i];
    if (out[i] < lo) out[i] = lo;
  }
  for (let i = out.length - 1; i >= 0; i--) {
    const rightEdge =
      i === out.length - 1 ? spanMm : out[i + 1] - faceMm / 2;
    const hi = rightEdge - minsMm[i + 1] - faceMm / 2;
    if (out[i] > hi) out[i] = hi;
  }
  return out;
}

/**
 * Return `node` resized from region (oldW × oldH) to (newW × newH),
 * recursively applying the lock/scale/clamp semantics. Reference-stable:
 * an unchanged region returns the same node object.
 */
export function resizeRegion(
  node: PaneNode,
  oldW: number,
  oldH: number,
  newW: number,
  newH: number,
  frameFaceMm: number,
  minPaneMm: number
): PaneNode {
  if (oldW === newW && oldH === newH) return node;
  let ow = oldW;
  let oh = oldH;
  let nw = newW;
  let nh = newH;
  if (node.sashFramed) {
    ow -= 2 * frameFaceMm;
    oh -= 2 * frameFaceMm;
    nw -= 2 * frameFaceMm;
    nh -= 2 * frameFaceMm;
  }

  if (isLeaf(node)) {
    if (node.slide && ow > 0 && nw !== ow) {
      const ratio = nw / ow;
      return {
        ...node,
        slide: {
          ...node.slide,
          panels: node.slide.panels.map((p) => ({
            ...p,
            widthMm: p.widthMm * ratio,
          })),
        },
      };
    }
    return node;
  }

  const face = effectiveFaceMm(node);
  const vertical = node.axis === 'x';
  const oldSpan = vertical ? ow : oh;
  const newSpan = vertical ? nw : nh;

  let positions = node.positionsMm;
  if (oldSpan !== newSpan) {
    const scaled = node.positionsMm.map((p, i) =>
      node.lockedMm[i] ? p : (p * newSpan) / (oldSpan || 1)
    );
    const mins = node.children.map((c) =>
      requiredAlong(c, node.axis, frameFaceMm, minPaneMm)
    );
    positions = clampPositionsRequired(scaled, face, newSpan, mins);
  }

  const widthsOld = widthsFromPositions(node.positionsMm, face, oldSpan);
  const widthsNew = widthsFromPositions(positions, face, newSpan);
  const children = node.children.map((c, i) =>
    vertical
      ? resizeRegion(c, widthsOld[i], oh, widthsNew[i], nh, frameFaceMm, minPaneMm)
      : resizeRegion(c, ow, widthsOld[i], nw, widthsNew[i], frameFaceMm, minPaneMm)
  );
  return { ...node, positionsMm: positions, children };
}
