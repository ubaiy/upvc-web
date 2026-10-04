/**
 * Golden payload tests — pin `toPayload` byte-for-byte to the pricing
 * contract the live component sends today (phase-3-api-log item 5).
 *
 * Source of the goldens: hand-traced from the current
 * sub-quotation-design.component.ts payload builders (`_buildParts`,
 * `_buildSections`, the `mullionArray` pushes in `_drawPane`, and
 * `_designSpecFormInit` for the exact key set/order), with the two worked
 * examples of designer-architecture §1.3/§1.4 as cross-checks. Any diff
 * here is a reviewed pricing-contract change, never a refactor side-effect.
 */

import { setLeafSpec, setSlide } from './leaf-ops';
import { createDesign, splitPane, splitPaneEqualSash } from './operations';
import { DesignPayload, GlobalSpec, toPayload } from './payload';
import { SplitNode, WindowDesign } from './types';
import {
  horizontalTransom,
  mixedExampleB,
  singleFixed,
  slidingThreeTrackMesh,
  slidingTwoTrack,
  twoSashOpenable,
  verticalMullion,
} from './testing/fixtures';

/** Full design-spec record in the legacy form's exact key order. */
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

/** Byte-level comparison: key order and values must both match. */
function expectBytes(actual: DesignPayload, expected: DesignPayload): void {
  expect(JSON.stringify(actual, null, 1)).toBe(
    JSON.stringify(expected, null, 1)
  );
}

