import {
  PaneNode,
  serializePaneTree,
  deserializePaneTree,
  reconstructFromFullWindow,
  resolvePallaTarget,
  firstSliddingLeafId,
} from './design-tree.util';

/** Sequential id factory matching the component's `p${++seq}` scheme. */
function idFactory(): () => string {
  let seq = 0;
  return () => `p${++seq}`;
}

/** Collect the tree's leaves depth-first. */
function leavesOf(node: PaneNode): PaneNode[] {
  if (!node.split) return [node];
  return node.split.children.reduce(
    (acc: PaneNode[], c) => acc.concat(leavesOf(c)),
    []
  );
}

describe('design-tree.util (B1/B2 regression)', () => {
  /** A realistic saved window: vertical mullion; left = openable casement
   *  sash pair (palla split), right = plain fixed glass. */
  function compositeTree(): PaneNode {
    return {
      id: 'root',
      framed: false,
      split: {
        direction: 'vertical',
        kind: 'mullion',
        profileId: 31,
        mullionWidthMm: 60,
        fractions: [0.4, 0.6],
        children: [
          {
            id: 'left',
            framed: false,
            split: {
              direction: 'vertical',
              kind: 'palla',
              mullionWidthMm: 60,
              fractions: [0.5, 0.5],
              children: [
                {
                  id: 'l1',
                  framed: true,
                  openingDirection: 'Left',
                  casementType: 'Openable',
                  category: 'Casement',
                  sashId: 7,
                  productId: 3,
                  handleId: 12,
                  hingesType: '3D Hinges',
                },
                {
                  id: 'l2',
                  framed: true,
                  openingDirection: 'Right',
                  casementType: 'Openable',
                  category: 'Casement',
                  sashId: 7,
                  productId: 3,
                },
              ],
            },
          },
          {
            id: 'right',
            framed: false,
            casementType: 'Fixed',
            category: 'Casement',
            productId: 3,
          },
        ],
      },
    };
  }

  describe('serialize → deserialize round trip (B1: reopen = saved)', () => {
    it('restores the full structure, config and fractions exactly', () => {
      const original = compositeTree();
      const json = JSON.parse(JSON.stringify(serializePaneTree(original)));
      const restored = deserializePaneTree(json, idFactory());

      expect(restored).not.toBeNull();
      const r = restored!;
      expect(r.split!.kind).toBe('mullion');
      expect(r.split!.direction).toBe('vertical');
      expect(r.split!.profileId).toBe(31);
      expect(r.split!.fractions).toEqual([0.4, 0.6]);

      const leftRestored = r.split!.children[0];
      expect(leftRestored.split!.kind).toBe('palla');
      expect(leftRestored.split!.children.length).toBe(2);

      const [sash1, sash2] = leftRestored.split!.children;
      expect(sash1.framed).toBeTrue();
      expect(sash1.openingDirection).toBe('Left');
      expect(sash1.casementType).toBe('Openable');
      expect(sash1.sashId).toBe(7);
      expect(sash1.handleId).toBe(12);
      expect(sash1.hingesType).toBe('3D Hinges');
      expect(sash2.openingDirection).toBe('Right');

      const rightRestored = r.split!.children[1];
      expect(rightRestored.split).toBeUndefined();
      expect(rightRestored.casementType).toBe('Fixed');
    });

    it("keeps empty-string config ('' sashId on a Fixed section) through the round trip", () => {
      // Regression: '' used to be dropped from the snapshot, so the restored
      // leaf fell back to the GLOBAL sash control and the reopened price of a
      // mixed (mullion + Openable|Fixed) window came back higher than saved —
      // the API priced a sash into the Fixed section.
      const tree: PaneNode = {
        id: 'root',
        framed: false,
        split: {
          direction: 'vertical',
          kind: 'mullion',
          profileId: 29,
          mullionWidthMm: 60,
          fractions: [0.5, 0.5],
          children: [
            { id: 'a', casementType: 'Openable', sashId: 27 },
            { id: 'b', casementType: 'Fixed', sashId: '' },
          ],
        },
      };
      const snap = JSON.parse(JSON.stringify(serializePaneTree(tree)));
      expect(snap.split.children[1].sashId).toBe('');
      const restored = deserializePaneTree(snap, idFactory())!;
      expect(restored.split!.children[1].sashId).toBe('');
      expect(restored.split!.children[0].sashId).toBe(27);
    });

    it("restores Laravel-nullified '' ('' → null server-side) back to ''", () => {
      // The API's ConvertEmptyStringsToNull middleware rewrites '' to null
      // inside the stored snapshot. Restoring must map it back to '' so the
      // leaf keeps its own (empty) value instead of inheriting the global
      // control — this is what made a mixed window reprice on reopen.
      const snap = {
        split: {
          direction: 'vertical',
          kind: 'mullion',
          mullionWidthMm: 60,
          fractions: [0.5, 0.5],
          children: [
            { casementType: 'Openable', sashId: 27 },
            { casementType: 'Fixed', sashId: null, handleId: null },
          ],
        },
      };
      const restored = deserializePaneTree(snap, idFactory())!;
      expect(restored.split!.children[1].sashId).toBe('');
      expect(restored.split!.children[1].handleId).toBe('');
      expect(restored.split!.children[0].sashId).toBe(27);
    });

    it('strips transient render fields and regenerates ids', () => {
      const tree = compositeTree();
      (tree as any)._wMm = 1234;
      tree.split!._availMm = 999;
      const snap: any = serializePaneTree(tree);
      expect(snap._wMm).toBeUndefined();
      expect(snap.id).toBeUndefined();
      expect(snap.split._availMm).toBeUndefined();

      const restored = deserializePaneTree(snap, idFactory())!;
      const ids = [restored.id, ...leavesOf(restored).map((l) => l.id)];
      ids.forEach((id) => expect(id).toMatch(/^p\d+$/));
    });

    it('rejects malformed snapshots instead of building a broken tree', () => {
      expect(deserializePaneTree(null, idFactory())).toBeNull();
      expect(deserializePaneTree('junk', idFactory())).toBeNull();
      expect(
        deserializePaneTree(
          { split: { direction: 'diagonal', kind: 'palla', children: [{}], fractions: [1] } },
          idFactory()
        )
      ).toBeNull();
      expect(
        deserializePaneTree(
          {
            split: {
              direction: 'vertical',
              kind: 'palla',
              children: [{}, {}],
              fractions: [1], // count mismatch
            },
          },
          idFactory()
        )
      ).toBeNull();
      expect(
        deserializePaneTree(
          { split: { direction: 'vertical', kind: 'palla', children: [], fractions: [] } },
          idFactory()
        )
      ).toBeNull();
    });

    it('re-normalises drifted fractions so they always sum to 1', () => {
      const restored = deserializePaneTree(
        {
          split: {
            direction: 'vertical',
            kind: 'palla',
            mullionWidthMm: 60,
            children: [{ framed: true }, { framed: true }],
            fractions: [0.5000001, 0.5000001],
          },
        },
        idFactory()
      )!;
      const sum = restored.split!.fractions.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 12);
    });
  });

  describe('reconstructFromFullWindow (B1 fallback for pre-fix rows)', () => {
    it('rebuilds a 3-track 3-palla slider from its three saved parts', () => {
      const opd = {
        category_type: 'Slidding',
        is_track: '3 Track',
        fly_mesh: true,
        palla_type: 1, // first PART's value — misleading, must not be trusted
        full_window: {
          width: 2400,
          height: 1500,
          parts: [
            { category_type: 'Slidding', width: 740, height: 1380, product_id: 9, sash_id: 4, opening_direction: 'Left' },
            { category_type: 'Slidding', width: 740, height: 1380, product_id: 9, sash_id: 4, opening_direction: 'Right' },
            { category_type: 'Slidding', width: 740, height: 1380, product_id: 9, sash_id: 4, opening_direction: 'Left' },
          ],
          mullion: [],
        },
      };
      const rec = reconstructFromFullWindow(opd, idFactory())!;
      expect(rec.approximate).toBeFalse();
      expect(rec.palla).toBe(3);
      expect(rec.root.split!.kind).toBe('palla');
      const leaves = leavesOf(rec.root);
      expect(leaves.length).toBe(3);
      leaves.forEach((l) => {
        expect(l.framed).toBeTrue();
        expect(l.category).toBe('Slidding');
        expect(l.productId).toBe(9);
      });
      // Equal parts → equal fractions → pane widths sum to the available span.
      rec.root.split!.fractions.forEach((f) => expect(f).toBeCloseTo(1 / 3, 12));
    });

    it('rebuilds a legacy single-part openable 2-palla casement', () => {
      const opd = {
        category_type: 'Casement',
        casement_type: 'Openable',
        palla_type: 2,
        product_id: 3,
        sash_id: 7,
        // no full_window at all — oldest shape
      };
      const rec = reconstructFromFullWindow(opd, idFactory())!;
      expect(rec.approximate).toBeFalse();
      expect(rec.palla).toBe(2);
      const leaves = leavesOf(rec.root);
      expect(leaves.length).toBe(2);
      expect(leaves[0].openingDirection).toBe('Left');
      expect(leaves[1].openingDirection).toBe('Right');
      expect(leaves[0].casementType).toBe('Openable');
    });

    it('rebuilds one mullion level with proportional fractions', () => {
      const opd = {
        category_type: 'Casement',
        full_window: {
          width: 2400,
          height: 1500,
          parts: [
            { category_type: 'Casement', casement_type: 'Openable', width: 900, height: 1380, sash_id: 7 },
            { category_type: 'Casement', casement_type: 'Fixed', width: 1320, height: 1380 },
          ],
          mullion: [{ direction: 'vertical', length: 1380, product_id: 31 }],
        },
      };
      const rec = reconstructFromFullWindow(opd, idFactory())!;
      expect(rec.approximate).toBeFalse();
      expect(rec.root.split!.kind).toBe('mullion');
      expect(rec.root.split!.profileId).toBe(31);
      expect(rec.root.split!.fractions[0]).toBeCloseTo(900 / 2220, 12);
      expect(rec.root.split!.fractions[1]).toBeCloseTo(1320 / 2220, 12);
      const [a, b] = rec.root.split!.children;
      expect(a.casementType).toBe('Openable');
      expect(b.casementType).toBe('Fixed');
    });

    it('flags nested legacy layouts as approximate instead of guessing silently', () => {
      const opd = {
        full_window: {
          width: 2400,
          height: 1500,
          parts: [
            { category_type: 'Casement', width: 700, height: 1380 },
            { category_type: 'Casement', width: 700, height: 600 },
            { category_type: 'Casement', width: 700, height: 600 },
          ],
          mullion: [
            { direction: 'vertical', length: 1380, product_id: 31 },
            { direction: 'horizontal', length: 1100, product_id: 31 },
          ],
        },
      };
      const rec = reconstructFromFullWindow(opd, idFactory())!;
      expect(rec.approximate).toBeTrue();
      expect(leavesOf(rec.root).length).toBe(3);
    });

    it('returns null for unusable input', () => {
      expect(reconstructFromFullWindow(null, idFactory())).toBeNull();
      expect(reconstructFromFullWindow(undefined, idFactory())).toBeNull();
    });
  });

  describe('resolvePallaTarget (B2: palla edits must never nest)', () => {
    function twoPallaSlider(): PaneNode {
      return {
        id: 'root',
        framed: false,
        split: {
          direction: 'vertical',
          kind: 'palla',
          mullionWidthMm: 60,
          fractions: [0.5, 0.5],
          children: [
            { id: 's1', framed: true, category: 'Slidding' },
            { id: 's2', framed: true, category: 'Slidding' },
          ],
        },
      };
    }

    it('re-divides the palla CONTAINER when a palla sash is selected', () => {
      const root = twoPallaSlider();
      const target = resolvePallaTarget(root, 's1');
      expect(target.mode).toBe('container');
      expect((target as any).node).toBe(root);
    });

    it('targets the whole window when nothing is selected', () => {
      expect(resolvePallaTarget(twoPallaSlider(), null).mode).toBe('window');
    });

    it('targets the whole window when the selection is stale', () => {
      expect(resolvePallaTarget(twoPallaSlider(), 'gone').mode).toBe('window');
    });

    it('subdivides a mullion section itself (legit per-section palla)', () => {
      const root = compositeTree();
      const target = resolvePallaTarget(root, 'right');
      expect(target.mode).toBe('leaf');
      expect((target as any).node.id).toBe('right');
    });

    it('re-divides the inner palla container for a nested sash, not the window', () => {
      const root = compositeTree();
      const target = resolvePallaTarget(root, 'l1');
      expect(target.mode).toBe('container');
      expect((target as any).node.id).toBe('left');
    });
  });

  describe('firstSliddingLeafId (B2: fly-mesh placement)', () => {
    it('finds the first sliding sash in a palla slider', () => {
      const root: PaneNode = {
        id: 'root',
        framed: false,
        split: {
          direction: 'vertical',
          kind: 'palla',
          mullionWidthMm: 60,
          fractions: [0.5, 0.5],
          children: [
            { id: 'a', framed: true },
            { id: 'b', framed: true },
          ],
        },
      };
      // Leaves carry no own category → global category decides.
      expect(firstSliddingLeafId(root, 'Slidding')).toBe('a');
      expect(firstSliddingLeafId(root, 'Casement')).toBeNull();
    });

    it('finds the sliding section inside a mixed window', () => {
      const root = compositeTree(); // all casement
      expect(firstSliddingLeafId(root, 'Casement')).toBeNull();
      root.split!.children[1].category = 'Slidding';
      expect(firstSliddingLeafId(root, 'Casement')).toBe('right');
    });
  });
});
