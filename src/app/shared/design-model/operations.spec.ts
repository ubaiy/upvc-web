/**
 * Unit tests for every model operation and invariant (architecture §6.1).
 * Each op must: return a NEW document, leave the input untouched, and
 * never produce a design that fails checkInvariants.
 */

import { layout, widthsFromPositions, MIN_PANE_MM } from './geometry';
import {
  createDesign,
  createLeaf,
  equalize,
  moveDivider,
  removeDivider,
  resizeFrame,
  setDividerMm,
  setGlazing,
  setLeafSpec,
  setPaneSizeMm,
  setSlide,
  splitPane,
  splitPaneEqualSash,
} from './operations';
import { checkInvariants } from './invariants';
import { mixedExampleB, slidingThreeTrackMesh } from './testing/fixtures';
import { DesignError, SplitNode, WindowDesign, isSplit, walkLeaves } from './types';

function mullionAt(
  d: WindowDesign,
  position: number,
  axis: 'x' | 'y' = 'x'
): WindowDesign {
  return splitPane(d, 'p1', axis, position, {
    dividerProfileId: 55,
    dividerFaceMm: 60,
  });
}

function rootSplit(d: WindowDesign): SplitNode {
  if (!isSplit(d.root)) throw new Error('root is not a split');
  return d.root;
}

