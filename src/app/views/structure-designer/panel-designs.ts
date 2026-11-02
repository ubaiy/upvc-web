/**
 * The window of each wall panel. A panel is a real window (a WindowDesign):
 * it starts as the starting window of the window designer that matches how
 * the panel opens, is fitted to the size and shape of its own panel, and is
 * fitted again whenever the structure is stretched. Pure.
 */

import {
  checkInvariants,
  createTemplate,
  instantiateTemplate,
  setFrameShape,
  setLeafSpec,
  walkLeaves,
  WindowDesign,
} from '../../shared/design-model';
import { Face, FaceFill, FaceOpening, openingOfDesign, setFaceDesigns, Structure, windowFrameOf, WindowFrameSpec } from '../../shared/structure-model';
import { FRAME_FACE_MM } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog';
import { STARTING_DESIGNS } from '../quotation/sub-quotation/sub-quotation-design/starting-designs';

export { noWindowReason } from '../../shared/structure-model';

/** The starting design of the window designer that a panel opening begins as. */
const START_KEY: Record<FaceOpening, string> = {
  fixed: 'fixed',
  casement: 'casement-1',
  'top-hung': 'casement-1',
  door: 'door',
  sliding: 'slider-2',
};

function baseDesign(opening: FaceOpening): WindowDesign {
  const key = START_KEY[opening];
  const built = (STARTING_DESIGNS.find((d) => d.key === key) ?? STARTING_DESIGNS[0]).build();
  if (opening !== 'top-hung') return built;
  const leaf = walkLeaves(built.root)[0];
  return setLeafSpec(built, leaf.id, { opening: { direction: 'Top', handleId: null, hingesType: null } });
}

/** A sliding window runs on a straight sill and a door has a threshold: neither is cut to a shaped frame. */
function needsStraightFrame(design: WindowDesign): boolean {
  return design.productType === 'Door' || walkLeaves(design.root).some((l) => l.category === 'Slidding');
}

const sameShape = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function fits(design: WindowDesign, spec: WindowFrameSpec): boolean {
  return design.frame.widthMm === spec.widthMm && design.frame.heightMm === spec.heightMm && sameShape(design.frame.shape, spec.shape);
}

/**
 * A design cut to the size and shape of a panel, its choices kept (proportional dividers). The very
 * same design when it fits already; null when the panel cannot be a window or this design cannot take its shape.
 */
export function fitDesign(design: WindowDesign, face: Face): WindowDesign | null {
  const spec = windowFrameOf(face);
  if (!spec) return null;
  if (fits(design, spec)) return design;
  if (spec.shape.kind !== 'rect' && needsStraightFrame(design)) return null;
  try {
    const opts = { frameFaceMm: FRAME_FACE_MM };
    let next = design.frame.shape.kind === 'rect' ? design : setFrameShape(design, { kind: 'rect' }, opts);
    next = instantiateTemplate(createTemplate(next, 'panel'), spec.widthMm, spec.heightMm, opts).design;
    if (next.frame.widthMm !== spec.widthMm || next.frame.heightMm !== spec.heightMm) return null;
    if (spec.shape.kind !== 'rect') next = setFrameShape(next, spec.shape, opts);
    return checkInvariants(next, opts).length ? null : next;
  } catch {
    return null;
  }
}

/** The starting window for a panel that opens this way, at the size and shape of the panel; null when it cannot be a window. */
export function startingWindow(face: Face, opening: FaceOpening): WindowDesign | null {
  // A shaped panel can be fixed or open on a hinge; a door or a slider needs a straight frame.
  return fitDesign(baseDesign(opening), face) ?? (opening === 'fixed' ? null : fitDesign(baseDesign('fixed'), face));
}

/**
 * Every panel that is a window has its window, fitted to its panel; a panel that cannot be a window is
 * plain glass. The very same document when nothing needed doing.
 */
export function withWindows(structure: Structure): Structure {
  const starts = new Map<string, WindowDesign | null>();
  const starting = (face: Face, opening: FaceOpening): WindowDesign | null => {
    const key = `${opening}|${JSON.stringify(face.outline.map((p) => p.map((v) => Math.round(v))))}`;
    if (!starts.has(key)) starts.set(key, startingWindow(face, opening));
    return starts.get(key) ?? null;
  };
  let changed = false;
  const faces = structure.faces.map((face) => {
    const fill = face.fill;
    if (fill.kind !== 'design') return face;
    const design = (fill.design ? fitDesign(fill.design, face) : null) ?? starting(face, fill.opening);
    if (!design) {
      changed = true;
      const plain: FaceFill = { kind: 'glass', glassId: null };
      return { ...face, fill: plain };
    }
    if (design === fill.design) return face;
    changed = true;
    return { ...face, fill: { kind: 'design', opening: openingOfDesign(design), design } as FaceFill };
  });
  return changed ? { ...structure, faces } : structure;
}

/**
 * One design for several panels, each fitted to its own panel. A panel that cannot take it (a slider on a
 * pointed frame) keeps its window and is named in `kept`.
 */
export function applyDesign(structure: Structure, faceIds: string[], design: WindowDesign): { structure: Structure; kept: string[] } {
  const given = new Map<string, WindowDesign>();
  const kept: string[] = [];
  for (const id of faceIds) {
    const face = structure.faces.find((f) => f.id === id);
    if (!face || face.fill.kind !== 'design') continue;
    const fitted = fitDesign(design, face);
    if (fitted) given.set(id, fitted);
    else kept.push(id);
  }
  return { structure: setFaceDesigns(structure, given), kept };
}
