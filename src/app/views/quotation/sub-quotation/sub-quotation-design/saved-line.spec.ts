/**
 * Opening lines saved by the old design screen (no design document), on
 * real rows of the demo database, and the catalogue rule that completes a
 * design.
 */

import {
  LeafNode,
  SplitNode,
  WindowDesign,
  createDesign,
  isLeaf,
  serialize,
  setLeafSpec,
  toPayload,
  walkLeaves,
} from 'src/app/shared/design-model';
import { completeDesign, systemKeyOf, systemQueriesOf } from './designer-catalog';
import { openSavedLine } from './saved-line';
import { demoCatalog } from './testing/demo-catalog';
import { DEMO_LINES } from './testing/demo-lines';

const leavesOf = (d: WindowDesign): LeafNode[] => walkLeaves(d.root);

describe('openSavedLine: lines saved before the design document', () => {
  it('2-sash casement (snapshot): two opening sashes, same parts as were saved', () => {
    const o = openSavedLine(DEMO_LINES['casement2']);
    expect(o.source).toBe('snapshot');
    expect(o.faithful).toBeTrue();
    const root = o.design.root as SplitNode;
    expect(root.dividerKind).toBe('sash');
    expect(root.children.length).toBe(2);
    expect(leavesOf(o.design).map((l) => [l.casementType, l.opening?.direction, l.sashId])).toEqual([
      ['Openable', 'Left', 27],
      ['Openable', 'Right', 27],
    ]);
    // The payload the model sends is the per-sash form the row was saved in.
    const saved = JSON.parse(DEMO_LINES['casement2'].quatation_object_data).parts;
    const now = toPayload(o.design).parts;
    expect(now.map((p) => [p.width, p.height, p.palla_type, p.product_id, p.sash_id])).toEqual(
      saved.map((p: any) => [p.width, p.height, p.palla_type, p.product_id, p.sash_id])
    );
  });

  it('3-track slider with fly mesh: one sliding pane of three panels', () => {
    const o = openSavedLine(DEMO_LINES['slider3mesh']);
    expect(o.faithful).toBeTrue();
    expect(isLeaf(o.design.root)).toBeTrue();
    const leaf = o.design.root as LeafNode;
    expect(leaf.category).toBe('Slidding');
    expect(leaf.slide?.tracks).toBe('3 Track');
    expect(leaf.slide?.mesh).toBeTrue();
    expect(leaf.slide?.panels.map((p) => Math.round(p.widthMm))).toEqual([760, 760, 760]);
  });

  it('an undivided sliding pane opens as one sash, as it was drawn', () => {
    const o = openSavedLine(DEMO_LINES['slider2']);
    expect(o.faithful).toBeTrue();
    const leaf = o.design.root as LeafNode;
    expect(leaf.slide?.panels.map((p) => Math.round(p.widthMm))).toEqual([1680]);
  });

  it('mullion: opening sash left, fixed light right, at the saved sizes', () => {
    const o = openSavedLine(DEMO_LINES['mullion']);
    expect(o.faithful).toBeTrue();
    const root = o.design.root as SplitNode;
    expect(root.axis).toBe('x');
    expect(root.dividerKind).toBe('mullion');
    expect(String(root.dividerProfileId)).toBe('29');
    expect(leavesOf(o.design).map((l) => l.casementType)).toEqual(['Openable', 'Fixed']);
    expect(toPayload(o.design).parts.map((p) => [p.width, p.height])).toEqual([
      [660, 1080],
      [660, 1080],
    ]);
  });

  it('transom: two fixed lights stacked', () => {
    const o = openSavedLine(DEMO_LINES['transom']);
    expect(o.faithful).toBeTrue();
    expect((o.design.root as SplitNode).axis).toBe('y');
    expect(toPayload(o.design).parts.map((p) => [p.width, p.height])).toEqual([
      [1380, 510],
      [1380, 510],
    ]);
  });

  it('a whole-window-priced row opens with the right drawing (its price is the caller\'s to keep)', () => {
    const o = openSavedLine(DEMO_LINES['oldStyle']);
    expect(o.faithful).toBeTrue();
    expect(leavesOf(o.design).length).toBe(2);
    // The row was priced as ONE part at 1800 × 1200; the model prices per
    // sash. That is why an unchanged legacy row is never re-priced.
    expect(JSON.parse(DEMO_LINES['oldStyle'].quatation_object_data).parts.length).toBe(1);
    expect(toPayload(o.design).parts.map((p) => p.width)).toEqual([840, 840]);
  });

  it('no snapshot: rebuilt from full_window (owner\'s "Al-Rashid Villa Windows")', () => {
    const o = openSavedLine(DEMO_LINES['q14_2']);
    expect(o.source).toBe('full_window');
    expect(o.faithful).toBeTrue();
    expect(o.design.frame.widthMm).toBe(1500);
    expect(leavesOf(o.design).map((l) => l.casementType)).toEqual(['Openable']);
    const slider = openSavedLine(DEMO_LINES['q15_1']);
    expect(slider.faithful).toBeTrue();
    expect((slider.design.root as LeafNode).slide?.panels.length).toBe(2);
  });

  it('a layout that can only be approximated is not editable', () => {
    // Saved from the old B2 drawing: 3 × 340 + 1140, heights differ.
    const o = openSavedLine(DEMO_LINES['q18_2']);
    expect(o.faithful).toBeFalse();
    expect(o.reasons.length).toBeGreaterThan(0);
  });

  it('options the model does not carry make the line read-only', () => {
    const row = JSON.parse(JSON.stringify(DEMO_LINES['mullion']));
    const data = JSON.parse(row.quatation_object_data);
    data.design_tree.spec.is_louvers = true;
    row.quatation_object_data = JSON.stringify(data);
    const o = openSavedLine(row);
    expect(o.faithful).toBeFalse();
    expect(o.reasons.join(' ')).toContain('Louvers');
  });

  it('the oldest rows (first section only) still open, from what is there', () => {
    const o = openSavedLine(DEMO_LINES['q12_1']);
    expect(o.design.frame.widthMm).toBe(1000);
    expect(o.design.frame.heightMm).toBe(1200);
  });

  it('a row with a design document opens from the document alone', () => {
    const design = createDesign({ frame: { widthMm: 900, heightMm: 600 } });
    const row = {
      width: '1500',
      height: '1200',
      costhead_information: { old_post_data: { design: JSON.parse(serialize(design)) } },
    };
    const o = openSavedLine(row);
    expect(o.source).toBe('design');
    expect(o.faithful).toBeTrue();
    expect(o.design.frame.widthMm).toBe(900);
  });
});

