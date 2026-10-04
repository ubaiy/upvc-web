/**
 * Shaped-frame api descriptor tests (Phase 3 item 3.3, web half): the
 * top-level `shape` key against hand-computed member lengths and glass
 * areas, its presence rules in toPayload, shape parameters following a
 * frame resize, and the design_templates api row mapping.
 */

import { checkInvariants } from './invariants';
import { createDesign, resizeFrame, splitPane } from './operations';
import { toPayload } from './payload';
import { setFrameShape } from './shape';
import { circularSegmentAreaMm2 } from './shape-geometry';
import { toShapePayload } from './shape-payload';
import {
  createTemplate,
  fromTemplateRow,
  instantiateTemplate,
  toTemplateRequest,
} from './template';
import { FrameShape, WindowDesign } from './types';

function shaped(w: number, h: number, shape: FrameShape): WindowDesign {
  const d = createDesign({
    frame: { widthMm: w, heightMm: h, productId: 8, colorId: 4 },
    glazing: { glassId: 1 },
  });
  return setFrameShape(d, shape);
}

describe('toShapePayload', () => {
  it('rect has no descriptor', () => {
    const d = createDesign({ frame: { widthMm: 1500, heightMm: 1200 } });
    expect(toShapePayload(d)).toBeNull();
    expect('shape' in toPayload(d)).toBeFalse();
  });

  it('segmental arch 2000×1500 rise 500: R 1250, arc 2318.2, one shaped pane', () => {
    const s = toShapePayload(shaped(2000, 1500, { kind: 'arch-top', riseMm: 500 }));
    expect(s?.kind).toBe('arch_segmental');
    // R = (1000² + 500²) / (2·500) = 1250.
    expect(s?.params).toEqual({ riseMm: 500, radiusMm: 1250 });
    // Arc = R · 2·asin(1000/1250) = 1250 · 1.8545904 = 2318.24.
    expect(s?.members).toEqual([
      { role: 'frame', length_mm: 2318.2, qty: 1, curved: true },
      { role: 'frame', length_mm: 2000, qty: 1, curved: false },
      { role: 'frame', length_mm: 1000, qty: 2, curved: false },
    ]);
    expect(s?.panes.length).toBe(1);
    const pane = s!.panes[0];
    expect(pane.col).toBe(0);
    expect(pane.row).toBe(0);
    expect(pane.config).toBe('fixed');
    expect(pane.shaped).toBeTrue();
    // Daylight = concentric arc of R 1190 over 1880-wide jambs. The inner
    // arc meets x = 60 at y = 1250 − √(1190² − 940²) = 520.274, so the
    // inner rise is 460.274 over a 1880 chord, above a 1880 × 919.726 rect.
    expect(pane.glass.bounding_w_mm).toBe(1880);
    expect(pane.glass.bounding_h_mm).toBe(1380);
    const innerSpring = 1250 - Math.sqrt(1190 * 1190 - 940 * 940);
    const exact =
      1880 * (1440 - innerSpring) +
      circularSegmentAreaMm2(innerSpring - 60, 1880);
    expect(pane.glass.area_sqm).toBeCloseTo(exact / 1e6, 2);
    expect(pane.glass.polygon.length).toBeGreaterThan(8);
  });

  it('semicircular arch: api kind arch_semicircular, arc π·r', () => {
    const s = toShapePayload(shaped(2000, 1500, { kind: 'arch-top', riseMm: 1000 }));
    expect(s?.kind).toBe('arch_semicircular');
    expect(s?.members).toEqual([
      { role: 'frame', length_mm: 3141.6, qty: 1, curved: true },
      { role: 'frame', length_mm: 2000, qty: 1, curved: false },
      { role: 'frame', length_mm: 500, qty: 2, curved: false },
    ]);
  });

  it('3-4-5 triangle with a mullion: clipped bar and exact pane areas', () => {
    let d = shaped(4000, 3000, { kind: 'triangle', apex: 'left' });
    d = splitPane(d, 'p1', 'x', 1940, { dividerProfileId: 55, dividerFaceMm: 60 });
    const s = toShapePayload(d)!;
    expect(s.kind).toBe('triangle');
    expect(s.params).toEqual({ apexOffsetMm: 0 });
    // Daylight: x ≥ 60, y ≤ 2940, below the hypotenuse moved in 60 mm:
    // y ≥ 0.75x + 75. The bar spans x 1970–2030; its long edge starts at
    // y = 0.75·1970 + 75 = 1552.5 → 2940 − 1552.5 = 1387.5.
    expect(s.members).toEqual([
      { role: 'frame', length_mm: 4000, qty: 1, curved: false },
      { role: 'frame', length_mm: 3000, qty: 1, curved: false },
      { role: 'frame', length_mm: 5000, qty: 1, curved: false },
      { role: 'mullion', length_mm: 1387.5, qty: 1, curved: false },
    ]);
    expect(s.panes.map((p) => [p.col, p.row, p.shaped])).toEqual([
      [0, 0, true],
      [1, 0, true],
    ]);
    // Left pane, x 60–1970: ∫(2865 − 0.75x)dx = 4 018 162.5 mm².
    expect(s.panes[0].glass.area_sqm).toBeCloseTo(4.0182, 4);
    expect(s.panes[0].glass.bounding_w_mm).toBe(1910);
    expect(s.panes[0].glass.bounding_h_mm).toBe(2820);
    // Right pane, x 2030–3820 (the slope reaches the sill at 3820):
    // 1 201 537.5 mm².
    expect(s.panes[1].glass.area_sqm).toBeCloseTo(1.2015, 4);
    expect(s.panes[1].glass.bounding_w_mm).toBe(1790);
    expect(s.panes[1].glass.bounding_h_mm).toBe(1342.5);
  });

  it('trapezoid: slope length and api param names', () => {
    const s = toShapePayload(
      shaped(2000, 1500, { kind: 'trapezoid', leftHeightMm: 1000, rightHeightMm: 1500 })
    )!;
    expect(s.kind).toBe('trapezoid');
    expect(s.params).toEqual({ leftHMm: 1000, rightHMm: 1500 });
    // Slope = √(2000² + 500²) = 2061.55.
    expect(s.members).toEqual([
      { role: 'frame', length_mm: 2061.6, qty: 1, curved: false },
      { role: 'frame', length_mm: 2000, qty: 1, curved: false },
      { role: 'frame', length_mm: 1000, qty: 1, curved: false },
      { role: 'frame', length_mm: 1500, qty: 1, curved: false },
    ]);
  });

  it('toPayload carries the descriptor for api kinds, not for a circle', () => {
    const arch = shaped(2000, 1500, { kind: 'arch-top', riseMm: 500 });
    expect(toPayload(arch).shape).toEqual(toShapePayload(arch)!);
    const circle = shaped(2000, 2000, { kind: 'circle' });
    expect('shape' in toPayload(circle)).toBeFalse();
    // Still available for the day the api accepts it: one ring of 2πr.
    expect(toShapePayload(circle)?.members).toEqual([
      { role: 'frame', length_mm: 6283.2, qty: 1, curved: true },
    ]);
  });
});