describe('design operations', () => {
  let base: WindowDesign;
  beforeEach(() => {
    base = createDesign({
      frame: { widthMm: 1500, heightMm: 1200, productId: 8, colorId: 4 },
      glazing: { glassId: 1 },
    });
  });

  describe('splitPane', () => {
    it('splits a leaf into two children inheriting its spec', () => {
      const d = mullionAt(base, 690);
      const split = rootSplit(d);
      expect(split.positionsMm).toEqual([690]);
      expect(split.lockedMm).toEqual([false]);
      expect(split.children.length).toBe(2);
      expect(walkLeaves(d.root).every((l) => l.category === 'Casement')).toBeTrue();
      expect(checkInvariants(d)).toEqual([]);
    });

    it('does not mutate the input design', () => {
      const before = JSON.stringify(base);
      mullionAt(base, 690);
      expect(JSON.stringify(base)).toBe(before);
    });

    it('clamps the position to keep both children above minimum size', () => {
      const d = mullionAt(base, 5); // span 1380, face 60 → min centreline 80
      expect(rootSplit(d).positionsMm[0]).toBe(60 / 2 + MIN_PANE_MM);
      expect(checkInvariants(d)).toEqual([]);
    });

    it('refuses to split a pane that is too small', () => {
      const tiny = createDesign({ frame: { widthMm: 250, heightMm: 1200 } });
      // daylight 130 < 2×50 + 60
      expect(() => mullionAt(tiny, 65)).toThrowError(DesignError);
    });

    it('refuses to split a split node', () => {
      const d = mullionAt(base, 690);
      expect(() => splitPane(d, 'p1', 'x', 300)).toThrowError(DesignError);
    });
  });

  describe('moveDivider / setDividerMm', () => {
    it('moves the divider and keeps lock state', () => {
      const d = moveDivider(mullionAt(base, 690), 'p1', 0, 500);
      expect(rootSplit(d).positionsMm).toEqual([500]);
      expect(rootSplit(d).lockedMm).toEqual([false]);
    });

    it('clamps to the neighbour minimum', () => {
      const d = moveDivider(mullionAt(base, 690), 'p1', 0, 5000);
      // span 1380 → max = 1380 − 30 − 50
      expect(rootSplit(d).positionsMm).toEqual([1300]);
      expect(checkInvariants(d)).toEqual([]);
    });

    it('setDividerMm moves AND locks (typed exact-mm semantics)', () => {
      const d = setDividerMm(mullionAt(base, 690), 'p1', 0, 900);
      expect(rootSplit(d).positionsMm).toEqual([900]);
      expect(rootSplit(d).lockedMm).toEqual([true]);
    });
  });

  describe('setPaneSizeMm', () => {
    it('sets the first pane width by moving its right divider, locked', () => {
      const d = setPaneSizeMm(mullionAt(base, 690), 'p2', 900);
      // left edge 0, want 900 → centreline 930
      expect(rootSplit(d).positionsMm).toEqual([930]);
      expect(rootSplit(d).lockedMm).toEqual([true]);
      const widths = widthsFromPositions(rootSplit(d).positionsMm, 60, 1380);
      expect(widths[0]).toBe(900);
    });

    it('sets the LAST pane width by moving its left divider', () => {
      const d = setPaneSizeMm(mullionAt(base, 690), 'p3', 400);
      // span 1380 → centreline 1380 − 400 − 30 = 950
      expect(rootSplit(d).positionsMm).toEqual([950]);
      const widths = widthsFromPositions(rootSplit(d).positionsMm, 60, 1380);
      expect(widths[1]).toBe(400);
    });
  });

  describe('equalize', () => {
    it('equalises children and clears locks', () => {
      let d = setDividerMm(mullionAt(base, 690), 'p1', 0, 900);
      d = equalize(d, 'p1');
      expect(rootSplit(d).positionsMm).toEqual([690]);
      expect(rootSplit(d).lockedMm).toEqual([false]);
      const widths = widthsFromPositions([690], 60, 1380);
      expect(widths).toEqual([660, 660]);
    });
  });

  describe('removeDivider', () => {
    it('merges two children back into one leaf (split collapses)', () => {
      const d = removeDivider(mullionAt(base, 690), 'p1', 0);
      expect(d.root.kind).toBe('leaf');
      expect(d.root.id).toBe('p1');
      expect(checkInvariants(d)).toEqual([]);
    });

    it('keeps the left child spec on merge', () => {
      let d = mullionAt(base, 690);
      d = setLeafSpec(d, 'p2', {
        casementType: 'Openable',
        opening: { direction: 'Right', handleId: 3, hingesType: 'Friction' },
      });
      d = removeDivider(d, 'p1', 0);
      const leaf = walkLeaves(d.root)[0];
      expect(leaf.casementType).toBe('Openable');
      expect(leaf.opening?.direction).toBe('Right');
    });

    it('removes one of several dividers and keeps the rest', () => {
      // Hand-built 3-column split (multi-divider splits come from legacy
      // import; interactive splits always nest).
      const three: WindowDesign = {
        ...base,
        root: {
          id: 'p1',
          kind: 'split',
          axis: 'x',
          dividerKind: 'mullion',
          dividerProfileId: 55,
          dividerFaceMm: 60,
          positionsMm: [400, 900],
          lockedMm: [false, false],
          children: [createLeaf('p2'), createLeaf('p3'), createLeaf('p4')],
        },
      };
      expect(checkInvariants(three)).toEqual([]);
      const d = removeDivider(three, 'p1', 0);
      expect(rootSplit(d).positionsMm).toEqual([900]);
      expect(rootSplit(d).children.length).toBe(2);
      expect(checkInvariants(d)).toEqual([]);
    });
  });

  describe('setLeafSpec / setSlide', () => {
    it('clears opening when switching to Fixed', () => {
      let d = setLeafSpec(base, 'p1', {
        casementType: 'Openable',
        opening: { direction: 'Left', handleId: 3, hingesType: 'Friction' },
      });
      d = setLeafSpec(d, 'p1', { casementType: 'Fixed' });
      expect(walkLeaves(d.root)[0].opening).toBeUndefined();
    });

    it('setSlide converts a leaf to a sliding section', () => {
      const d = setSlide(base, 'p1', {
        tracks: '2 Track',
        mesh: false,
        panels: [
          { widthMm: 690, direction: 'Left' },
          { widthMm: 690, direction: 'Right' },
        ],
      });
      const leaf = walkLeaves(d.root)[0];
      expect(leaf.category).toBe('Slidding');
      expect(leaf.casementType).toBeUndefined();
      expect(leaf.slide?.panels.length).toBe(2);
      expect(checkInvariants(d)).toEqual([]);
    });

    it('rejects empty or non-positive panels', () => {
      expect(() =>
        setSlide(base, 'p1', { tracks: '2 Track', mesh: false, panels: [] })
      ).toThrowError(DesignError);
      expect(() =>
        setSlide(base, 'p1', {
          tracks: '2 Track',
          mesh: false,
          panels: [{ widthMm: 0, direction: 'Left' }],
        })
      ).toThrowError(DesignError);
    });
  });

  describe('resizeFrame', () => {
    it('scales unlocked dividers proportionally', () => {
      let d = mullionAt(base, 690);
      d = resizeFrame(d, 2400, 1200);
      // old span 1380 → new span 2280; 690 × (2280/1380) = 1140
      expect(rootSplit(d).positionsMm[0]).toBeCloseTo(1140, 6);
      expect(checkInvariants(d)).toEqual([]);
    });

    it('locked dividers keep their mm offset', () => {
      let d = setDividerMm(mullionAt(base, 690), 'p1', 0, 900);
      d = resizeFrame(d, 2400, 1200);
      expect(rootSplit(d).positionsMm).toEqual([900]);
    });

    it('locked dividers are clamped back inside a shrunken frame', () => {
      let d = setDividerMm(mullionAt(base, 690), 'p1', 0, 1200);
      d = resizeFrame(d, 600, 1200); // daylight 480
      const span = 480;
      const pos = rootSplit(d).positionsMm[0];
      expect(pos).toBeLessThanOrEqual(span - 30 - MIN_PANE_MM);
      expect(checkInvariants(d)).toEqual([]);
    });

    it('clamps the frame to the form bounds (200–5800)', () => {
      const d = resizeFrame(base, 100, 9000);
      expect(d.frame.widthMm).toBe(200);
      expect(d.frame.heightMm).toBe(5800);
    });

    it('scales sliding panels with the daylight width', () => {
      let d = slidingThreeTrackMesh(); // 2400 wide, 3×760
      d = resizeFrame(d, 1200, 1380); // daylight 2280 → 1080
      const leaf = walkLeaves(d.root)[0];
      expect(leaf.slide?.panels[0].widthMm).toBeCloseTo(360, 6);
      expect(checkInvariants(d)).toEqual([]);
    });
  });

  describe('splitPaneEqualSash', () => {
    it('creates n equal sash divisions alternating Left/Right', () => {
      const d = splitPaneEqualSash(base, 'p1', 3);
      const split = rootSplit(d);
      expect(split.dividerKind).toBe('sash');
      expect(split.dividerFaceMm).toBe(0);
      expect(split.positionsMm).toEqual([460, 920]);
      const leaves = walkLeaves(d.root);
      expect(leaves.map((l) => l.opening?.direction)).toEqual([
        'Left',
        'Right',
        'Left',
      ]);
      expect(checkInvariants(d)).toEqual([]);
    });

    it('a single division still produces a (1-child) sash split', () => {
      const d = splitPaneEqualSash(base, 'p1', 1);
      expect(isSplit(d.root)).toBeTrue();
      expect(rootSplit(d).children.length).toBe(1);
      expect(checkInvariants(d)).toEqual([]);
    });
  });

  describe('invariants', () => {
    it('accepts every fixture', () => {
      expect(checkInvariants(mixedExampleB())).toEqual([]);
      expect(checkInvariants(slidingThreeTrackMesh())).toEqual([]);
    });

    it('flags unordered positions', () => {
      const d = mullionAt(base, 690);
      const broken: WindowDesign = {
        ...d,
        root: { ...rootSplit(d), positionsMm: [900, 300], lockedMm: [false, false], children: [...rootSplit(d).children, createLeaf('px')] },
      };
      expect(checkInvariants(broken).join(' ')).toContain('strictly increasing');
    });

    it('flags a pane below minimum and sliding panels under-summing', () => {
      const d = mullionAt(base, 690);
      const squeezed: WindowDesign = {
        ...d,
        root: { ...rootSplit(d), positionsMm: [40] },
      };
      expect(checkInvariants(squeezed).join(' ')).toContain('below minimum');

      const s = setSlide(base, 'p1', {
        tracks: '3 Track',
        mesh: true,
        panels: [
          { widthMm: 100, direction: 'Left' },
          { widthMm: 100, direction: 'Right' },
        ],
      });
      expect(checkInvariants(s).join(' ')).toContain('panels sum');
    });

    it('children sizes always sum to the parent daylight span (layout law)', () => {
      const d = mixedExampleB();
      const lay = layout(d);
      // left pane (870) + right column (1350) + 60 face = 2280 daylight
      const left = lay.nodes.get('p2')!.rect.wMm;
      const rightColumn = lay.nodes.get('p3')!.rect.wMm;
      expect(left + rightColumn + 60).toBeCloseTo(2280, 9);
      // and the right column's rows sum to its daylight height
      const top = lay.nodes.get('p4')!.rect.hMm;
      const bottom = lay.nodes.get('p5')!.rect.hMm;
      expect(top + bottom + 60).toBeCloseTo(1260, 9);
    });
  });

  describe('setGlazing / frame spec', () => {
    it('patches glazing immutably', () => {
      const d = setGlazing(base, { barsV: 2 });
      expect(d.glazing.barsV).toBe(2);
      expect(base.glazing.barsV).toBe(0);
    });
  });
});
