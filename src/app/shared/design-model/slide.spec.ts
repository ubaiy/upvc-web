/**
 * Sliding-system model tests (Phase 2 item 2.1): track assignment,
 * slideLayout geometry (overlaps, interlocks, mesh), operations, and the
 * two NEW golden payloads (2-track 4-panel, 2.5-track with mesh) — the
 * 2-track 2-panel and 3-track 3-panel+mesh goldens live in payload.spec.
 */

import { createDesign, createLeaf, splitPane } from './operations';
import { setSlide } from './leaf-ops';
import { checkInvariants } from './invariants';
import { DesignPayload, GlobalSpec, toPayload } from './payload';
import {
  allowedPanelCounts,
  equalPanels,
  setSlideMesh,
  setSlidePanel,
  setSlidePanelCount,
  setSlidePanelWidthMm,
  setSlideTracks,
  slideLayout,
  trackOf,
  validateSlide,
} from './slide';
import { LeafNode, SlideSpec, WindowDesign, findNode, walkLeaves } from './types';

function slidingDesign(
  frame: { widthMm: number; heightMm: number },
  slide: SlideSpec
): WindowDesign {
  const base = createDesign({
    frame: { ...frame, productId: 23, colorId: 4 },
    glazing: { glassId: 1 },
    root: createLeaf('p1', { sashId: 31 }),
  });
  return setSlide(base, 'p1', slide);
}