describe('toPayload goldens', () => {
  it('single fixed casement = the legacy single-part payload (byte-compatible)', () => {
    expectBytes(toPayload(singleFixed()), {
      width: 1500,
      height: 1200,
      mullion: [],
      parts: [
        fullSpec({
          product_id: 8,
          color_id: 4,
          height: 1200, // legacy single part carries the FRAME size
          width: 1500,
          glazz_id: 1,
        }),
      ],
      sections: [
        {
          casementType: 'Fixed',
          sashId: '',
          openingDirection: 'Left',
          handleId: null,
          hingesType: null,
          widthMm: 1380, // daylight: 1500 − 2×60 frame face
          heightMm: 1080,
          orientation: null, // Phase 2 D3: un-split window has no bars
          row: 0,
          col: 0,
        },
      ],
    });
  });

  it('2-sash openable casement: one part per sash, palla_type 1, daylight halves', () => {
    const sash = (direction: string): GlobalSpec =>
      fullSpec({
        product_id: 8,
        color_id: 4,
        sash_id: 12,
        casement_type: 'Openable',
        palla_type: 1,
        hinges_type: 'Friction',
        opening_direction: direction,
        handle_id: 3,
        height: 1080,
        width: 690, // (1500 − 2×60) / 2 — sash division has no mullion face
        glazz_id: 1,
      });
    expectBytes(toPayload(twoSashOpenable()), {
      width: 1500,
      height: 1200,
      mullion: [], // palla/sash divisions are never saved to mullion[]
      parts: [sash('Left'), sash('Right')],
      sections: [
        {
          casementType: 'Openable',
          sashId: 12,
          openingDirection: 'Left',
          handleId: 3,
          hingesType: 'Friction',
          widthMm: 690,
          heightMm: 1080,
          // D3: sash divisions are columns but never mullions/transoms.
          orientation: null,
          row: 0,
          col: 0,
        },
        {
          casementType: 'Openable',
          sashId: 12,
          openingDirection: 'Right',
          handleId: 3,
          hingesType: 'Friction',
          widthMm: 690,
          heightMm: 1080,
          orientation: null,
          row: 0,
          col: 1,
        },
      ],
    });
  });

  it('2-track sliding: one part per panel with the leaf track on each', () => {
    const panel = (direction: string): GlobalSpec =>
      fullSpec({
        category_type: 'Slidding',
        product_id: 23,
        color_id: 4,
        sash_id: 31,
        casement_type: null,
        palla_type: 1,
        opening_direction: direction,
        is_track: '2 Track',
        height: 1380,
        width: 940,
        glazz_id: 1,
        fly_mesh: false,
      });
    const section = (direction: string, widthMm: number) => ({
      casementType: null,
      sashId: 31 as const,
      openingDirection: direction,
      handleId: null,
      hingesType: null,
      widthMm,
      heightMm: 1380,
      // D3: panels overlap inside ONE grid cell — same cell on each.
      orientation: null as 'mullion' | 'transom' | null,
      row: 0,
      col: 0,
    });
    expectBytes(toPayload(slidingTwoTrack()), {
      width: 2000,
      height: 1500,
      mullion: [],
      parts: [panel('Left'), panel('Right')],
      sections: [section('Left', 940), section('Right', 940)],
    });
  });

  it('3-track sliding with fly mesh (worked example A): 3×760 panels', () => {
    const panel = (direction: string): GlobalSpec =>
      fullSpec({
        category_type: 'Slidding',
        product_id: 23,
        color_id: 4,
        sash_id: 31,
        casement_type: null,
        palla_type: 1,
        opening_direction: direction,
        is_track: '3 Track',
        height: 1260, // 1380 − 2×60
        width: 760, // (2400 − 2×60) / 3
        glazz_id: 1,
        fly_mesh: true,
      });
    const payload = toPayload(slidingThreeTrackMesh());
    expectBytes(payload, {
      width: 2400,
      height: 1380,
      mullion: [],
      parts: [panel('Left'), panel('Left'), panel('Right')],
      sections: ['Left', 'Left', 'Right'].map((d) => ({
        casementType: null,
        sashId: 31,
        openingDirection: d,
        handleId: null,
        hingesType: null,
        widthMm: 760,
        heightMm: 1260,
        orientation: null as 'mullion' | 'transom' | null,
        row: 0,
        col: 0,
      })),
    });
  });

  it('vertical mullion: two 660 panes and one vertical mullion row', () => {
    const pane = (): GlobalSpec =>
      fullSpec({
        product_id: 8,
        color_id: 4,
        palla_type: 1,
        height: 1080,
        width: 660, // (1380 − 60 mullion face) / 2 — the legacy "~660" halves
        glazz_id: 1,
      });
    expectBytes(toPayload(verticalMullion()), {
      width: 1500,
      height: 1200,
      mullion: [{ direction: 'vertical', length: 1080, product_id: 55 }],
      parts: [pane(), pane()],
      sections: [660, 660].map((w, i) => ({
        casementType: 'Fixed',
        sashId: '',
        openingDirection: 'Left',
        handleId: null,
        hingesType: null,
        widthMm: w,
        heightMm: 1080,
        // D3: a vertical bar = 'mullion'; panes are columns 0 and 1.
        orientation: 'mullion' as const,
        row: 0,
        col: i,
      })),
    });
  });

  it('horizontal transom: two 510 panes and one horizontal mullion row', () => {
    const pane = (): GlobalSpec =>
      fullSpec({
        product_id: 8,
        color_id: 4,
        palla_type: 1,
        height: 510, // (1080 − 60 transom face) / 2
        width: 1380,
        glazz_id: 1,
      });
    expectBytes(toPayload(horizontalTransom()), {
      width: 1500,
      height: 1200,
      mullion: [{ direction: 'horizontal', length: 1380, product_id: 55 }],
      parts: [pane(), pane()],
      sections: [1, 2].map((_, i) => ({
        casementType: 'Fixed',
        sashId: '',
        openingDirection: 'Left',
        handleId: null,
        hingesType: null,
        widthMm: 1380,
        heightMm: 510,
        // D3: a horizontal bar = 'transom'; panes are rows 0 and 1.
        orientation: 'transom' as const,
        row: i,
        col: 0,
      })),
    });
  });

  it('mixed fixed + openable with one mullion and one transom (worked example B)', () => {
    const payload = toPayload(mixedExampleB());
    expectBytes(payload, {
      width: 2400,
      height: 1380,
      // Depth-first emit order: left subtree, vertical bar, right subtree
      // (whose own transom bar follows its first child).
      mullion: [
        { direction: 'vertical', length: 1260, product_id: 55 },
        { direction: 'horizontal', length: 1350, product_id: 55 },
      ],
      parts: [
        fullSpec({
          product_id: 8,
          color_id: 4,
          palla_type: 1,
          height: 1260,
          width: 870, // 900 centreline − 60/2 face
          glazz_id: 1,
        }),
        fullSpec({
          product_id: 8,
          color_id: 4,
          sash_id: 12,
          casement_type: 'Openable',
          palla_type: 1,
          hinges_type: 'Friction',
          opening_direction: 'Top',
          handle_id: 5,
          height: 570, // 600 centreline − 30
          width: 1350, // 2280 − 870 − 60 mullion face
          glazz_id: 1,
        }),
        fullSpec({
          product_id: 8,
          color_id: 4,
          palla_type: 1,
          height: 630, // 1200 avail − 570
          width: 1350,
          glazz_id: 1,
        }),
      ],
      sections: [
        {
          casementType: 'Fixed',
          sashId: '',
          openingDirection: 'Left',
          handleId: null,
          hingesType: null,
          widthMm: 870,
          heightMm: 1260,
          // D3 (the decision's own example): the api can now count ONE
          // vertical mullion and ONE transom from orientation + row/col.
          orientation: 'mullion' as const,
          row: 0,
          col: 0,
        },
        {
          casementType: 'Openable',
          sashId: 12,
          openingDirection: 'Top',
          handleId: 5,
          hingesType: 'Friction',
          widthMm: 1350,
          heightMm: 570,
          orientation: 'transom' as const,
          row: 0,
          col: 1,
        },
        {
          casementType: 'Fixed',
          sashId: '',
          openingDirection: 'Left',
          handleId: null,
          hingesType: null,
          widthMm: 1350,
          heightMm: 630,
          orientation: 'transom' as const,
          row: 1,
          col: 1,
        },
      ],
    });
  });

  it('spec overrides pass through fields the model does not carry', () => {
    const payload = toPayload(singleFixed(), {
      spec: { ventilation_id: 7, is_cupler: true, mullion_quantity: 2 },
    });
    expect(payload.parts[0].ventilation_id).toBe(7);
    expect(payload.parts[0].is_cupler).toBeTrue();
    expect(payload.parts[0].mullion_quantity).toBe(2);
    // Order unchanged: overrides replace values in place.
    expect(Object.keys(payload.parts[0])[0]).toBe('designId');
  });

  it('is deterministic: same design, identical payload bytes', () => {
    const d = mixedExampleB();
    expect(JSON.stringify(toPayload(d))).toBe(JSON.stringify(toPayload(d)));
  });
});

