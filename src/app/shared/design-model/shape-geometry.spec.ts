/**
 * Shaped-frame geometry tests (Phase 3 item 3.1) — every expected number
 * is hand-computed and stated in the comment next to it.
 */

import { createDesign, splitPane } from './operations';
import { checkInvariants } from './invariants';
import { checkShape, isSemicircular, setFrameShape } from './shape';
import {
  archArcLengthMm,
  archRadiusMm,
  archSweepRad,
  circularSegmentAreaMm2,
  clipPanesToShape,
  clipPolygonToRect,
  daylightPolygon,
  frameMembers,
  insetConvexPolygon,
  outlinePath,
  polygonAreaMm2,
  shapeAreaMm2,
  shapeOutline,
} from './shape-geometry';
import { ArchTopShape, TrapezoidShape, TriangleShape } from './types';

describe('arch arithmetic', () => {
  // Segmental arch: chord 2000, rise 500.
  // R = (500² + 1000²) / (2·500) = 1 250 000 / 1000 = 1250.
  it('radius from rise and chord', () => {
    expect(archRadiusMm(500, 2000)).toBe(1250);
    // Semicircle: rise = chord/2 → R = chord/2.
    expect(archRadiusMm(1000, 2000)).toBe(1000);
  });

  // θ = 2·asin(1000/1250) = 2·asin(0.8) = 1.854590436 rad.
  it('sweep angle', () => {
    expect(archSweepRad(500, 2000)).toBeCloseTo(1.854590436, 8);
    expect(archSweepRad(1000, 2000)).toBeCloseTo(Math.PI, 10);
  });

  // Arc length = R·θ = 1250 × 1.854590436 = 2318.238045.
  it('curved member cut length', () => {
    expect(archArcLengthMm(500, 2000)).toBeCloseTo(2318.238, 3);
    // Semicircular: π·1000 = 3141.593.
    expect(archArcLengthMm(1000, 2000)).toBeCloseTo(3141.593, 3);
  });

  // Segment area = R²(θ − sinθ)/2; sin θ = 2·0.8·0.6 = 0.96 exactly,
  // so = 1 562 500 × (1.854590436 − 0.96) / 2 = 698 898.78 mm².
  it('circular segment area', () => {
    expect(circularSegmentAreaMm2(500, 2000)).toBeCloseTo(698898.78, 1);
    // Semicircle: π·1000²/2 = 1 570 796.33.
    expect(circularSegmentAreaMm2(1000, 2000)).toBeCloseTo(1570796.33, 1);
  });
});

describe('shapeAreaMm2 (closed-form)', () => {
  it('matches hand calculations for every kind', () => {
    expect(shapeAreaMm2({ kind: 'rect' }, 1500, 1200)).toBe(1800000);
    // Arch 2000×1500 rise 500: 2000×1000 + 698898.78.
    expect(
      shapeAreaMm2({ kind: 'arch-top', riseMm: 500 }, 2000, 1500)
    ).toBeCloseTo(2698898.78, 1);
    // Circle d 2000: π·1000² = 3 141 592.65.
    expect(shapeAreaMm2({ kind: 'circle' }, 2000, 2000)).toBeCloseTo(3141592.65, 1);
    // Triangle 3000×4000: 6 000 000.
    expect(
      shapeAreaMm2({ kind: 'triangle', apex: 'left' }, 3000, 4000)
    ).toBe(6000000);
    // Trapezoid w 2000, heights 1500/2500: 2000·(1500+2500)/2 = 4 000 000.
    expect(
      shapeAreaMm2(
        { kind: 'trapezoid', leftHeightMm: 1500, rightHeightMm: 2500 },
        2000,
        2500
      )
    ).toBe(4000000);
  });

  it('tessellated outline area converges to the exact area', () => {
    const shape: ArchTopShape = { kind: 'arch-top', riseMm: 500 };
    const poly = shapeOutline(shape, 2000, 1500, { arcSegments: 256 });
    expect(polygonAreaMm2(poly)).toBeCloseTo(shapeAreaMm2(shape, 2000, 1500), -2);
    const circle = shapeOutline({ kind: 'circle' }, 2000, 2000, { arcSegments: 256 });
    // 256-gon area = πr²·(sin θ / θ) ≈ exact − 0.01%.
    expect(polygonAreaMm2(circle)).toBeCloseTo(3141592.65, -4);
  });
});

