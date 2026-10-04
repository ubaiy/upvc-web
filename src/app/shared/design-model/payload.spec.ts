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

import { DesignPayload, GlobalSpec, toPayload } from './payload';
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
        },
        {
          casementType: 'Openable',
          sashId: 12,
          openingDirection: 'Right',
          handleId: 3,
          hingesType: 'Friction',
          widthMm: 690,
          heightMm: 1080,
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
      sections: [660, 660].map((w) => ({
        casementType: 'Fixed',
        sashId: '',
        openingDirection: 'Left',
        handleId: null,
        hingesType: null,
        widthMm: w,
        heightMm: 1080,
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
      sections: [1, 2].map(() => ({
        casementType: 'Fixed',
        sashId: '',
        openingDirection: 'Left',
        handleId: null,
        hingesType: null,
        widthMm: 1380,
        heightMm: 510,
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
        },
        {
          casementType: 'Openable',
          sashId: 12,
          openingDirection: 'Top',
          handleId: 5,
          hingesType: 'Friction',
          widthMm: 1350,
          heightMm: 570,
        },
        {
          casementType: 'Fixed',
          sashId: '',
          openingDirection: 'Left',
          handleId: null,
          hingesType: null,
          widthMm: 1350,
          heightMm: 630,
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