describe('completeDesign: the catalogue rule', () => {
  const catalog = demoCatalog();

  it('fills every id from the pane\'s own system and is idempotent', () => {
    let d = createDesign({ frame: { widthMm: 1500, heightMm: 1200 } });
    d = setLeafSpec(d, 'p1', {
      category: 'Casement',
      casementType: 'Openable',
      opening: { direction: 'Right', handleId: null, hingesType: null },
    });
    const done = completeDesign(d, catalog);
    const leaf = done.root as LeafNode;
    expect(leaf.productId).toBe(32);
    expect(leaf.sashId).toBe(27);
    expect(leaf.opening).toEqual({ direction: 'Right', handleId: 55, hingesType: 'Flate Hinges' });
    expect(done.frame.colorId).toBe(1);
    expect(done.glazing.glassId).toBe(1);
    expect(serialize(completeDesign(done, catalog))).toBe(serialize(done));
  });

  it('keeps a choice the catalogue still offers and replaces one it does not', () => {
    let d = createDesign();
    d = setLeafSpec(d, 'p1', {
      category: 'Casement',
      casementType: 'Openable',
      sashId: 56,
      opening: { direction: 'Left', handleId: '59', hingesType: 'Friction' },
    });
    const kept = completeDesign(d, catalog).root as LeafNode;
    expect(kept.sashId).toBe(56);
    expect(kept.opening?.handleId).toBe(59); // the catalogue's own id type
    expect(kept.opening?.hingesType).toBe('Friction');
    const stale = completeDesign(
      setLeafSpec(d, 'p1', { sashId: 999, productId: 39 }),
      catalog
    ).root as LeafNode;
    expect(stale.sashId).toBe(27);
    expect(stale.productId).toBe(32);
  });

  it('a pane made fixed again loses its sash and hardware', () => {
    let d = createDesign();
    d = setLeafSpec(d, 'p1', { category: 'Casement', casementType: 'Fixed', sashId: 27 });
    const leaf = completeDesign(d, catalog).root as LeafNode;
    expect(leaf.sashId).toBeNull();
    expect(leaf.opening).toBeUndefined();
    expect(leaf.productId).toBe(26);
  });

  it('the old screen\'s slider frame is replaced by the frame of the pane\'s track', () => {
    const o = openSavedLine(DEMO_LINES['slider3mesh']);
    expect((o.design.root as LeafNode).productId).toBe(39);
    const done = completeDesign(o.design, catalog).root as LeafNode;
    expect(done.productId).toBe(34);
    expect(systemKeyOf('Window', done)).toBe('Window|Slidding||3 Track');
  });

  it('lists each system a design uses once', () => {
    const o = openSavedLine(DEMO_LINES['mullion']);
    expect(systemQueriesOf(o.design).map((q) => q.casementType)).toEqual(['Openable', 'Fixed']);
  });
});