function slideOf(d: WindowDesign, id = 'p1'): SlideSpec {
  return (findNode(d.root, id) as LeafNode).slide as SlideSpec;
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

describe('track model', () => {
  it('assigns mirrored tracks from the outside in', () => {
    expect([0, 1].map((i) => trackOf('2 Track', 2, i))).toEqual([0, 1]);
    expect([0, 1, 2, 3].map((i) => trackOf('2 Track', 4, i))).toEqual([0, 1, 1, 0]);
    expect([0, 1, 2].map((i) => trackOf('3 Track', 3, i))).toEqual([0, 1, 2]);
    expect([0, 1, 2, 3, 4, 5].map((i) => trackOf('3 Track', 6, i))).toEqual([0, 1, 2, 2, 1, 0]);
    expect([0, 1].map((i) => trackOf('2.5 Track', 2, i))).toEqual([0, 1]);
  });

  it('allows shutter-track to double-track panel counts', () => {
    expect(allowedPanelCounts('2 Track')).toEqual([2, 3, 4]);
    expect(allowedPanelCounts('2.5 Track')).toEqual([2, 3, 4]);
    expect(allowedPanelCounts('3 Track')).toEqual([3, 4, 5, 6]);
    expect(allowedPanelCounts('4 Track')).toEqual([4, 5, 6, 7, 8]);
  });

  it('validateSlide flags count, mesh-track, all-fixed and sum problems', () => {
    const ok: SlideSpec = {
      tracks: '3 Track',
      mesh: true,
      panels: equalPanels(3, 2280),
    };
    expect(validateSlide(ok, 2280)).toEqual([]);
    expect(
      validateSlide({ ...ok, panels: equalPanels(2, 2280) })[0]
    ).toContain('carries');
    expect(
      validateSlide({ tracks: '2 Track', mesh: true, panels: equalPanels(2, 2280) })[0]
    ).toContain('fly mesh');
    expect(
      validateSlide({
        tracks: '2 Track',
        mesh: false,
        panels: equalPanels(2, 2280).map((p) => ({ ...p, fixed: true })),
      })[0]
    ).toContain('at least one panel');
    expect(
      validateSlide(
        { tracks: '2 Track', mesh: false, panels: equalPanels(2, 1000) },
        2280
      ).some((p) => p.includes('sum'))
    ).toBeTrue();
  });
});

describe('slideLayout', () => {
  it('tiles equal zero-overlap panels across the daylight exactly', () => {
    const lay = slideLayout(
      { tracks: '3 Track', mesh: false, panels: equalPanels(3, 2280) },
      2280
    );
    expect(lay.overlapMm).toBe(0);
    expect(lay.panels.map((p) => p.xMm)).toEqual([0, 760, 1520]);
    expect(lay.panels.map((p) => p.track)).toEqual([0, 1, 2]);
    expect(lay.interlocks.length).toBe(2);
    const last = lay.panels[2];
    expect(last.xMm + last.widthMm).toBeCloseTo(2280, 6);
  });

  it('derives the overlap from stored widths and places interlock bands', () => {
    // 2 panels of 1000 over an 1880 daylight → 120 overlap at the one interlock.
    const lay = slideLayout(
      {
        tracks: '2 Track',
        mesh: false,
        panels: [
          { widthMm: 1000, direction: 'Left' },
          { widthMm: 1000, direction: 'Right' },
        ],
      },
      1880
    );
    expect(lay.overlapMm).toBeCloseTo(120, 6);
    expect(lay.interlocks).toEqual([
      { xMm: 880, widthMm: 120, panels: [0, 1] },
    ]);
    expect(lay.panels[1].xMm).toBeCloseTo(880, 6);
    expect(lay.panels[1].xMm + lay.panels[1].widthMm).toBeCloseTo(1880, 6);
  });

  it('honours an explicit interlockMm and reports the mesh band', () => {
    const lay = slideLayout(
      {
        tracks: '2.5 Track',
        mesh: true,
        meshPosition: 'Right',
        interlockMm: 50,
        panels: [
          { widthMm: 965, direction: 'Left' },
          { widthMm: 965, direction: 'Right' },
        ],
      },
      1880
    );
    expect(lay.overlapMm).toBe(50);
    expect(lay.mesh).toEqual({ xMm: 940, widthMm: 940, position: 'Right' });
    // Mesh defaults to the LEFT, one panel wide: a third of a 3-panel window (T82, m3).
    const left = slideLayout(
      { tracks: '3 Track', mesh: true, panels: equalPanels(3, 2280) },
      2280
    );
    expect(left.mesh).toEqual({ xMm: 0, widthMm: 760, position: 'Left' });
  });

  it('marks fixed panels', () => {
    const lay = slideLayout(
      {
        tracks: '2 Track',
        mesh: false,
        panels: [
          { widthMm: 940, direction: 'Left', fixed: true },
          { widthMm: 940, direction: 'Right' },
        ],
      },
      1880
    );
    expect(lay.panels.map((p) => p.fixed)).toEqual([true, false]);
  });
});

describe('slide operations', () => {
  const d2400 = (): WindowDesign =>
    slidingDesign(
      { widthMm: 2400, heightMm: 1380 },
      { tracks: '3 Track', mesh: true, panels: equalPanels(3, 2280) }
    );

  it('setSlideTracks keeps a valid panel count and re-seeds an invalid one', () => {
    const d = d2400();
    // 4 Track allows 4..8, so 3 panels re-seed at the nearest count (4).
    const reseeded = setSlideTracks(d, 'p1', '4 Track', 2280);
    expect(slideOf(reseeded).panels.map((p) => p.widthMm)).toEqual([570, 570, 570, 570]);
    const to2 = setSlideTracks(d, 'p1', '2 Track', 2280);
    expect(slideOf(to2).tracks).toBe('2 Track');
    expect(slideOf(to2).panels.length).toBe(3); // 3 panels stay valid on 2 Track
    expect(slideOf(to2).mesh).toBeFalse(); // 2 Track cannot carry the mesh
    expect(d2400().frame).toEqual(d.frame); // input untouched
    expect(checkInvariants(to2)).toEqual([]);
  });

  it('setSlidePanelCount seeds equal panels with legacy directions', () => {
    const d = setSlidePanelCount(d2400(), 'p1', 4, 2280);
    const s = slideOf(d);
    expect(s.panels.map((p) => p.widthMm)).toEqual([570, 570, 570, 570]);
    expect(s.panels.map((p) => p.direction)).toEqual(['Left', 'Left', 'Right', 'Right']);
    const d3 = setSlidePanelCount(d2400(), 'p1', 3, 2280);
    expect(slideOf(d3).panels.map((p) => p.direction)).toEqual(['Left', 'Left', 'Right']);
    expect(checkInvariants(d)).toEqual([]);
  });

  it('setSlideMesh toggles and places the mesh; rejects it on 2 Track', () => {
    const off = setSlideMesh(d2400(), 'p1', false);
    expect(slideOf(off).mesh).toBeFalse();
    expect(slideOf(off).meshPosition).toBeUndefined();
    const right = setSlideMesh(d2400(), 'p1', true, 'Right');
    expect(slideOf(right).meshPosition).toBe('Right');
    const twoTrack = slidingDesign(
      { widthMm: 2000, heightMm: 1500 },
      { tracks: '2 Track', mesh: false, panels: equalPanels(2, 1880) }
    );
    expect(() => setSlideMesh(twoTrack, 'p1', true)).toThrowError(/fly mesh/);
  });

  it('setSlidePanel patches direction and the fixed flag', () => {
    const d = setSlidePanel(d2400(), 'p1', 1, { fixed: true, direction: 'Right' });
    const s = slideOf(d);
    expect(s.panels[1].fixed).toBeTrue();
    expect(s.panels[1].direction).toBe('Right');
    expect(s.panels[0].fixed).toBeUndefined();
    const undone = setSlidePanel(d, 'p1', 1, { fixed: false });
    expect(slideOf(undone).panels[1].fixed).toBeUndefined();
    expect(() =>
      setSlidePanel(d2400(), 'p1', 2, { fixed: true, direction: 'Left' })
    ).not.toThrow();
    expect(() =>
      setSlidePanel(d2400(), 'p1', 2, { fixed: true, direction: 'Right' })
    ).not.toThrow();
  });

  it('refuses to fix EVERY panel', () => {
    let d = slidingDesign(
      { widthMm: 2000, heightMm: 1500 },
      { tracks: '2 Track', mesh: false, panels: equalPanels(2, 1880) }
    );
    d = setSlidePanel(d, 'p1', 0, { fixed: true });
    expect(() => setSlidePanel(d, 'p1', 1, { fixed: true })).toThrowError(
      /at least one panel/
    );
  });

  it('setSlidePanelWidthMm gives the difference to the neighbour, clamped', () => {
    const d = setSlidePanelWidthMm(d2400(), 'p1', 0, 900, 50);
    const s = slideOf(d);
    expect(s.panels.map((p) => p.widthMm)).toEqual([900, 620, 760]);
    // Sum unchanged → the daylight invariant holds.
    expect(checkInvariants(d)).toEqual([]);
    // Last panel adjusts its LEFT neighbour.
    const last = setSlidePanelWidthMm(d2400(), 'p1', 2, 900, 50);
    expect(slideOf(last).panels.map((p) => p.widthMm)).toEqual([760, 620, 900]);
    // Clamp: cannot push the neighbour below the minimum.
    const clamped = setSlidePanelWidthMm(d2400(), 'p1', 0, 5000, 50);
    expect(slideOf(clamped).panels[1].widthMm).toBe(50);
    expect(slideOf(clamped).panels[0].widthMm).toBe(760 + 760 - 50);
  });
});

describe('toPayload goldens — Phase 2 sliding set', () => {
  it('2-track 4-panel: four 570 panels, outer/inner directions', () => {
    const d = slidingDesign(
      { widthMm: 2400, heightMm: 1380 },
      { tracks: '2 Track', mesh: false, panels: equalPanels(4, 2280) }
    );
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
        height: 1260, // 1380 − 2×60
        width: 570, // (2400 − 2×60) / 4
        glazz_id: 1,
        fly_mesh: false,
      });
    expectBytes(toPayload(d), {
      width: 2400,
      height: 1380,
      mullion: [],
      parts: [panel('Left'), panel('Left'), panel('Right'), panel('Right')],
      sections: ['Left', 'Left', 'Right', 'Right'].map((dir) => ({
        casementType: null,
        sashId: 31,
        openingDirection: dir,
        handleId: null,
        hingesType: null,
        widthMm: 570,
        heightMm: 1260,
        orientation: null as 'mullion' | 'transom' | null,
        row: 0,
        col: 0,
      })),
    });
  });

  it('2.5-track with fly mesh: two 940 panels, mesh priced via fly_mesh', () => {
    let d = slidingDesign(
      { widthMm: 2000, heightMm: 1500 },
      { tracks: '2.5 Track', mesh: true, panels: equalPanels(2, 1880) }
    );
    d = setSlideMesh(d, 'p1', true, 'Left'); // meshPosition is model-only
    const panel = (direction: string): GlobalSpec =>
      fullSpec({
        category_type: 'Slidding',
        product_id: 23,
        color_id: 4,
        sash_id: 31,
        casement_type: null,
        palla_type: 1,
        opening_direction: direction,
        is_track: '2.5 Track',
        height: 1380,
        width: 940,
        glazz_id: 1,
        fly_mesh: true,
      });
    expectBytes(toPayload(d), {
      width: 2000,
      height: 1500,
      mullion: [],
      parts: [panel('Left'), panel('Right')],
      sections: ['Left', 'Right'].map((dir) => ({
        casementType: null,
        sashId: 31,
        openingDirection: dir,
        handleId: null,
        hingesType: null,
        widthMm: 940,
        heightMm: 1380,
        orientation: null as 'mullion' | 'transom' | null,
        row: 0,
        col: 0,
      })),
    });
  });
});