describe('outlines and paths', () => {
  it('arch outline spans the box and peaks at the apex', () => {
    const pts = shapeOutline({ kind: 'arch-top', riseMm: 500 }, 2000, 1500, {
      arcSegments: 64,
    });
    const ys = pts.map((p) => p.yMm);
    const xs = pts.map((p) => p.xMm);
    expect(Math.min(...ys)).toBeCloseTo(0, 6); // apex touches the top
    expect(Math.max(...ys)).toBe(1500);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(2000, 6);
  });

  it('semicircular arch stays above the chord (no fold-back)', () => {
    const pts = shapeOutline({ kind: 'arch-top', riseMm: 1000 }, 2000, 1500);
    expect(Math.max(...pts.map((p) => p.yMm))).toBe(1500);
    // Every arc point sits at or above the springing line y = 1000.
    const arcPts = pts.filter((p) => p.yMm < 1400);
    expect(arcPts.every((p) => p.yMm <= 1000 + 1e-6)).toBeTrue();
  });

  it('outlinePath gives the renderer a true arc with radius and sweep', () => {
    const segs = outlinePath({ kind: 'arch-top', riseMm: 500 }, 2000, 1500);
    expect(segs.length).toBe(4); // arc + 2 jambs + sill
    const arc = segs[0];
    expect(arc.kind).toBe('arc');
    if (arc.kind === 'arc') {
      expect(arc.radiusMm).toBe(1250);
      expect(arc.sweepRad).toBeCloseTo(1.854590436, 8);
      expect(arc.centerMm).toEqual({ xMm: 1000, yMm: 1250 });
    }
  });
});

describe('insetConvexPolygon / daylightPolygon', () => {
  it('insets a rect to the smaller rect', () => {
    const inner = insetConvexPolygon(
      shapeOutline({ kind: 'rect' }, 1500, 1200),
      60
    );
    expect(polygonAreaMm2(inner)).toBeCloseTo(1380 * 1080, 6);
    const xs = inner.map((p) => p.xMm).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(60, 6);
    expect(xs[3]).toBeCloseTo(1440, 6);
  });

  it('circle daylight ≈ concentric circle of radius r − face', () => {
    const inner = daylightPolygon({ kind: 'circle' }, 2000, 2000, 60, {
      arcSegments: 256,
    });
    // π·940² = 2 776 371.56 (tessellation error < 0.05%).
    expect(polygonAreaMm2(inner)).toBeCloseTo(Math.PI * 940 * 940, -4);
  });

  it('throws when the inset collapses the polygon', () => {
    expect(() =>
      insetConvexPolygon(shapeOutline({ kind: 'rect' }, 200, 200), 150)
    ).toThrowError(/collapses/);
  });
});

describe('clipPolygonToRect', () => {
  it('clips a triangle daylight to a pane rect', () => {
    // Right triangle apex-left 2000×2000: hypotenuse from (0,0) to (2000,2000).
    const tri = shapeOutline({ kind: 'triangle', apex: 'left' }, 2000, 2000);
    // Rect = right half.
    const clipped = clipPolygonToRect(tri, {
      xMm: 1000,
      yMm: 0,
      wMm: 1000,
      hMm: 2000,
    });
    // Right half under the hypotenuse: trapezoid area between y=x and
    // y=2000 for x∈[1000,2000] = 1000·(1000+2000)/2... shoelace says:
    // vertices (1000,1000),(2000,2000),(1000,2000) → wait the hypotenuse
    // enters at (1000,1000) and exits at (2000,2000); with the sill and
    // jamb the clipped region is the triangle (1000,1000)-(2000,2000)-(1000,2000)
    // = ½·1000·1000 = 500 000.
    expect(polygonAreaMm2(clipped)).toBeCloseTo(500000, 3);
    // A rect fully outside clips to nothing.
    expect(
      clipPolygonToRect(tri, { xMm: 1500, yMm: 0, wMm: 400, hMm: 400 })
    ).toEqual([]);
  });
});

