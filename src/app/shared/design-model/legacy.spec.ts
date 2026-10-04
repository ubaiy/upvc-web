/**
 * Legacy importer tests — the §5 loader priority chain. The strongest
 * property we can pin: importing the full_window snapshot of a design and
 * re-deriving the payload reproduces the ORIGINAL payload byte-for-byte
 * (so a reopened line prices exactly as saved).
 */

import { fromFlatLegacy, fromFullWindow, fromLegacy } from './legacy';
import { toPayload } from './payload';
import { serialize } from './serialize';
import { isLeaf, isSplit, walkLeaves } from './types';
import {
  mixedExampleB,
  singleFixed,
  slidingThreeTrackMesh,
  twoSashOpenable,
  verticalMullion,
} from './testing/fixtures';
import { WindowDesign } from './types';

/** Simulate what the api stores under old_post_data.full_window. */
function fullWindowOf(design: WindowDesign): {
  width: number;
  height: number;
  parts: object[];
  mullion: object[];
} {
  const p = toPayload(design);
  return {
    width: p.width,
    height: p.height,
    parts: JSON.parse(JSON.stringify(p.parts)),
    mullion: JSON.parse(JSON.stringify(p.mullion)),
  };
}

describe('fromLegacy loader chain', () => {
  it('priority 1: old_post_data.design wins and is lossless', () => {
    const d = mixedExampleB();
    const imported = fromLegacy({
      design: serialize(d),
      full_window: fullWindowOf(singleFixed()), // decoy — must be ignored
    });
    expect(imported.source).toBe('design');
    expect(imported.confidence).toBe('exact');
    expect(imported.design).toEqual(d);
  });

  it('priority 2: full_window used when design is absent', () => {
    const imported = fromLegacy({ full_window: fullWindowOf(singleFixed()) });
    expect(imported.source).toBe('full_window');
  });

  it('priority 3: flat spec fallback flags the legacy banner', () => {
    const imported = fromLegacy(
      JSON.parse(JSON.stringify(toPayload(singleFixed()).parts[0]))
    );
    expect(imported.source).toBe('flat');
    expect(imported.confidence).toBe('approximate');
    expect(imported.notes.join(' ')).toContain('imported from legacy design');
  });
});

describe('fromFullWindow payload round-trips (reopened price = saved price)', () => {
  const cases: Array<[string, () => WindowDesign]> = [
    ['single fixed', singleFixed],
    ['2-sash openable', twoSashOpenable],
    ['3-track sliding + mesh', slidingThreeTrackMesh],
    ['vertical mullion', verticalMullion],
    ['mixed example B', mixedExampleB],
  ];
  for (const [name, make] of cases) {
    it(`${name}: toPayload(import(full_window(d))) === toPayload(d)`, () => {
      const original = toPayload(make());
      const imported = fromFullWindow(fullWindowOf(make()));
      expect(imported.confidence).toBe('exact');
      expect(JSON.stringify(toPayload(imported.design))).toBe(
        JSON.stringify(original)
      );
    });
  }

  it('reconstructs the mixed window structure (columns from widths)', () => {
    const imported = fromFullWindow(fullWindowOf(mixedExampleB()));
    const root = imported.design.root;
    expect(isSplit(root)).toBeTrue();
    if (!isSplit(root)) return;
    expect(root.axis).toBe('x');
    expect(root.positionsMm).toEqual([900]);
    const rightColumn = root.children[1];
    expect(isSplit(rightColumn)).toBeTrue();
    if (!isSplit(rightColumn)) return;
    expect(rightColumn.axis).toBe('y');
    expect(rightColumn.positionsMm).toEqual([600]);
  });

  it('collapses consecutive sliding parts into one leaf with panels', () => {
    const imported = fromFullWindow(fullWindowOf(slidingThreeTrackMesh()));
    const root = imported.design.root;
    expect(isLeaf(root)).toBeTrue();
    const leaf = walkLeaves(root)[0];
    expect(leaf.slide?.tracks).toBe('3 Track');
    expect(leaf.slide?.mesh).toBeTrue();
    expect(leaf.slide?.panels.map((p) => p.direction)).toEqual([
      'Left',
      'Left',
      'Right',
    ]);
  });

  it('flags mismatched mullion/section counts as approximate', () => {
    const fw = fullWindowOf(verticalMullion());
    fw.mullion.push({ direction: 'vertical', length: 1080, product_id: 55 });
    const imported = fromFullWindow(fw);
    expect(imported.confidence).toBe('approximate');
    expect(imported.notes.length).toBeGreaterThan(0);
  });
});

describe('fromFlatLegacy (oldest lines, first-section-only data)', () => {
  it('single fixed: payload matches the legacy single-part payload', () => {
    const spec = JSON.parse(JSON.stringify(toPayload(singleFixed()).parts[0]));
    const imported = fromFlatLegacy(spec);
    expect(JSON.stringify(toPayload(imported.design))).toBe(
      JSON.stringify(toPayload(singleFixed()))
    );
  });

  it('sliding with palla_type n becomes n equal panels', () => {
    const imported = fromFlatLegacy({
      category_type: 'Slidding',
      product_id: 23,
      sash_id: 31,
      is_track: '3 Track',
      fly_mesh: 1,
      palla_type: 3,
      width: 2400,
      height: 1380,
      glazz_id: 1,
      color_id: 4,
    });
    const leaf = walkLeaves(imported.design.root)[0];
    expect(leaf.slide?.panels.length).toBe(3);
    expect(leaf.slide?.panels[0].widthMm).toBeCloseTo(760, 9);
    expect(leaf.slide?.tracks).toBe('3 Track');
    expect(leaf.slide?.mesh).toBeTrue();
  });

  it('openable with palla_type 2 becomes a 2-sash split (Left/Right)', () => {
    const imported = fromFlatLegacy({
      category_type: 'Casement',
      casement_type: 'Openable',
      product_id: 8,
      sash_id: 12,
      handle_id: 3,
      hinges_type: 'Friction',
      palla_type: 2,
      width: 1500,
      height: 1200,
      glazz_id: 1,
      color_id: 4,
    });
    const root = imported.design.root;
    expect(isSplit(root)).toBeTrue();
    if (!isSplit(root)) return;
    expect(root.dividerKind).toBe('sash');
    const leaves = walkLeaves(root);
    expect(leaves.map((l) => l.opening?.direction)).toEqual(['Left', 'Right']);
    expect(leaves.every((l) => l.opening?.handleId === 3)).toBeTrue();
  });

  it('always carries the verify-before-resave banner note', () => {
    const imported = fromFlatLegacy({ width: 1000, height: 1000 });
    expect(imported.confidence).toBe('approximate');
    expect(imported.notes[0]).toContain('please verify');
  });
});
