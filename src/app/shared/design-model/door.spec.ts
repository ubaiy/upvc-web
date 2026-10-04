/**
 * Door model tests (Phase 2 item 2.2): makeDoor single/double, door spec
 * patches, side/top lights as ordinary splits, structure invariants, and
 * the payload goldens the pricing engine already supports (product_type
 * 'Door' + hinges costheads). What the api still lacks (threshold, In/Out
 * swing, per-leaf active/passive) is listed in the Phase 2 log.
 */

import { checkInvariants } from './invariants';
import { setSlide } from './leaf-ops';
import { createDesign } from './operations';
import {
  addDoorSideLight,
  addDoorTopLight,
  checkDoor,
  makeDoor,
  setDoorSpec,
  wrapWithSplit,
} from './door';
import { DesignPayload, GlobalSpec, toPayload } from './payload';
import {
  LeafNode,
  SplitNode,
  WindowDesign,
  findNode,
  isSplit,
  walkLeaves,
} from './types';

function doorBase(widthMm = 1000, heightMm = 2100): WindowDesign {
  return createDesign({
    frame: { widthMm, heightMm, productId: 8, colorId: 4 },
    glazing: { glassId: 1 },
  });
}

function fullSpec(o: Partial<GlobalSpec>): GlobalSpec {
  return {
    designId: null,
    category_type: 'Casement',
    mullion_quantity: null,
    product_id: null,
    color_id: null,
    sash_id: '',
    casement_type: 'Fixed',
    palla_type: null,
    hinges_type: null,
    opening_direction: 'Left',
    glazing_bars_vertical: 0,
    glazing_bars_horizontal: 0,
    is_track: null,
    product_type: 'Window',
    handle_id: null,
    is_cupler: false,
    is_louvers: false,
    is_lshape: false,
    height: 0,
    width: 0,
    total: null,
    glazz_id: null,
    ventilation_id: null,
    ventilation_height: null,
    ventilation_width: null,
    ventilation_glazz_id: null,
    fly_mesh: null,
    palla: null,
    ...o,
  };
}

function expectBytes(actual: DesignPayload, expected: DesignPayload): void {
  expect(JSON.stringify(actual, null, 1)).toBe(
    JSON.stringify(expected, null, 1)
  );
}

