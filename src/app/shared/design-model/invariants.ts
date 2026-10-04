/**
 * design-model invariants — the model police. Every operation must return
 * a design that passes these checks (unit-tested per operation):
 *  - positions strictly increasing, inside the parent's daylight span;
 *  - children count = positions + 1; lockedMm parallel to positionsMm;
 *  - child sizes always sum to the parent's available daylight span;
 *  - no pane below the minimum anywhere in the tree;
 *  - sash splits carry face 0; sliding leaves carry valid panels whose
 *    widths sum to at least the leaf's daylight width (overlaps add).
 */

import {
  DEFAULT_FRAME_FACE_MM,
  FRAME_MAX_MM,
  FRAME_MIN_MM,
  MIN_PANE_MM,
  LayoutOptions,
  effectiveFaceMm,
  widthsFromPositions,
} from './geometry';
import { checkDoor } from './door';
import { checkShape } from './shape';
import { validateSlide } from './slide';
import { DESIGN_SCHEMA, PaneNode, WindowDesign, isLeaf } from './types';

export interface InvariantOptions extends LayoutOptions {
  minPaneMm?: number;
}

/**
 * Check every model invariant; returns a list of human-readable problems
 * (empty = valid).
 */
export function checkInvariants(
  design: WindowDesign,
  opts?: InvariantOptions
): string[] {
  const problems: string[] = [];
  const f = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const minPane = opts?.minPaneMm ?? MIN_PANE_MM;

  if (design.schema !== DESIGN_SCHEMA) {
    problems.push(`schema is '${design.schema}', expected '${DESIGN_SCHEMA}'`);
  }
  if (design.unit !== 'mm') problems.push(`unit is '${design.unit}'`);
  const { widthMm, heightMm } = design.frame;
  if (!(widthMm >= FRAME_MIN_MM && widthMm <= FRAME_MAX_MM)) {
    problems.push(`frame width ${widthMm} outside ${FRAME_MIN_MM}-${FRAME_MAX_MM}`);
  }
  if (!(heightMm >= FRAME_MIN_MM && heightMm <= FRAME_MAX_MM)) {
    problems.push(`frame height ${heightMm} outside ${FRAME_MIN_MM}-${FRAME_MAX_MM}`);
  }
  // Phase 3: shape parameter validity ('rect' always passes).
  problems.push(...checkShape(design.frame.shape, widthMm, heightMm));
  // Phase 2: door structure validity (no-ops without a door spec).
  problems.push(...checkDoor(design));

  const ids = new Set<string>();
  const visit = (node: PaneNode, spanW: number, spanH: number): void => {
    if (ids.has(node.id)) problems.push(`duplicate node id '${node.id}'`);
    ids.add(node.id);
    let w = spanW;
    let h = spanH;
    if (node.sashFramed) {
      w -= 2 * f;
      h -= 2 * f;
    }
    if (isLeaf(node)) {
      if (node.category === 'Slidding') {
        if (!node.slide) {
          problems.push(`sliding leaf '${node.id}' has no slide spec`);
        } else {
          const sum = node.slide.panels.reduce((a, p) => a + p.widthMm, 0);
          if (node.slide.panels.length < 1) {
            problems.push(`sliding leaf '${node.id}' has no panels`);
          }
          if (node.slide.panels.some((p) => !(p.widthMm > 0))) {
            problems.push(`sliding leaf '${node.id}' has a non-positive panel`);
          }
          // Panels overlap on tracks, so their sum is >= the daylight width
          // (equal-split, zero-overlap panels sum to it exactly).
          if (sum < w - 0.5) {
            problems.push(
              `sliding leaf '${node.id}' panels sum ${sum} < daylight ${w}`
            );
          }
          // Phase 2 additions. Only states UNREACHABLE through Phase 1
          // exports hard-fail here (new optional fields); the track/panel
          // count and mesh-track rules stay advisory in validateSlide so
          // legacy imports and old setSlide calls never start failing.
          for (const p of validateSlide(node.slide).filter(
            (msg) =>
              msg.startsWith('at least one panel') ||
              msg.startsWith('interlockMm')
          )) {
            problems.push(`sliding leaf '${node.id}': ${p}`);
          }
        }
      } else if (node.slide) {
        problems.push(`casement leaf '${node.id}' carries a slide spec`);
      }
      return;
    }
    const n = node.children.length;
    if (node.positionsMm.length !== n - 1) {
      problems.push(
        `split '${node.id}': ${n} children but ${node.positionsMm.length} positions`
      );
      return;
    }
    if (node.lockedMm.length !== node.positionsMm.length) {
      problems.push(`split '${node.id}': lockedMm length mismatch`);
    }
    if ((node.dividerKind ?? 'mullion') === 'sash' && node.dividerFaceMm !== 0) {
      problems.push(`sash split '${node.id}' must have dividerFaceMm 0`);
    }
    const face = effectiveFaceMm(node);
    const span = node.axis === 'x' ? w : h;
    for (let i = 1; i < node.positionsMm.length; i++) {
      if (!(node.positionsMm[i] > node.positionsMm[i - 1])) {
        problems.push(`split '${node.id}': positions not strictly increasing`);
      }
    }
    const widths = widthsFromPositions(node.positionsMm, face, span);
    for (const cw of widths) {
      if (cw < minPane - 1e-6) {
        problems.push(
          `split '${node.id}': child daylight ${cw} below minimum ${minPane}`
        );
      }
    }
    // Children sizes always sum to the parent's available daylight span.
    const sum = widths.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - (span - (n - 1) * face)) > 1e-6) {
      problems.push(`split '${node.id}': child sizes do not sum to the span`);
    }
    node.children.forEach((c, i) =>
      node.axis === 'x' ? visit(c, widths[i], h) : visit(c, w, widths[i])
    );
  };
  visit(design.root, widthMm - 2 * f, heightMm - 2 * f);
  return problems;
}
