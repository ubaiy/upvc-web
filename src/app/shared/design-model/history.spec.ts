/**
 * Undo/redo tests — including the acceptance-test property (§4 test 1):
 * a RANDOM operation sequence, undone all the way and redone all the way,
 * reproduces byte-identical models at both ends.
 */

import 'zone.js/testing'; // see testing/fixtures.ts — required by the karma entry

import { DesignHistory } from './history';
import {
  createDesign,
  equalize,
  moveDivider,
  removeDivider,
  resizeFrame,
  setDividerMm,
  setLeafSpec,
  splitPane,
} from './operations';
import { checkInvariants } from './invariants';
import { serialize } from './serialize';
import { WindowDesign, isSplit, walkLeaves } from './types';

/** Deterministic PRNG (mulberry32) so failures reproduce exactly. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function collectSplits(design: WindowDesign): string[] {
  const ids: string[] = [];
  const visit = (n: WindowDesign['root']): void => {
    if (isSplit(n)) {
      ids.push(n.id);
      n.children.forEach(visit);
    }
  };
  visit(design.root);
  return ids;
}

/** Apply one random valid operation; returns the design unchanged if the
 *  rolled operation is not applicable to the current structure. */
function randomOp(design: WindowDesign, rnd: () => number): WindowDesign {
  const leaves = walkLeaves(design.root);
  const splits = collectSplits(design);
  const roll = Math.floor(rnd() * 6);
  try {
    switch (roll) {
      case 0: {
        const leaf = leaves[Math.floor(rnd() * leaves.length)];
        const axis = rnd() < 0.5 ? 'x' : 'y';
        return splitPane(design, leaf.id, axis, 200 + rnd() * 1000, {
          dividerProfileId: 55,
          dividerFaceMm: 60,
        });
      }
      case 1: {
        if (!splits.length) return design;
        const id = splits[Math.floor(rnd() * splits.length)];
        return moveDivider(design, id, 0, 100 + rnd() * 2000);
      }
      case 2: {
        if (!splits.length) return design;
        const id = splits[Math.floor(rnd() * splits.length)];
        return setDividerMm(design, id, 0, 100 + rnd() * 2000);
      }
      case 3: {
        if (!splits.length) return design;
        const id = splits[Math.floor(rnd() * splits.length)];
        return rnd() < 0.5
          ? equalize(design, id)
          : removeDivider(design, id, 0);
      }
      case 4: {
        const leaf = leaves[Math.floor(rnd() * leaves.length)];
        return setLeafSpec(design, leaf.id, {
          casementType: rnd() < 0.5 ? 'Fixed' : 'Openable',
          opening:
            rnd() < 0.5
              ? { direction: 'Right', handleId: 3, hingesType: 'Friction' }
              : null,
        });
      }
      default:
        return resizeFrame(
          design,
          600 + Math.floor(rnd() * 3000),
          600 + Math.floor(rnd() * 3000)
        );
    }
  } catch {
    // An op can legitimately refuse (pane too small to split, ...);
    // a refused op is simply "no change" for this fuzz step.
    return design;
  }
}

describe('DesignHistory', () => {
  it('push / undo / redo with reference-stable snapshots', () => {
    const d0 = createDesign();
    const h = new DesignHistory(d0);
    const d1 = splitPane(d0, 'p1', 'x', 690, { dividerFaceMm: 60 });
    h.push(d1);
    expect(h.canUndo).toBeTrue();
    expect(h.undo()).toBe(d0);
    expect(h.canRedo).toBeTrue();
    expect(h.redo()).toBe(d1);
    expect(h.present).toBe(d1);
  });

  it('pushing the identical reference is a no-op', () => {
    const d0 = createDesign();
    const h = new DesignHistory(d0);
    h.push(d0);
    expect(h.canUndo).toBeFalse();
  });

  it('a new edit discards the redo branch', () => {
    const d0 = createDesign();
    const h = new DesignHistory(d0);
    h.push(splitPane(d0, 'p1', 'x', 690, { dividerFaceMm: 60 }));
    h.undo();
    h.push(splitPane(d0, 'p1', 'y', 540, { dividerFaceMm: 60 }));
    expect(h.canRedo).toBeFalse();
  });

  it('caps the stack depth', () => {
    let d = createDesign({ frame: { widthMm: 5000, heightMm: 5000 } });
    const h = new DesignHistory(d, 5);
    for (let i = 0; i < 12; i++) {
      d = resizeFrame(d, 1000 + i * 10, 1000);
      h.push(d);
    }
    expect(h.depth).toBe(5);
  });

  it('random op sequence: undo×n then redo×n are byte-identical (acceptance test 1)', () => {
    for (const seed of [1, 42, 20261004]) {
      const rnd = prng(seed);
      const initial = createDesign({
        frame: { widthMm: 2400, heightMm: 1380, productId: 8, colorId: 4 },
        glazing: { glassId: 1 },
      });
      const initialBytes = serialize(initial);
      const h = new DesignHistory(initial);

      for (let i = 0; i < 40; i++) {
        const next = randomOp(h.present, rnd);
        expect(checkInvariants(next))
          .withContext(`seed ${seed} step ${i}`)
          .toEqual([]);
        h.push(next);
      }
      const finalBytes = serialize(h.present);
      const steps = h.depth;

      while (h.undo() !== null) {
        /* unwind fully */
      }
      expect(serialize(h.present)).withContext(`seed ${seed} undo`).toBe(initialBytes);

      let redone = 0;
      while (h.redo() !== null) redone++;
      expect(redone).toBe(steps);
      expect(serialize(h.present)).withContext(`seed ${seed} redo`).toBe(finalBytes);
    }
  });
});
