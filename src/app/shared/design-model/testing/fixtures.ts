/**
 * Shared test fixtures: the reference designs behind the golden payload
 * suite. Ids used: casement frame product 8, sliding frame product 23,
 * sash 12 (casement) / 31 (sliding), mullion profile 55, colour 4,
 * glass 1, handle 3/5 — the id vocabulary of designer-architecture §1.
 */

// The project's karma test entry is auto-generated (no src/test.ts in
// angular.json) and does not load zone.js/testing itself; Angular's global
// beforeEach needs it. Loading it here covers every design-model spec.
import 'zone.js/testing';

import { createDesign, createLeaf, setSlide, splitPane, splitPaneEqualSash, setLeafSpec } from '../operations';
import { WindowDesign } from '../types';

/** Single fixed casement, 1500×1200 (the designer's blank state, priced). */
export function singleFixed(): WindowDesign {
  return createDesign({
    frame: { widthMm: 1500, heightMm: 1200, productId: 8, colorId: 4 },
    glazing: { glassId: 1 },
  });
}

/** 2-sash openable casement, 1500×1200, handle 3, friction hinges. */
export function twoSashOpenable(): WindowDesign {
  const base = createDesign({
    frame: { widthMm: 1500, heightMm: 1200, productId: 8, colorId: 4 },
    glazing: { glassId: 1 },
    root: createLeaf('p1', {
      casementType: 'Openable',
      sashId: 12,
      opening: { direction: 'Left', handleId: 3, hingesType: 'Friction' },
    }),
  });
  return splitPaneEqualSash(base, 'p1', 2);
}

/** 2-track sliding, 2000×1500, two 940 panels, no fly mesh. */
export function slidingTwoTrack(): WindowDesign {
  const base = createDesign({
    frame: { widthMm: 2000, heightMm: 1500, productId: 23, colorId: 4 },
    glazing: { glassId: 1 },
    root: createLeaf('p1', { sashId: 31 }),
  });
  return setSlide(base, 'p1', {
    tracks: '2 Track',
    mesh: false,
    panels: [
      { widthMm: 940, direction: 'Left' },
      { widthMm: 940, direction: 'Right' },
    ],
  });
}

/** Worked example A: 3-track sliding with fly mesh, 2400×1380, 3×760. */
export function slidingThreeTrackMesh(): WindowDesign {
  const base = createDesign({
    frame: { widthMm: 2400, heightMm: 1380, productId: 23, colorId: 4 },
    glazing: { glassId: 1 },
    root: createLeaf('p1', { sashId: 31 }),
  });
  return setSlide(base, 'p1', {
    tracks: '3 Track',
    mesh: true,
    panels: [
      { widthMm: 760, direction: 'Left' },
      { widthMm: 760, direction: 'Left' },
      { widthMm: 760, direction: 'Right' },
    ],
  });
}

/** Vertical mullion at centre (1500×1200, profile 55): two 660 panes. */
export function verticalMullion(): WindowDesign {
  const base = singleFixed();
  return splitPane(base, 'p1', 'x', 690, {
    dividerProfileId: 55,
    dividerFaceMm: 60,
  });
}

/** Horizontal transom at centre (1500×1200, profile 55): two 510 panes. */
export function horizontalTransom(): WindowDesign {
  const base = singleFixed();
  return splitPane(base, 'p1', 'y', 540, {
    dividerProfileId: 55,
    dividerFaceMm: 60,
  });
}

/**
 * Worked example B: 2400×1380, vertical mullion at 900, right column
 * split by a transom at 600; left fixed, top-right awning openable,
 * bottom-right fixed.
 */
export function mixedExampleB(): WindowDesign {
  let d = createDesign({
    frame: { widthMm: 2400, heightMm: 1380, productId: 8, colorId: 4 },
    glazing: { glassId: 1 },
  });
  d = splitPane(d, 'p1', 'x', 900, { dividerProfileId: 55, dividerFaceMm: 60 });
  // p1 is now the split; children p2 (left), p3 (right).
  d = splitPane(d, 'p3', 'y', 600, { dividerProfileId: 55, dividerFaceMm: 60 });
  // p3 is now the y-split; children p4 (top), p5 (bottom).
  d = setLeafSpec(d, 'p4', {
    casementType: 'Openable',
    sashId: 12,
    opening: { direction: 'Top', handleId: 5, hingesType: 'Friction' },
  });
  return d;
}
