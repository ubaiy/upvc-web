import { Geo, P2, boundsOf, boxGeo, extrudePolygon, sweepSection, triangleCount } from './member-mesh';
import { ProfileSection, boxSection, frameSection, rebatedSection } from './profile-section';

type V3 = [number, number, number];

function vertices(geo: Geo): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < geo.positions.length; i += 3) {
    out.push([geo.positions[i], geo.positions[i + 1], geo.positions[i + 2]]);
  }
  return out;
}

/** Every triangle faces the way its normals say, and every normal is a unit vector. */
function expectSound(geo: Geo): void {
  const p = geo.positions;
  const n = geo.normals;
  expect(p.length % 9).toBe(0);
  expect(n.length).toBe(p.length);
  for (let i = 0; i < p.length; i += 9) {
    const ux = p[i + 3] - p[i];
    const uy = p[i + 4] - p[i + 1];
    const uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i];
    const vy = p[i + 7] - p[i + 1];
    const vz = p[i + 8] - p[i + 2];
    const c: V3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (let k = 0; k < 9; k += 3) {
      const len = Math.hypot(n[i + k], n[i + k + 1], n[i + k + 2]);
      expect(len).toBeCloseTo(1, 6);
      expect(c[0] * n[i + k] + c[1] * n[i + k + 1] + c[2] * n[i + k + 2]).toBeGreaterThan(0);
    }
  }
}

function expectV3(actual: V3, expected: V3): void {
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 9));
}

const W = 1200;
const H = 1500;
const RECT: P2[] = [
  { x: 0, y: H },
  { x: W, y: H },
  { x: W, y: 0 },
  { x: 0, y: 0 },
];

