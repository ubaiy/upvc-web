/**
 * Geometry tests: the positions↔widths algebra, layout spans, divider
 * runs and snapping — the shared math that keeps drawing, labels and
 * priced sizes identical (the B2 bug class, prevented structurally).
 */

import {
  dividerRangeMm,
  layout,
  positionsFromWidths,
  snapDividerMm,
  widthsFromPositions,
} from './geometry';
import { mixedExampleB, verticalMullion } from './testing/fixtures';
import { SplitNode, isSplit } from './types';

describe('positions ↔ widths algebra', () => {
  it('widthsFromPositions matches the legacy avail-span arithmetic', () => {
    // 1500 frame → 1380 daylight, centre mullion face 60 → two 660 panes.
    expect(widthsFromPositions([690], 60, 1380)).toEqual([660, 660]);
    // sash split (face 0): plain halves.
    expect(widthsFromPositions([690], 0, 1380)).toEqual([690, 690]);
    // no divider: the whole span.
    expect(widthsFromPositions([], 60, 1380)).toEqual([1380]);
  });

  it('positionsFromWidths is the exact inverse', () => {
    for (const [widths, face] of [
      [[660, 660], 60],
      [[870, 1350], 60],
      [[760, 760, 760], 0],
      [[300, 500, 400, 200], 25],
    ] as Array<[number[], number]>) {
      const span =
        widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * face;
      const positions = positionsFromWidths(widths, face);
      expect(widthsFromPositions(positions, face, span)).toEqual(widths);
    }
  });

  it('widths always sum to span − (n−1)·face (fuzz)', () => {
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(rnd() * 5);
      const face = Math.floor(rnd() * 80);
      const span = 500 + rnd() * 5000;
      const positions: number[] = [];
      let p = face / 2;
      for (let i = 0; i < n - 1; i++) {
        p += 1 + rnd() * ((span - p) / n);
        positions.push(p);
      }
      const widths = widthsFromPositions(positions, face, span);
      const sum = widths.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(span - (n - 1) * face, 6);
    }
  });
});

describe('layout', () => {
  it('computes the daylight interior from the frame face', () => {
    const lay = layout(verticalMullion());
    expect(lay.daylight).toEqual({ xMm: 60, yMm: 60, wMm: 1380, hMm: 1080 });
  });

  it('positions leaves with divider gaps between them', () => {
    const lay = layout(verticalMullion());
    expect(lay.leaves.length).toBe(2);
    const [left, right] = lay.leaves.map((l) => l.rect);
    expect(left).toEqual({ xMm: 60, yMm: 60, wMm: 660, hMm: 1080 });
    expect(right).toEqual({ xMm: 60 + 660 + 60, yMm: 60, wMm: 660, hMm: 1080 });
  });

  it('divider runs span the content size, in the legacy emit order', () => {
    const lay = layout(mixedExampleB());
    expect(
      lay.dividers.map((d) => ({ dir: d.direction, len: d.lengthMm }))
    ).toEqual([
      { dir: 'vertical', len: 1260 },
      { dir: 'horizontal', len: 1350 },
    ]);
  });

  it('respects a custom frame face width', () => {
    const lay = layout(verticalMullion(), { frameFaceMm: 70 });
    expect(lay.daylight.wMm).toBe(1360);
  });
});

describe('divider range & snapping', () => {
  function rootSplit(): SplitNode {
    const d = verticalMullion();
    if (!isSplit(d.root)) throw new Error('fixture root must be a split');
    return d.root;
  }

  it('dividerRangeMm keeps both neighbours above minimum', () => {
    const range = dividerRangeMm(rootSplit(), 1380, 0);
    expect(range.minMm).toBe(80); // 30 face half + 50 min
    expect(range.maxMm).toBe(1300);
  });

  it('snaps to the midpoint within tolerance', () => {
    expect(snapDividerMm(rootSplit(), 1380, 0, 694)).toBe(690);
  });

  it('snaps to sibling divider alignment', () => {
    expect(
      snapDividerMm(rootSplit(), 1380, 0, 894, { siblingPositionsMm: [900] })
    ).toBe(900);
  });

  it('falls back to the 10 mm grid outside target tolerance', () => {
    expect(snapDividerMm(rootSplit(), 1380, 0, 444)).toBe(440);
  });

  it('never snaps outside the valid range', () => {
    expect(snapDividerMm(rootSplit(), 1380, 0, 2)).toBe(80);
  });
});