describe('shape parameters follow the frame', () => {
  it('segmental rise scales with the height; semicircular stays semicircular', () => {
    const seg = resizeFrame(
      shaped(2000, 1500, { kind: 'arch-top', riseMm: 500 }),
      3000,
      3000
    );
    expect(seg.frame.shape).toEqual({ kind: 'arch-top', riseMm: 1000 });
    expect(checkInvariants(seg)).toEqual([]);
    const semi = resizeFrame(
      shaped(2000, 1500, { kind: 'arch-top', riseMm: 1000 }),
      1000,
      1500
    );
    expect(semi.frame.shape).toEqual({ kind: 'arch-top', riseMm: 500 });
    expect(checkInvariants(semi)).toEqual([]);
  });

  it('trapezoid heights scale with the frame height', () => {
    const t = resizeFrame(
      shaped(2000, 1500, { kind: 'trapezoid', leftHeightMm: 1000, rightHeightMm: 1500 }),
      2000,
      3000
    );
    expect(t.frame.shape).toEqual({
      kind: 'trapezoid',
      leftHeightMm: 2000,
      rightHeightMm: 3000,
    });
    expect(checkInvariants(t)).toEqual([]);
  });

  it('a circle stays square: the changed side drives both', () => {
    const c = shaped(2000, 2000, { kind: 'circle' });
    const byWidth = resizeFrame(c, 1500, 2000);
    expect([byWidth.frame.widthMm, byWidth.frame.heightMm]).toEqual([1500, 1500]);
    const byHeight = resizeFrame(c, 2000, 1200);
    expect([byHeight.frame.widthMm, byHeight.frame.heightMm]).toEqual([1200, 1200]);
    expect(checkInvariants(byHeight)).toEqual([]);
  });

  it('setFrameShape circle rescales a split tree into the square box', () => {
    let d = createDesign({ frame: { widthMm: 2000, heightMm: 1500 } });
    d = splitPane(d, 'p1', 'y', 690, { dividerProfileId: 55, dividerFaceMm: 60 });
    const c = setFrameShape(d, { kind: 'circle' });
    expect([c.frame.widthMm, c.frame.heightMm]).toEqual([2000, 2000]);
    expect(checkInvariants(c)).toEqual([]);
  });

  it('a shaped template instantiates at a new size with a valid shape', () => {
    const t = createTemplate(
      shaped(2000, 1500, { kind: 'arch-top', riseMm: 500 }),
      'Arched'
    );
    const { design, warnings } = instantiateTemplate(t, 1200, 1800);
    expect(warnings).toEqual([]);
    expect(design.frame.shape).toEqual({ kind: 'arch-top', riseMm: 600 });
    expect(checkInvariants(design)).toEqual([]);
  });
});

