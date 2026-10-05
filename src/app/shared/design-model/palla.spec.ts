/**
 * Palla bars (card T127): Split / Transom divide ONE palla. The four cases
 * the owner named: (a) a single fixed window, (b) a 2-sash casement, (c) a
 * 3-track 3-shutter slider with and without mesh, (d) a door with a top
 * light. A divided palla stays one sash / one shutter, so the payload (and
 * with it the price) is the one of the undivided window, and a document
 * saved before bars existed is read back unchanged.
 */

import { addDoorTopLight, makeDoor } from './door';
import { layout } from './geometry';
import { checkInvariants } from './invariants';
import { setLeafSpec, setSlide } from './leaf-ops';
import { splitPane } from './operations';
import {
  PALLA_BAR_EDGE_MM,
  carriesBars,
  checkPallaBars,
  movePallaBar,
  pallaBarLayouts,
  pallaBarsOf,
  removePallaBar,
  splitPalla,
} from './palla';
import { toPayload } from './payload';
import { parse, serialize } from './serialize';
import { setSlideMesh } from './slide';
import { singleFixed, slidingThreeTrackMesh, twoSashOpenable } from './testing/fixtures';
import { DesignError, LeafNode, WindowDesign, findNode, isSplit, walkLeaves } from './types';

const OPTS = { frameFaceMm: 60 };

function leafOf(d: WindowDesign, id: string): LeafNode {
  return findNode(d.root, id) as LeafNode;
}

function doorWithTopLight(): WindowDesign {
  const base = singleFixed();
  return addDoorTopLight(
    makeDoor({ ...base, frame: { ...base.frame, widthMm: 1800, heightMm: 2400 } }, 'p1', {
      leaves: 2,
      swing: 'Out',
      threshold: 'Low',
    }),
    300,
    { dividerFaceMm: 60 }
  );
}

