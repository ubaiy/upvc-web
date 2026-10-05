/**
 * What the api prices only when the payload says so (card T144, contract:
 * docs/review/phase-61-bar-shape-price-log.md section 5): the bars and
 * panes of a divided palla, a centre pivot, the bent profile of a shaped
 * opening sash. A design with none of them is the payload it always was.
 */

import { splitPalla } from './palla';
import { GlobalSpec, toPayload } from './payload';
import { paneOutlines } from './shaped-opening';
import { shapedSash, shapedSashLengths } from './shaped-sash';
import {
  horizontalTransom,
  mixedExampleB,
  singleFixed,
  slidingThreeTrackMesh,
  slidingTwoTrack,
  twoSashOpenable,
  verticalMullion,
} from './testing/fixtures';
import { LeafNode, PaneNode, SplitNode, WindowDesign, walkLeaves } from './types';

const OPTS = { frameFaceMm: 60 };
const NEW_KEYS = ['bars', 'panes', 'pivot', 'shaped_sash'];

const leaf = (id: string, extra: Partial<LeafNode> = {}): LeafNode => ({
  id,
  kind: 'leaf',
  category: 'Casement',
  casementType: 'Fixed',
  productId: null,
  sashId: null,
  ...extra,
});
const opening = (id: string, extra: Partial<LeafNode['opening']> = {}): LeafNode =>
  leaf(id, {
    casementType: 'Openable',
    sashId: 12,
    opening: { direction: 'Left', handleId: 3, hingesType: 'Friction', ...extra },
  });
const split = (id: string, axis: 'x' | 'y', positionsMm: number[], children: PaneNode[]): SplitNode => ({
  id,
  kind: 'split',
  axis,
  dividerKind: 'mullion',
  dividerProfileId: null,
  dividerFaceMm: 60,
  positionsMm,
  lockedMm: positionsMm.map(() => false),
  children,
});
function framed(shape: WindowDesign['frame']['shape'], w: number, h: number, root: PaneNode): WindowDesign {
  const base = singleFixed();
  return { ...base, frame: { ...base.frame, shape, widthMm: w, heightMm: h }, root };
}
/** The keys of `part` in the order they are sent. */
const keysOf = (part: GlobalSpec): string[] => Object.keys(part);