describe('design_templates api mapping', () => {
  const png = 'data:image/png;base64,AAAA';

  it('toTemplateRequest matches the api body and carries the resize rule', () => {
    const d = createDesign({ frame: { widthMm: 1200, heightMm: 1200 } });
    const t = createTemplate(d, 'Standard bedroom', {
      tags: ['bedroom'],
      resizeRule: 'preserve-locks',
      thumbnail: { kind: 'dataUrl', value: png },
    });
    expect(toTemplateRequest(t)).toEqual({
      name: 'Standard bedroom',
      tags: ['bedroom', 'resize:preserve-locks'],
      product_type: 'Window',
      design: t.design,
      thumbnail: png,
    });
  });

  it('drops a non-PNG thumbnail and keeps within the api limits', () => {
    const d = createDesign({ frame: { widthMm: 1200, heightMm: 1200 } });
    const t = createTemplate(d, 'n'.repeat(200), {
      tags: Array.from({ length: 30 }, (_, i) => `tag${i}`),
      thumbnail: { kind: 'dataUrl', value: 'data:image/jpeg;base64,AAAA' },
    });
    const req = toTemplateRequest(t);
    expect(req.name.length).toBe(150);
    expect(req.tags.length).toBe(20);
    expect('thumbnail' in req).toBeFalse();
  });

  it('fromTemplateRow round-trips an api row', () => {
    const d = createDesign({ frame: { widthMm: 1200, heightMm: 1200 } });
    const t = createTemplate(d, 'Standard bedroom', {
      tags: ['bedroom'],
      resizeRule: 'preserve-locks',
      thumbnail: { kind: 'dataUrl', value: png },
    });
    const row = { id: 7, company_id: 1, ...toTemplateRequest(t) };
    expect(fromTemplateRow(row)).toEqual(t);
    const plain = fromTemplateRow({ name: 'x', tags: null, design: d, thumbnail: null });
    expect(plain.resizeRule).toBe('proportional');
    expect(plain.thumbnail).toEqual({ kind: 'none' });
  });
});
