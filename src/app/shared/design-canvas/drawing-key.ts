/**
 * The key of a window drawing: what its symbols mean, for THIS window only
 * (a fixed light needs no key; a slider does not explain hinges).
 *
 * Pure TS. The saved picture draws it under the window (render-legend.ts)
 * and the designer shows the same items beside the drawing, so the screen,
 * the quotation PDF and the workshop read one convention.
 *
 * The convention: the point of a triangle is on the hinge side; a solid
 * triangle opens outward, a dashed one opens inward; tilt is a second
 * triangle with its point on the bottom rail. An arrow is the way a
 * shutter slides; a circled number is its track, 1 being the outside one.
 */

import {
  WindowDesign,
  findNode,
  glassesOf,
  walkLeaves,
} from '../design-model';

export type KeyGlyph =
  | 'opens-out'
  | 'opens-in'
  | 'tilt'
  | 'slides'
  | 'fixed-shutter'
  | 'mesh'
  | 'track'
  | 'glass';

export interface KeyItem {
  glyph: KeyGlyph;
  text: string;
  /** 'G2', for a glass item. */
  code?: string;
}

export function drawingKey(
  design: WindowDesign,
  glassLabels?: Record<string, string> | null
): KeyItem[] {
  const leaves = walkLeaves(design.root);
  const doorNode = design.door ? findNode(design.root, design.door.doorNodeId) : null;
  const doorIds = new Set(doorNode ? walkLeaves(doorNode).map((l) => l.id) : []);

  let out = false;
  let inward = false;
  let tilt = false;
  let slides = false;
  let fixedShutter = false;
  let mesh = false;
  for (const leaf of leaves) {
    if (leaf.category === 'Slidding' && leaf.slide) {
      slides = slides || leaf.slide.panels.some((p) => !p.fixed);
      fixedShutter = fixedShutter || leaf.slide.panels.some((p) => !!p.fixed);
      mesh = mesh || leaf.slide.mesh;
      continue;
    }
    if (leaf.casementType !== 'Openable') continue;
    const dir = (leaf.opening?.direction ?? 'Left').toLowerCase();
    if (dir.startsWith('tilt')) {
      tilt = true;
      inward = true;
    } else if (doorIds.has(leaf.id) && (design.door?.swing ?? 'In') === 'In') {
      inward = true;
    } else {
      out = true;
    }
  }

  const items: KeyItem[] = [];
  if (out) items.push({ glyph: 'opens-out', text: 'Opens out, point = hinge side' });
  if (inward) {
    items.push({
      glyph: 'opens-in',
      text: out ? 'Dashed = opens in' : 'Opens in (dashed), point = hinge side',
    });
  }
  if (tilt) items.push({ glyph: 'tilt', text: 'Second triangle = tilt' });
  if (slides) items.push({ glyph: 'slides', text: 'Slides this way' });
  if (fixedShutter) items.push({ glyph: 'fixed-shutter', text: 'Fixed shutter' });
  if (mesh) items.push({ glyph: 'mesh', text: 'Fly mesh shutter' });
  if (slides || fixedShutter) items.push({ glyph: 'track', text: 'Track, 1 = outside' });

  glassesOf(design).forEach((id, i) => {
    if (i === 0) return;
    items.push({
      glyph: 'glass',
      code: `G${i + 1}`,
      text: glassLabels?.[String(id)] ?? 'Different glass',
    });
  });
  return items;
}