describe('clipPanesToShape', () => {
  it('rect design: every pane unclipped with rect areas', () => {
    let d = createDesign({
      frame: { widthMm: 1500, heightMm: 1200, productId: 8, colorId: 4 },
    });
    d = splitPane(d, 'p1', 'x', 690, { dividerProfileId: 55, dividerFaceMm: 60 });
    const clips = clipPanesToShape(d);
    expect(clips.length).toBe(2);
    expect(clips.every((c) => !c.clipped)).toBeTrue();
    expect(clips[0].areaMm2).toBeCloseTo(660 * 1080, 6);
  });

  it('arch design: top of the panes is cut, areas sum to the daylight', () => {
    let d = createDesign({
      frame: { widthMm: 2000, heightMm: 1500, productId: 8, colorId: 4 },
    });
    d = setFrameShape(d, { kind: 'arch-top', riseMm: 500 });
    d = splitPane(d, 'p1', 'x', 940, { dividerProfileId: 55, dividerFaceMm: 60 });
    const clips = clipPanesToShape(d, { arcSegments: 256 });
    expect(clips.length).toBe(2);
    expect(clips.every((c) => c.clipped)).toBeTrue();
    const daylight = polygonAreaMm2(
      daylightPolygon({ kind: 'arch-top', riseMm: 500 }, 2000, 1500, 60, {
        arcSegments: 256,
      })
    );
    const sum = clips.reduce((a, c) => a + c.areaMm2, 0);
    // Pane areas + the mullion band (60 × its clipped run) tile the
    // daylight: the sum must be LESS than the daylight by roughly the
    // bar's area, never more.
    expect(sum).toBeLessThan(daylight);
    expect(daylight - sum).toBeLessThan(60 * 1380 * 1.2);
    expect(sum).toBeGreaterThan(0.7 * daylight);
  });
});

describe('frameMembers', () => {
  it('rect: four members, all mitred 45/45', () => {
    const members = frameMembers({ kind: 'rect' }, 1500, 1200);
    expect(members.length).toBe(4);
    expect(members.map((m) => m.lengthMm)).toEqual([1500, 1500, 1200, 1200]);
    expect(
      members.every((m) => m.mitreStartDeg === 45 && m.mitreEndDeg === 45)
    ).toBeTrue();
  });

  it('segmental arch: curved head length, spring mitres, 45° at the sill', () => {
    const members = frameMembers({ kind: 'arch-top', riseMm: 500 }, 2000, 1500);
    const arc = members.find((m) => m.role === 'arc');
    expect(arc?.lengthMm).toBeCloseTo(2318.238, 3);
    expect(arc?.curved?.radiusMm).toBe(1250);
    expect(arc?.curved?.sweepDeg).toBeCloseTo(106.26, 2); // 1.8546 rad
    // Interior angle jamb↔arc = 90 + θ/2 = 143.13° → mitre 71.57°.
    expect(arc?.mitreStartDeg).toBeCloseTo(71.565, 2);
    const jamb = members.find((m) => m.role === 'jamb-left');
    expect(jamb?.lengthMm).toBe(1000); // 1500 − 500 rise
    expect(jamb?.mitreStartDeg).toBe(45);
    expect(jamb?.mitreEndDeg).toBeCloseTo(71.565, 2);
  });

  it('semicircular arch: jambs butt the arc square (mitre 90)', () => {
    const members = frameMembers({ kind: 'arch-top', riseMm: 1000 }, 2000, 1500);
    const jamb = members.find((m) => m.role === 'jamb-left');
    // Interior angle = 90 + 180/2 = 180 → tangential joint, cut 90°.
    expect(jamb?.mitreEndDeg).toBeCloseTo(90, 6);
    const arc = members.find((m) => m.role === 'arc');
    expect(arc?.lengthMm).toBeCloseTo(Math.PI * 1000, 3);
  });

  it('circle: one closed ring of 2πr', () => {
    const members = frameMembers({ kind: 'circle' }, 2000, 2000);
    expect(members).toEqual([
      {
        role: 'ring',
        lengthMm: 2 * Math.PI * 1000,
        mitreStartDeg: null,
        mitreEndDeg: null,
        curved: { radiusMm: 1000, sweepDeg: 360 },
      },
    ]);
  });

  it('3-4-5 right triangle: exact member lengths and mitres', () => {
    const shape: TriangleShape = { kind: 'triangle', apex: 'left' };
    const members = frameMembers(shape, 3000, 4000);
    const slope = members.find((m) => m.role === 'slope');
    expect(slope?.lengthMm).toBeCloseTo(5000, 6); // √(3000²+4000²)
    // Apex interior angle = atan(3000/4000) = 36.870° → mitre 18.435°.
    expect(slope?.mitreStartDeg).toBeCloseTo(18.435, 2);
    // Bottom-right angle = atan(4000/3000) = 53.130° → mitre 26.565°.
    expect(slope?.mitreEndDeg).toBeCloseTo(26.565, 2);
    const sill = members.find((m) => m.role === 'sill');
    // Bottom-left is the right angle → classic 45 mitre.
    expect(sill?.mitreStartDeg).toBeCloseTo(45, 6);
    // Mitres of a triangle sum to 90 (angles sum to 180).
    const jamb = members.find((m) => m.role === 'jamb-left');
    expect(
      (jamb?.mitreEndDeg ?? 0) + (slope?.mitreEndDeg ?? 0) + (sill?.mitreStartDeg ?? 0)
    ).toBeCloseTo(90, 3);
  });

  it('isosceles triangle: two equal slopes', () => {
    const members = frameMembers(
      { kind: 'triangle', apex: 'isosceles' },
      3000,
      2000
    );
    const slopes = members.filter((m) => m.role === 'slope');
    expect(slopes.length).toBe(2);
    // √(1500² + 2000²) = 2500.
    expect(slopes[0].lengthMm).toBeCloseTo(2500, 6);
    expect(slopes[1].lengthMm).toBeCloseTo(2500, 6);
  });

  it('trapezoid: slope length and asymmetric head mitres', () => {
    const shape: TrapezoidShape = {
      kind: 'trapezoid',
      leftHeightMm: 1500,
      rightHeightMm: 2500,
    };
    const members = frameMembers(shape, 2000, 2500);
    const slope = members.find((m) => m.role === 'slope');
    // √(2000² + 1000²) = 2236.068.
    expect(slope?.lengthMm).toBeCloseTo(2236.068, 3);
    // Short-side top: 90 + atan(1000/2000) = 116.565° → 58.28°;
    // tall-side top: 90 − 26.565 = 63.435° → 31.72°.
    expect(slope?.mitreStartDeg).toBeCloseTo(58.283, 2);
    expect(slope?.mitreEndDeg).toBeCloseTo(31.717, 2);
    const jl = members.find((m) => m.role === 'jamb-left');
    const jr = members.find((m) => m.role === 'jamb-right');
    expect(jl?.lengthMm).toBe(1500);
    expect(jr?.lengthMm).toBe(2500);
  });
});