describe('makeDoor', () => {
  it('single door: Openable leaf, productType Door, spec recorded', () => {
    const d = makeDoor(doorBase(), 'p1', {
      openingSide: 'Right',
      swing: 'Out',
      threshold: 'Low',
      sashId: 12,
      handleId: 3,
      hingesType: '3D Hinges',
    });
    expect(d.productType).toBe('Door');
    expect(d.door).toEqual({
      leaves: 1,
      openingSide: 'Right',
      swing: 'Out',
      threshold: 'Low',
      doorNodeId: 'p1',
    });
    const leaf = findNode(d.root, 'p1') as LeafNode;
    expect(leaf.casementType).toBe('Openable');
    expect(leaf.opening).toEqual({
      direction: 'Right',
      handleId: 3,
      hingesType: '3D Hinges',
    });
    expect(checkInvariants(d)).toEqual([]);
    expect(checkDoor(d)).toEqual([]);
  });

  it('double door: a 2-child sash split with alternating hinge sides', () => {
    const d = makeDoor(doorBase(1500), 'p1', {
      leaves: 2,
      sashId: 12,
      handleId: 3,
      hingesType: '3D Hinges',
    });
    const node = findNode(d.root, 'p1') as SplitNode;
    expect(isSplit(node)).toBeTrue();
    expect(node.dividerKind).toBe('sash');
    expect(node.children.length).toBe(2);
    const leaves = walkLeaves(node);
    expect(leaves.map((l) => l.opening?.direction)).toEqual(['Left', 'Right']);
    expect(leaves.every((l) => l.sashFramed)).toBeTrue();
    expect(checkInvariants(d)).toEqual([]);
  });

  it('defaults: single, Left, In, Standard threshold', () => {
    const d = makeDoor(doorBase(), 'p1');
    expect(d.door).toEqual({
      leaves: 1,
      openingSide: 'Left',
      swing: 'In',
      threshold: 'Standard',
      doorNodeId: 'p1',
    });
  });

  it('is pure: the input design is untouched', () => {
    const before = doorBase();
    const snapshot = JSON.stringify(before);
    makeDoor(before, 'p1', { leaves: 2 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('setDoorSpec', () => {
  it('patches threshold/swing and syncs a single leaf opening side', () => {
    let d = makeDoor(doorBase(), 'p1');
    d = setDoorSpec(d, { threshold: 'None', swing: 'Out', openingSide: 'Right' });
    expect(d.door?.threshold).toBe('None');
    expect(d.door?.swing).toBe('Out');
    const leaf = findNode(d.root, 'p1') as LeafNode;
    expect(leaf.opening?.direction).toBe('Right');
  });

  it('throws without a door', () => {
    expect(() => setDoorSpec(doorBase(), { swing: 'Out' })).toThrowError(/no door/);
  });
});

describe('side and top lights (ordinary splits)', () => {
  it('left side light: a mullion split, light locked at its exact mm', () => {
    let d = makeDoor(doorBase(1500), 'p1', { sashId: 12 });
    d = addDoorSideLight(d, 'left', 400, { dividerProfileId: 55 });
    const root = d.root as SplitNode;
    expect(isSplit(root)).toBeTrue();
    expect(root.axis).toBe('x');
    expect(root.dividerKind).toBe('mullion');
    expect(root.positionsMm).toEqual([430]); // 400 light + 60/2 face
    expect(root.lockedMm).toEqual([true]);
    expect(root.children[0].kind).toBe('leaf');
    expect((root.children[0] as LeafNode).casementType).toBe('Fixed');
    expect(root.children[1].id).toBe('p1'); // the door keeps its identity
    expect(d.door?.doorNodeId).toBe('p1');
    expect(checkInvariants(d)).toEqual([]);
  });

  it('top light above a double door wraps the whole sash split', () => {
    let d = makeDoor(doorBase(1500, 2400), 'p1', { leaves: 2 });
    d = addDoorTopLight(d, 350, { dividerProfileId: 55 });
    const root = d.root as SplitNode;
    expect(root.axis).toBe('y');
    expect(root.positionsMm).toEqual([380]); // 350 light + 30
    expect(root.children[1].id).toBe('p1');
    expect(isSplit(root.children[1])).toBeTrue(); // still the sash split
    expect(checkInvariants(d)).toEqual([]);
  });

  it('light on both sides: wrap twice, door still addressable', () => {
    let d = makeDoor(doorBase(2200), 'p1');
    d = addDoorSideLight(d, 'left', 400);
    d = addDoorSideLight(d, 'right', 400);
    const leaves = walkLeaves(d.root);
    expect(leaves.length).toBe(3);
    expect(d.door?.doorNodeId).toBe('p1');
    expect(checkInvariants(d)).toEqual([]);
  });

  it('wrapWithSplit refuses a light that starves the wrapped content', () => {
    const d = makeDoor(doorBase(1000), 'p1');
    // daylight 880; light 800 + face 60 leaves 20 < min pane 50.
    expect(() => addDoorSideLight(d, 'left', 800)).toThrowError(/needs/);
  });

  it('wrapWithSplit rescales a wrapped subtree (sliding panels scale)', () => {
    // Wrap a 2-panel sliding leaf: its panels rescale to the shrunk span.
    const base = createDesign({
      frame: { widthMm: 2400, heightMm: 1500, productId: 23, colorId: 4 },
      glazing: { glassId: 1 },
    });
    let d = setSlide(base, 'p1', {
      tracks: '2 Track',
      mesh: false,
      panels: [
        { widthMm: 1140, direction: 'Left' },
        { widthMm: 1140, direction: 'Right' },
      ],
    });
    d = wrapWithSplit(d, 'p1', 'left', 400, { dividerProfileId: 55 });
    const leaf = findNode(d.root, 'p1') as LeafNode;
    const sum = (leaf.slide?.panels ?? []).reduce((a, p) => a + p.widthMm, 0);
    expect(sum).toBeCloseTo(2280 - 400 - 60, 6); // new daylight span
    expect(checkInvariants(d)).toEqual([]);
  });
});

describe('checkDoor', () => {
  it('flags a door spec on a Window and a missing door node', () => {
    const plain = doorBase();
    expect(checkDoor(plain)).toEqual([]);
    const stray = { ...plain, door: { leaves: 1 as const, openingSide: 'Left' as const, swing: 'In' as const, threshold: 'Standard' as const, doorNodeId: 'p1' } };
    expect(checkDoor(stray)[0]).toContain("productType 'Window'");
    let d = makeDoor(doorBase(), 'p1');
    d = { ...d, door: { ...(d.door as NonNullable<typeof d.door>), doorNodeId: 'zz' } };
    expect(checkDoor(d)[0]).toContain('not in the tree');
  });
});

describe('toPayload goldens — doors', () => {
  it('double door: two sash parts, product_type Door, 3D hinges priced', () => {
    const d = makeDoor(doorBase(1500), 'p1', {
      leaves: 2,
      sashId: 12,
      handleId: 3,
      hingesType: '3D Hinges',
    });
    const leafPart = (direction: string): GlobalSpec =>
      fullSpec({
        product_id: 8,
        color_id: 4,
        sash_id: 12,
        casement_type: 'Openable',
        palla_type: 1,
        hinges_type: '3D Hinges',
        opening_direction: direction,
        product_type: 'Door',
        handle_id: 3,
        height: 1980, // 2100 − 2×60
        width: 690, // (1500 − 2×60) / 2
        glazz_id: 1,
      });
    expectBytes(toPayload(d), {
      width: 1500,
      height: 2100,
      mullion: [],
      parts: [leafPart('Left'), leafPart('Right')],
      sections: ['Left', 'Right'].map((direction, i) => ({
        casementType: 'Openable',
        sashId: 12,
        openingDirection: direction,
        handleId: 3,
        hingesType: '3D Hinges',
        widthMm: 690,
        heightMm: 1980,
        orientation: null as 'mullion' | 'transom' | null,
        row: 0,
        col: i,
      })),
    });
  });

  it('single door with a left side light: door part + light part + mullion', () => {
    let d = makeDoor(doorBase(1500), 'p1', {
      sashId: 12,
      handleId: 3,
      hingesType: '3D Hinges',
    });
    d = addDoorSideLight(d, 'left', 400, { dividerProfileId: 55 });
    const payload = toPayload(d);
    expect(payload.mullion).toEqual([
      { direction: 'vertical', length: 1980, product_id: 55 },
    ]);
    expect(payload.parts.length).toBe(2);
    // Light first (reading order), then the door leaf.
    expect(payload.parts[0].casement_type).toBe('Fixed');
    expect(payload.parts[0].width).toBe(400);
    expect(payload.parts[1].casement_type).toBe('Openable');
    expect(payload.parts[1].width).toBe(920); // 1380 − 400 − 60
    expect(payload.parts.every((p) => p.product_type === 'Door')).toBeTrue();
    expect(payload.sections.map((s) => s.col)).toEqual([0, 1]);
    expect(payload.sections.map((s) => s.orientation)).toEqual([
      'mullion',
      'mullion',
    ]);
  });
});