/**
 * THE PRICING RULE: one window, one payload, however it was drawn. The old
 * screen priced the same 1500 × 1200 opening window at 7263.29 or 6106.53
 * depending on what was selected when it was configured.
 */
describe('toPayload pricing rule', () => {
  const HARDWARE = {
    sashId: 27,
    opening: { direction: 'Left', handleId: 55, hingesType: 'Flate Hinges' },
  };
  const blank = (): WindowDesign =>
    createDesign({
      frame: { widthMm: 1500, heightMm: 1200, productId: 26, colorId: 1 },
      glazing: { glassId: 1 },
    });
  const openable = (d: WindowDesign, id: string): WindowDesign =>
    setLeafSpec(d, id, { category: 'Casement', casementType: 'Openable', productId: 32, ...HARDWARE });

  it('one opening sash is one per-sash part, whichever way it was made', () => {
    // Way 1: click the pane, choose "Openable".
    const direct = toPayload(openable(blank(), 'p1'));
    // Way 2: the legacy "1 palla" sash division.
    const divided = toPayload(splitPaneEqualSash(openable(blank(), 'p1'), 'p1', 1));
    expect(direct.parts.length).toBe(1);
    expect(direct.parts[0].palla_type).toBe(1);
    expect(direct.parts[0].width).toBe(1380); // 1500 − 2 × 60, not the frame
    expect(direct.parts[0].height).toBe(1080);
    expect(direct.parts[0].casement_type).toBe('Openable');
    expect(JSON.stringify(direct.parts)).toBe(JSON.stringify(divided.parts));
    expect(direct.width).toBe(1500);
    expect(direct.height).toBe(1200);
  });

  it('a pane never borrows hardware from another pane: mirror images match', () => {
    const base = splitPane(blank(), 'p1', 'x', 690, { dividerProfileId: 29 });
    const [l, r] = (base.root as SplitNode).children;
    const leftOpens = toPayload(openable(base, l.id));
    const rightOpens = toPayload(openable(base, r.id));
    const fixedOf = (p: DesignPayload) => p.parts.find((x) => x.casement_type === 'Fixed')!;
    const sashOf = (p: DesignPayload) => p.parts.find((x) => x.casement_type === 'Openable')!;
    // The fixed light has no sash, handle or hinges in either drawing ...
    for (const p of [leftOpens, rightOpens]) {
      expect(fixedOf(p).sash_id).toBe('');
      expect(fixedOf(p).handle_id).toBeNull();
      expect(fixedOf(p).hinges_type).toBeNull();
      expect(sashOf(p).sash_id).toBe(27);
      expect(sashOf(p).handle_id).toBe(55);
    }
    // ... so both drawings send the same two parts, in mirrored order.
    expect(JSON.stringify(fixedOf(leftOpens))).toBe(JSON.stringify(fixedOf(rightOpens)));
    expect(JSON.stringify(sashOf(leftOpens))).toBe(JSON.stringify(sashOf(rightOpens)));
    const sectionOf = (p: DesignPayload, type: string) =>
      p.sections.find((x) => x.casementType === type)!;
    expect(sectionOf(leftOpens, 'Fixed').sashId).toBe('');
    expect(sectionOf(leftOpens, 'Fixed').handleId).toBeNull();
    expect(sectionOf(rightOpens, 'Openable').sashId).toBe(27);
  });

  it('a casement beside a slider carries no track or mesh, and the slider no hinges', () => {
    let d = splitPane(blank(), 'p1', 'x', 690, { dividerProfileId: 29 });
    const [l, r] = (d.root as SplitNode).children;
    d = setSlide(d, l.id, {
      tracks: '3 Track',
      mesh: true,
      panels: [
        { widthMm: 330, direction: 'Left' },
        { widthMm: 330, direction: 'Right' },
      ],
    });
    d = setLeafSpec(d, l.id, { productId: 34, sashId: 35 });
    d = openable(d, r.id);
    const p = toPayload(d);
    expect(p.parts.length).toBe(3);
    expect(p.parts[0].is_track).toBe('3 Track');
    expect(p.parts[0].fly_mesh).toBeTrue();
    expect(p.parts[0].hinges_type).toBeNull();
    expect(p.parts[0].handle_id).toBeNull();
    expect(p.parts[2].casement_type).toBe('Openable');
    expect(p.parts[2].is_track).toBeNull();
    expect(p.parts[2].fly_mesh).toBeNull();
    expect(p.parts[2].hinges_type).toBe('Flate Hinges');
  });

  it('a single fixed pane keeps the whole-window part', () => {
    const p = toPayload(blank());
    expect(p.parts.length).toBe(1);
    expect(p.parts[0].width).toBe(1500);
    expect(p.parts[0].palla_type).toBeNull();
  });
});