describe('toPayload: bars, panes, pivot, shaped sash (T144)', () => {
  it('an undivided rectangular design sends none of the new keys, in any part', () => {
    for (const make of [
      singleFixed,
      twoSashOpenable,
      slidingTwoTrack,
      slidingThreeTrackMesh,
      verticalMullion,
      horizontalTransom,
      mixedExampleB,
    ]) {
      const text = JSON.stringify(toPayload(make(), OPTS));
      for (const key of NEW_KEYS) expect(text.includes(`"${key}"`)).withContext(key).toBeFalse();
    }
  });

  it('a sash divided by one horizontal bar: its part gains bars and panes, nothing else changes', () => {
    const d = twoSashOpenable();
    const id = walkLeaves(d.root)[0].id;
    const before = toPayload(d, OPTS);
    const after = toPayload(splitPalla(d, { paneId: id }, 'y', 0.5, OPTS), OPTS);
    const part = after.parts[0];

    expect([part.width, part.height]).toEqual([before.parts[0].width, before.parts[0].height]);
    // Glass edge to glass edge: the sash width less its 48 mm member at both ends.
    expect(part.bars).toEqual([{ direction: 'horizontal', length: part.width - 96 }]);
    // Each pane from the sash edge to the face of the 40 mm bar.
    expect(part.panes).toEqual([
      { width: part.width, height: part.height / 2 - 20 },
      { width: part.width, height: part.height / 2 - 20 },
    ]);
    // Appended after the keys the part always had, which keep their values and order.
    expect(keysOf(part)).toEqual([...keysOf(before.parts[0]), 'bars', 'panes']);
    const { bars, panes, ...rest } = part;
    expect(JSON.stringify(rest)).toBe(JSON.stringify(before.parts[0]));
    // The other sash, the sections and the mullions are untouched.
    expect(JSON.stringify(after.parts[1])).toBe(JSON.stringify(before.parts[1]));
    expect(JSON.stringify(after.sections)).toBe(JSON.stringify(before.sections));
    expect(JSON.stringify(after.mullion)).toBe(JSON.stringify(before.mullion));
  });

  it('two vertical bars make three panes, in reading order', () => {
    const d = twoSashOpenable();
    const id = walkLeaves(d.root)[0].id;
    let cut = splitPalla(d, { paneId: id }, 'x', 0.3, OPTS);
    cut = splitPalla(cut, { paneId: id }, 'x', 0.7, OPTS);
    const part = toPayload(cut, OPTS).parts[0];
    expect(part.bars).toEqual([
      { direction: 'vertical', length: part.height - 96 },
      { direction: 'vertical', length: part.height - 96 },
    ]);
    const w = part.width;
    expect(part.panes).toEqual([
      { width: Math.round(0.3 * w - 20), height: part.height },
      { width: Math.round(0.4 * w - 40), height: part.height },
      { width: Math.round(0.3 * w - 20), height: part.height },
    ]);
  });

  it('a sliding shutter carries its own bar: only that shutter is divided', () => {
    const d = slidingThreeTrackMesh();
    const before = toPayload(d, OPTS);
    const after = toPayload(splitPalla(d, { paneId: 'p1', panelIndex: 1 }, 'y', 0.5, OPTS), OPTS);
    expect(after.parts.map((p) => !!p.bars)).toEqual([false, true, false]);
    const part = after.parts[1];
    expect(part.bars?.length).toBe(1);
    expect(part.bars?.[0].direction).toBe('horizontal');
    // The shutter less its 45 mm stile at both ends.
    expect(part.bars?.[0].length).toBe(part.panes![0].width - 90);
    expect(part.panes!.length).toBe(2);
    expect(part.panes![0].height + part.panes![1].height).toBe(part.height - 40);
    expect(JSON.stringify(after.parts[0])).toBe(JSON.stringify(before.parts[0]));
    expect(JSON.stringify(after.parts[2])).toBe(JSON.stringify(before.parts[2]));
  });

  it('a centre pivot sash says which way it turns and keeps its hinges key', () => {
    const d = framed({ kind: 'circle' }, 1200, 1200, opening('p1', { pivot: 'horizontal' }));
    const part = toPayload(d, OPTS).parts[0];
    expect(part.pivot).toBe('horizontal');
    expect(part.hinges_type).toBe('Friction');
    expect(part.casement_type).toBe('Openable');
  });

  it('a round opening sash: all of it is one bent piece, measured on the drawn outline', () => {
    const d = framed({ kind: 'circle' }, 1200, 1200, opening('p1', { pivot: 'vertical' }));
    const part = toPayload(d, OPTS).parts[0];
    const o = paneOutlines(d, OPTS).get('p1')!;
    const len = shapedSashLengths(o, shapedSash(o, 4, 48));
    expect(part.shaped_sash).toEqual({
      curved_mm: Math.round(len.curvedMm * 10) / 10,
      bends: 1,
      outline_mm: Math.round(len.outlineMm * 10) / 10,
    });
    // A circle of 1200 less the 60 frame and the 4 gap: diameter 1072.
    expect(Math.abs(part.shaped_sash!.curved_mm - Math.PI * 1072)).toBeLessThan(15);
    expect(part.shaped_sash!.curved_mm).toBe(part.shaped_sash!.outline_mm);
    expect(keysOf(part).slice(-2)).toEqual(['pivot', 'shaped_sash']);
  });

  it('an arched opening sash: three straight members and one bent', () => {
    const d = framed({ kind: 'arch-top', riseMm: 400 }, 1200, 1500, opening('p1'));
    const part = toPayload(d, OPTS).parts[0];
    const sash = part.shaped_sash!;
    expect(sash.bends).toBe(1);
    // The bent head is longer than the 1072 it spans, and the rest of the outline is straight.
    expect(sash.curved_mm).toBeGreaterThan(1072);
    expect(sash.outline_mm - sash.curved_mm).toBeGreaterThan(1072 + 2 * 900);
    expect(part.pivot).toBeUndefined();
  });

  it('a fixed pane in a shaped frame, and an opening sash the shape does not cut, send no shaped sash', () => {
    const fixedRound = framed({ kind: 'circle' }, 1200, 1200, leaf('p1'));
    expect(toPayload(fixedRound, OPTS).parts[0].shaped_sash).toBeUndefined();
    // An arch over a transom: the sash below it is a plain rectangle.
    const d = framed(
      { kind: 'arch-top', riseMm: 300 },
      1200,
      1500,
      split('p0', 'y', [500], [leaf('p1'), opening('p2')])
    );
    const parts = toPayload(d, OPTS).parts;
    expect(parts[1].casement_type).toBe('Openable');
    expect(parts[1].shaped_sash).toBeUndefined();
    expect(parts[1].pivot).toBeUndefined();
  });

  it('a sloped opening sash has no bent piece', () => {
    const d = framed({ kind: 'trapezoid', leftHeightMm: 1500, rightHeightMm: 1000 }, 1200, 1500, opening('p1'));
    const sash = toPayload(d, OPTS).parts[0].shaped_sash!;
    expect(sash.curved_mm).toBe(0);
    expect(sash.bends).toBe(0);
    expect(sash.outline_mm).toBeGreaterThan(0);
  });
});