describe('shape validation and setFrameShape', () => {
  it('checkShape enforces each kind’s parameter rules', () => {
    expect(checkShape({ kind: 'rect' }, 1500, 1200)).toEqual([]);
    expect(checkShape({ kind: 'arch-top', riseMm: 0 }, 2000, 1500)[0]).toContain('> 0');
    expect(
      checkShape({ kind: 'arch-top', riseMm: 1100 }, 2000, 1500)[0]
    ).toContain('above max'); // max = min(1500, 1000) = 1000
    expect(checkShape({ kind: 'circle' }, 2000, 1500)[0]).toContain('width === height');
    expect(
      checkShape(
        { kind: 'trapezoid', leftHeightMm: 1500, rightHeightMm: 2500 },
        2000,
        2400
      )[0]
    ).toContain('must equal frame height');
    expect(
      checkShape(
        { kind: 'trapezoid', leftHeightMm: 2500, rightHeightMm: 2500 },
        2000,
        2500
      )[0]
    ).toContain('rect');
  });

  it('setFrameShape validates, normalises the circle box, stays pure', () => {
    const d = createDesign({ frame: { widthMm: 2000, heightMm: 1500 } });
    const arch = setFrameShape(d, { kind: 'arch-top', riseMm: 500 });
    expect(arch.frame.shape).toEqual({ kind: 'arch-top', riseMm: 500 });
    expect(d.frame.shape).toEqual({ kind: 'rect' }); // input untouched
    expect(checkInvariants(arch)).toEqual([]);
    const circle = setFrameShape(d, { kind: 'circle' });
    expect(circle.frame.widthMm).toBe(2000);
    expect(circle.frame.heightMm).toBe(2000);
    expect(() =>
      setFrameShape(d, { kind: 'arch-top', riseMm: 5000 })
    ).toThrowError(/invalid frame shape/);
    expect(isSemicircular({ kind: 'arch-top', riseMm: 1000 }, 2000)).toBeTrue();
    expect(isSemicircular({ kind: 'arch-top', riseMm: 500 }, 2000)).toBeFalse();
  });
});