describe('splitting a sliding pane (T88)', () => {
  const slider = (): WindowDesign =>
    slidingDesign(
      { widthMm: 1500, heightMm: 1200 },
      {
        tracks: '3 Track',
        mesh: true,
        panels: [
          { widthMm: 460, direction: 'Left' },
          { widthMm: 460, direction: 'Left' },
          { widthMm: 460, direction: 'Right' },
        ],
      }
    );
  const panelWidths = (leaf: LeafNode): number[] => leaf.slide!.panels.map((p) => p.widthMm);

  it('a mullion gives each half its own panels, sized to the half: they do not keep the full width', () => {
    // 1380 mm of daylight, a 60 mm mullion at the centre: two panes of 660.
    const split = splitPane(slider(), 'p1', 'x', 690, { dividerFaceMm: 60 });
    const [left, right] = walkLeaves(split.root);
    expect(panelWidths(left)).toEqual([220, 220, 220]);
    expect(panelWidths(right)).toEqual([220, 220, 220]);
    expect(validateSlide(left.slide!, 660)).toEqual([]);
    expect(checkInvariants(split)).toEqual([]);
  });

  it('an off-centre mullion shares the panels in the same proportion', () => {
    const split = splitPane(slider(), 'p1', 'x', 490, { dividerFaceMm: 60 });
    const [left, right] = walkLeaves(split.root);
    expect(panelWidths(left).reduce((a, b) => a + b, 0)).toBeCloseTo(460, 6);
    expect(panelWidths(right).reduce((a, b) => a + b, 0)).toBeCloseTo(860, 6);
  });

  it('a transom leaves the panel widths as they are: both halves keep the full width', () => {
    const split = splitPane(slider(), 'p1', 'y', 540, { dividerFaceMm: 60 });
    for (const leaf of walkLeaves(split.root)) expect(panelWidths(leaf)).toEqual([460, 460, 460]);
  });
});