describe('design-3d member-mesh', () => {
  describe('a mitred rectangle', () => {
    const section = boxSection(60, 70);
    const bars = sweepSection(RECT, section, { closed: true, zOutside: 0 });

    it('is one bar per side', () => {
      expect(bars.length).toBe(4);
      bars.forEach(expectSound);
      // 4 section edges × 2 triangles, no caps on a closed loop.
      bars.forEach((b) => expect(triangleCount(b)).toBe(8));
    });

    it('has the end vertices of a 45° member on the cut plane', () => {
      // The head runs from (0, H) to (W, H); its cut planes are x + y = H and x − y = W − H.
      for (const [x, y] of vertices(bars[0])) {
        const onLeftCut = Math.abs(x + y - H) < 1e-9;
        const onRightCut = Math.abs(x - y - (W - H)) < 1e-9;
        expect(onLeftCut || onRightCut).toBeTrue();
      }
    });

    it('is as long along its outer edge as the cut length, and shorter by two faces along the glass edge', () => {
      const head = vertices(bars[0]);
      const outer = head.filter((v) => Math.abs(v[1] - H) < 1e-9).map((v) => v[0]);
      const inner = head.filter((v) => Math.abs(v[1] - (H - 60)) < 1e-9).map((v) => v[0]);
      expect(Math.max(...outer) - Math.min(...outer)).toBeCloseTo(W, 9);
      expect(Math.max(...inner) - Math.min(...inner)).toBeCloseTo(W - 120, 9);
    });

    it('fills the frame box: width × height × depth', () => {
      const b = boundsOf(bars);
      expectV3(b.min, [0, 0, -70]);
      expectV3(b.max, [W, H, 0]);
    });

    it('gives the same bars whichever way round the loop is drawn', () => {
      const reversed = sweepSection([...RECT].reverse(), section, { closed: true, zOutside: 0 });
      expectV3(boundsOf(reversed).min, boundsOf(bars).min);
      expectV3(boundsOf(reversed).max, boundsOf(bars).max);
      reversed.forEach(expectSound);
    });
  });

  it('cuts any corner on the plane that bisects its two bars', () => {
    const tri: P2[] = [
      { x: 900, y: 1200 },
      { x: 1800, y: 0 },
      { x: 0, y: 0 },
    ];
    const bars = sweepSection(tri, boxSection(60, 60), { closed: true, zOutside: 0 });
    expect(bars.length).toBe(3);
    bars.forEach(expectSound);
    tri.forEach((corner, i) => {
      const prev = tri[(i + 2) % 3];
      const next = tri[(i + 1) % 3];
      const d1 = Math.hypot(corner.x - prev.x, corner.y - prev.y);
      const d2 = Math.hypot(next.x - corner.x, next.y - corner.y);
      // Normal of the bisecting plane = sum of the two unit directions.
      const nx = (corner.x - prev.x) / d1 + (next.x - corner.x) / d2;
      const ny = (corner.y - prev.y) / d1 + (next.y - corner.y) / d2;
      // The bar that leaves this corner starts on that plane.
      const near = vertices(bars[i]).filter((v) => Math.hypot(v[0] - corner.x, v[1] - corner.y) < 200);
      expect(near.length).toBeGreaterThan(0);
      near.forEach((v) => expect((v[0] - corner.x) * nx + (v[1] - corner.y) * ny).toBeCloseTo(0, 6));
    });
  });

  it('sweeps a curved bar as one smooth member', () => {
    const R = 800;
    const N = 48;
    const arc: P2[] = [];
    const breaks: boolean[] = [];
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N;
      arc.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
      breaks.push(false);
    }
    const bars = sweepSection(arc, boxSection(60, 60), { closed: true, zOutside: 0, breaks });
    expect(bars.length).toBe(1);
    expectSound(bars[0]);
    const radii = vertices(bars[0]).map((v) => Math.hypot(v[0], v[1]));
    expect(Math.max(...radii)).toBeCloseTo(R, 6);
    // The inner ring sits on the mitre planes, a hair inside R − face.
    expect(Math.min(...radii)).toBeGreaterThan(R - 60 - 0.5);
    expect(Math.min(...radii)).toBeLessThanOrEqual(R - 60);
    // Smooth along the run: a vertex shared by two segments has ONE normal on the outer face.
    const outerNormals = new Map<string, Set<string>>();
    const p = bars[0].positions;
    const n = bars[0].normals;
    for (let i = 0; i < p.length; i += 3) {
      if (Math.abs(Math.hypot(p[i], p[i + 1]) - R) > 1e-6 || Math.abs(n[i + 2]) > 1e-6) continue;
      const key = `${p[i].toFixed(3)},${p[i + 1].toFixed(3)},${p[i + 2].toFixed(3)}`;
      const set = outerNormals.get(key) ?? new Set<string>();
      set.add(`${n[i].toFixed(4)},${n[i + 1].toFixed(4)}`);
      outerNormals.set(key, set);
    }
    expect(outerNormals.size).toBeGreaterThan(0);
    outerNormals.forEach((set) => expect(set.size).toBe(1));
  });

  it('caps an open run square at both ends', () => {
    const section = rebatedSection(60, 60);
    const bars = sweepSection(
      [
        { x: 0, y: 0 },
        { x: 0, y: 1000 },
        { x: 800, y: 1000 },
      ],
      section,
      { closed: false, zOutside: 0 }
    );
    expect(bars.length).toBe(2);
    bars.forEach(expectSound);
    const k = section.outline.length;
    // Sides + one fan cap each.
    bars.forEach((b) => expect(triangleCount(b)).toBe(2 * k + (k - 2)));
    // The section points to the LEFT of travel: going up, that is −x.
    const b = boundsOf(bars);
    expect(b.min[0]).toBeCloseTo(-60, 9);
    expect(b.max[1]).toBeCloseTo(1060, 9);
  });

  it('extrudes a convex polygon into a closed plate', () => {
    const hex: P2[] = [0, 1, 2, 3, 4, 5].map((i) => ({
      x: 100 * Math.cos((i * Math.PI) / 3),
      y: 100 * Math.sin((i * Math.PI) / 3),
    }));
    for (const poly of [hex, [...hex].reverse()]) {
      const plate = extrudePolygon(poly, -10, -16);
      expectSound(plate);
      expect(triangleCount(plate)).toBe(2 * (6 - 2) + 2 * 6);
      expect(boundsOf([plate]).min[2]).toBe(-16);
      expect(boundsOf([plate]).max[2]).toBe(-10);
    }
    expect(triangleCount(boxGeo(0, 0, 10, 20, 0, -5))).toBe(12);
    expect(triangleCount(extrudePolygon([hex[0], hex[1]], 0, -1))).toBe(0);
  });

  it('ignores a repeated vertex', () => {
    const doubled = [RECT[0], RECT[0], RECT[1], RECT[2], RECT[3], RECT[0]];
    const bars = sweepSection(doubled, boxSection(60, 60), { closed: true, zOutside: 0 });
    expect(bars.length).toBe(4);
    bars.forEach(expectSound);
  });

  describe('section data', () => {
    const sections: ProfileSection[] = [
      boxSection(45, 22),
      rebatedSection(48, 54),
      frameSection(60, 60, false),
      frameSection(60, 124, true),
    ];

    it('keeps every outline inside face × depth, counter-clockwise, and fan-able from its first point', () => {
      for (const s of sections) {
        const o = s.outline;
        let area = 0;
        o.forEach((p, i) => {
          const q = o[(i + 1) % o.length];
          area += p[0] * q[1] - q[0] * p[1];
          expect(p[0]).toBeGreaterThanOrEqual(0);
          expect(p[0]).toBeLessThanOrEqual(s.depthMm);
          expect(p[1]).toBeGreaterThanOrEqual(0);
          expect(p[1]).toBeLessThanOrEqual(s.faceMm);
        });
        expect(area).toBeGreaterThan(0);
        for (let k = 1; k < o.length - 1; k++) {
          const cross = (o[k][0] - o[0][0]) * (o[k + 1][1] - o[0][1]) - (o[k + 1][0] - o[0][0]) * (o[k][1] - o[0][1]);
          expect(cross).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
});