describe('palla bars', () => {
  it('(a) single fixed window: plain glass carries no bar, it takes a frame divider', () => {
    const d = singleFixed();
    expect(carriesBars(leafOf(d, 'p1'))).toBeFalse();
    expect(() => splitPalla(d, { paneId: 'p1' }, 'x', 0.5, OPTS)).toThrowError(DesignError);
    const split = splitPane(d, 'p1', 'x', 690, { dividerFaceMm: 60 });
    expect(isSplit(split.root)).toBeTrue();
    expect(walkLeaves(split.root).every((l) => !l.bars)).toBeTrue();
  });

  it('(b) 2-sash casement: only the chosen sash is divided, and it stays one sash', () => {
    const d = twoSashOpenable();
    const [left, right] = walkLeaves(d.root);
    const split = splitPalla(d, { paneId: left.id }, 'x', 0.5, OPTS);
    expect(walkLeaves(split.root).length).toBe(2);
    expect(leafOf(split, left.id).bars).toEqual({ axis: 'x', at: [0.5] });
    expect(leafOf(split, right.id).bars).toBeUndefined();
    expect(leafOf(split, left.id).casementType).toBe('Openable');
    expect(leafOf(split, left.id).opening).toEqual(left.opening);
    expect(checkInvariants(split)).toEqual([]);
    // The other way on the same sash is refused: one direction per palla.
    expect(() => splitPalla(split, { paneId: left.id }, 'y', 0.5, OPTS)).toThrowError(DesignError);
    // A top vent over a bottom pane on the OTHER sash is its own bar.
    const both = splitPalla(split, { paneId: right.id }, 'y', 0.3, OPTS);
    expect(leafOf(both, right.id).bars).toEqual({ axis: 'y', at: [0.3] });
    expect(leafOf(both, left.id).bars).toEqual({ axis: 'x', at: [0.5] });
  });

  for (const mesh of [true, false]) {
    it(`(c) 3-track 3-shutter slider ${mesh ? 'with' : 'without'} mesh: only the chosen shutter is divided`, () => {
      const d = mesh ? slidingThreeTrackMesh() : setSlideMesh(slidingThreeTrackMesh(), 'p1', false);
      const split = splitPalla(d, { paneId: 'p1', panelIndex: 1 }, 'y', 0.5, OPTS);
      const slide = leafOf(split, 'p1').slide!;
      expect(slide.panels.length).toBe(3);
      expect(slide.mesh).toBe(mesh);
      expect(slide.panels.map((p) => p.bars)).toEqual([undefined, { axis: 'y', at: [0.5] }, undefined]);
      expect(leafOf(split, 'p1').bars).toBeUndefined();
      expect(checkInvariants(split)).toEqual([]);
      // The bar lies inside shutter 2 and nowhere else.
      const bars = pallaBarLayouts(layout(split, OPTS));
      expect(bars.length).toBe(1);
      expect(bars[0].panelIndex).toBe(1);
      expect(bars[0].rect.xMm).toBeGreaterThanOrEqual(bars[0].palla.xMm);
      expect(bars[0].rect.xMm + bars[0].rect.wMm).toBeLessThanOrEqual(bars[0].palla.xMm + bars[0].palla.wMm);
      expect(() => splitPalla(d, { paneId: 'p1', panelIndex: 3 }, 'x', 0.5, OPTS)).toThrowError(DesignError);
      expect(toPayload(split, OPTS)).toEqual(toPayload(d, OPTS));
    });
  }

  it('(d) door with a top light: a leaf carries its own bar, the top light takes a frame divider', () => {
    const d = doorWithTopLight();
    const [light, leafA, leafB] = walkLeaves(d.root);
    expect(carriesBars(light)).toBeFalse();
    expect(carriesBars(leafA)).toBeTrue();
    const split = splitPalla(d, { paneId: leafA.id }, 'y', 0.5, OPTS);
    expect(walkLeaves(split.root).length).toBe(3);
    expect(leafOf(split, leafA.id).bars).toEqual({ axis: 'y', at: [0.5] });
    expect(leafOf(split, leafB.id).bars).toBeUndefined();
    expect(leafOf(split, light.id).bars).toBeUndefined();
    expect(leafOf(split, leafA.id).opening).toEqual(leafA.opening);
    expect(checkInvariants(split)).toEqual([]);
    expect(toPayload(split, OPTS)).toEqual(toPayload(d, OPTS));
  });

  it('a bar moves inside its palla, kept clear of the edges, and is removed again', () => {
    const d = twoSashOpenable();
    const id = walkLeaves(d.root)[0].id;
    const ref = { paneId: id };
    const split = splitPalla(d, ref, 'y', 0.5, OPTS);
    const moved = movePallaBar(split, ref, 0, 0.3, OPTS);
    expect(leafOf(moved, id).bars).toEqual({ axis: 'y', at: [0.3] });
    const hMm = layout(d, OPTS).nodes.get(id)!.rect.hMm;
    const top = movePallaBar(split, ref, 0, 0, OPTS);
    expect(leafOf(top, id).bars!.at[0]).toBeCloseTo(PALLA_BAR_EDGE_MM / hMm, 9);
    expect(movePallaBar(split, ref, 0, 0.5, OPTS)).toBe(split);
    // A second bar halves a part; removing the bars one by one merges back.
    const two = splitPalla(split, ref, 'y', 0.75, OPTS);
    expect(leafOf(two, id).bars!.at).toEqual([0.5, 0.75]);
    const one = removePallaBar(two, ref, 0);
    expect(leafOf(one, id).bars).toEqual({ axis: 'y', at: [0.75] });
    const none = removePallaBar(one, ref, 0);
    expect('bars' in leafOf(none, id)).toBeFalse();
    expect(none).toEqual(d);
    expect(() => removePallaBar(none, ref, 0)).toThrowError(DesignError);
  });

  it('bars are dropped when the palla stops being one', () => {
    const d = twoSashOpenable();
    const id = walkLeaves(d.root)[0].id;
    const split = splitPalla(d, { paneId: id }, 'x', 0.5, OPTS);
    const slider = setSlide(split, id, {
      tracks: '2 Track',
      mesh: false,
      panels: [
        { widthMm: 345, direction: 'Left' },
        { widthMm: 345, direction: 'Right' },
      ],
    });
    expect(pallaBarsOf(leafOf(slider, id), 0)).toBeUndefined();
    expect(leafOf(slider, id).bars).toBeUndefined();
    expect(checkPallaBars(slider.root)).toEqual([]);
    const fixed = setLeafSpec(
      splitPalla(singleFixedOpenable(), { paneId: 'p1' }, 'x', 0.5, OPTS),
      'p1',
      { casementType: 'Fixed' }
    );
    expect(leafOf(fixed, 'p1').sashFramed ? 'kept' : leafOf(fixed, 'p1').bars).toBeUndefined();
  });

  it('stored bars are checked: outside the palla, not increasing, on a sliding leaf', () => {
    const d = twoSashOpenable();
    const id = walkLeaves(d.root)[0].id;
    const bad = JSON.parse(JSON.stringify(d)) as WindowDesign;
    (findNode(bad.root, id) as LeafNode).bars = { axis: 'x', at: [0.6, 0.4, 1.2] };
    const problems = checkPallaBars(bad.root);
    expect(problems.some((p) => p.includes('strictly increasing'))).toBeTrue();
    expect(problems.some((p) => p.includes('outside the palla'))).toBeTrue();
    expect(checkInvariants(bad).length).toBeGreaterThan(0);
    const slider = JSON.parse(JSON.stringify(slidingThreeTrackMesh())) as WindowDesign;
    (slider.root as LeafNode).bars = { axis: 'x', at: [0.5] };
    expect(checkPallaBars(slider.root).some((p) => p.includes('not on a shutter'))).toBeTrue();
  });

  it('an old document (no bars) round-trips unchanged, with the payload it had', () => {
    for (const d of [singleFixed(), twoSashOpenable(), slidingThreeTrackMesh(), doorWithTopLight()]) {
      const text = serialize(d);
      expect(text.includes('"bars"')).toBeFalse();
      const back = parse(text);
      expect(back).toEqual(d);
      expect(serialize(back)).toBe(text);
      expect(toPayload(back, OPTS)).toEqual(toPayload(d, OPTS));
      expect(pallaBarLayouts(layout(back, OPTS))).toEqual([]);
    }
  });

  it('a divided document round-trips, and its payload is the undivided one', () => {
    const d = twoSashOpenable();
    const id = walkLeaves(d.root)[0].id;
    const split = splitPalla(d, { paneId: id }, 'y', 0.4, OPTS);
    const back = parse(serialize(split));
    expect(back).toEqual(split);
    expect(checkInvariants(back)).toEqual([]);
    expect(toPayload(back, OPTS)).toEqual(toPayload(d, OPTS));
    // Resizing the window does not rewrite the bar: it is a fraction of the palla.
    const wide = { ...back, frame: { ...back.frame, widthMm: 2000 } };
    expect(pallaBarLayouts(layout(wide, OPTS))[0].rect.hMm).toBe(40);
  });
});

function singleFixedOpenable(): WindowDesign {
  return setLeafSpec(singleFixed(), 'p1', {
    category: 'Casement',
    casementType: 'Openable',
    opening: { direction: 'Left', handleId: 3, hingesType: 'Friction' },
  });
}
