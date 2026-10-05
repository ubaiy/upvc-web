// Glass per pane (card T104): the model, the payload and the round trip.
import {
  WindowDesign,
  checkInvariants,
  glassIndexOf,
  glassOfPanes,
  glassesOf,
  hasOwnGlass,
  paneGlassId,
  parse,
  serialize,
  setPaneGlass,
  setSlidePanelCount,
  setWindowGlass,
  splitPane,
  toPayload,
  walkLeaves,
} from './index';
import {
  mixedExampleB,
  singleFixed,
  slidingThreeTrackMesh,
  slidingTwoTrack,
  twoSashOpenable,
  verticalMullion,
} from './testing/fixtures';

const ids = (d: WindowDesign): string[] => walkLeaves(d.root).map((l) => l.id);
const glassOfParts = (d: WindowDesign): unknown[] => toPayload(d).parts.map((p) => p.glazz_id);

describe('glass per pane', () => {
  it('a pane without its own glass uses the window glass, and old documents are unchanged', () => {
    for (const build of [singleFixed, twoSashOpenable, slidingThreeTrackMesh, verticalMullion, mixedExampleB]) {
      const d = build();
      for (const leaf of walkLeaves(d.root)) {
        expect('glassId' in leaf).toBeFalse();
        expect(paneGlassId(d, leaf)).toBe(1);
        expect(hasOwnGlass(d, leaf)).toBeFalse();
      }
      expect(glassOfParts(d).every((g) => g === 1)).toBeTrue();
      expect(glassOfPanes(d)).toEqual({ glassId: 1, mixed: false });
      expect(glassesOf(d)).toEqual([1]);
    }
  });

  it('setPaneGlass glazes the chosen panes only and leaves the input untouched', () => {
    const d = verticalMullion();
    const [left, right] = ids(d);
    const before = serialize(d);
    const next = setPaneGlass(d, [right], 15);
    expect(serialize(d)).toBe(before);
    const [l, r] = walkLeaves(next.root);
    expect(l.glassId).toBeUndefined();
    expect(r.glassId).toBe(15);
    expect(hasOwnGlass(next, r)).toBeTrue();
    expect(next.glazing.glassId).toBe(1);
    expect(checkInvariants(next)).toEqual([]);
    expect(glassOfPanes(next, [left])).toEqual({ glassId: 1, mixed: false });
    expect(glassOfPanes(next, [right])).toEqual({ glassId: 15, mixed: false });
    expect(glassOfPanes(next, [left, right])).toEqual({ glassId: null, mixed: true });
    expect(glassOfPanes(next)).toEqual({ glassId: null, mixed: true });
    expect(glassesOf(next)).toEqual([1, 15]);
    expect(glassIndexOf(next, l)).toBe(0);
    expect(glassIndexOf(next, r)).toBe(1);
  });

  it('several panes at once; the window glass is never stored as a pane glass', () => {
    const d = mixedExampleB();
    const all = ids(d);
    const two = setPaneGlass(d, [all[0], all[2]], 2);
    expect(walkLeaves(two.root).map((l) => l.glassId)).toEqual([2, undefined, 2]);
    // Back to the window glass (by its id, or by null): the field goes away.
    const back = setPaneGlass(two, [all[0]], 1);
    expect('glassId' in walkLeaves(back.root)[0]).toBeFalse();
    const none = setPaneGlass(back, [all[2]], null);
    expect(serialize(none)).toBe(serialize(d));
    // No change returns the same document (no empty undo step).
    expect(setPaneGlass(d, [all[1]], 1)).toBe(d);
    expect(() => setPaneGlass(d, ['nope'], 2)).toThrow();
  });

  it('"Whole window" sets every pane and clears each pane glass', () => {
    const d = setPaneGlass(mixedExampleB(), [ids(mixedExampleB())[1]], 15);
    const all = setWindowGlass(d, 2);
    expect(all.glazing.glassId).toBe(2);
    expect(walkLeaves(all.root).some((l) => 'glassId' in l)).toBeFalse();
    expect(glassOfParts(all).every((g) => g === 2)).toBeTrue();
    expect(setWindowGlass(all, 2)).toBe(all);
  });

  it('the payload carries each pane glass in its own part, in pane order', () => {
    const d = mixedExampleB();
    const [a, b, c] = ids(d);
    const next = setPaneGlass(setPaneGlass(d, [b], 15), [c], 2);
    expect(glassOfParts(next)).toEqual([1, 15, 2]);
    // Nothing else of the payload moves: same keys in the same order, same sizes.
    const plain = toPayload(d);
    const own = toPayload(next);
    expect(own.parts.map((p) => Object.keys(p))).toEqual(plain.parts.map((p) => Object.keys(p)));
    expect(own.sections).toEqual(plain.sections);
    expect(own.mullion).toEqual(plain.mullion);
    expect(JSON.stringify(own.parts.map((p) => ({ ...p, glazz_id: 1 })))).toBe(JSON.stringify(plain.parts));
    expect(a).toBeTruthy();
  });

  it('a single fixed pane with its own glass still sends the whole-window part', () => {
    const d = setPaneGlass(singleFixed(), ['p1'], 15);
    const p = toPayload(d);
    expect(p.parts.length).toBe(1);
    expect(p.parts[0].glazz_id).toBe(15);
    expect(p.parts[0].width).toBe(1500);
    expect({ ...p.parts[0], glazz_id: 1 } as unknown).toEqual(toPayload(singleFixed()).parts[0]);
  });

  it('a sliding pane sends its glass on every panel part', () => {
    const d = setPaneGlass(slidingThreeTrackMesh(), ['p1'], 2);
    expect(glassOfParts(d)).toEqual([2, 2, 2]);
    // Re-seeding the panels keeps the pane glass.
    const four = setSlidePanelCount(d, 'p1', 4, 2280);
    expect(glassOfParts(four)).toEqual([2, 2, 2, 2]);
    expect(glassOfParts(setPaneGlass(slidingTwoTrack(), ['p1'], 15))).toEqual([15, 15]);
  });

  it('splitting a pane hands its glass to both halves', () => {
    const d = splitPane(setPaneGlass(singleFixed(), ['p1'], 15), 'p1', 'x', 690, { dividerFaceMm: 60 });
    expect(walkLeaves(d.root).map((l) => l.glassId)).toEqual([15, 15]);
    expect(glassOfParts(d)).toEqual([15, 15]);
  });

  it('round trip: a document with pane glass serializes, parses and prices the same', () => {
    for (const build of [twoSashOpenable, verticalMullion, mixedExampleB, slidingThreeTrackMesh]) {
      const base = build();
      const last = ids(base)[ids(base).length - 1];
      const d = setPaneGlass(base, [last], 15);
      const again = parse(serialize(d));
      expect(serialize(again)).toBe(serialize(d));
      expect(JSON.stringify(toPayload(again))).toBe(JSON.stringify(toPayload(d)));
      // And a document saved before pane glass existed reads back byte for byte.
      expect(serialize(parse(serialize(base)))).toBe(serialize(base));
    }
  });
});
