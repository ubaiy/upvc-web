import { dihedralDeg, faceShape, panelSize, roofPitchDeg, summarize } from '../derive';
import { checkStructure, createStructure } from '../operations';
import { barLengths, countRole, edgeUse, facesOf } from '../testing/helpers';

describe('pyramid / lantern template', () => {
  describe('square pyramid 2000 × 2000 at 45°, one pane per slope', () => {
    const s = createStructure('pyramid', { length: 2000, width: 2000, pitch: 45, spacing: 0, upstand: 0 });

    it('has four triangles, four hips, four eaves and one crown hub', () => {
      expect(s.faces.length).toBe(4);
      expect(s.faces.every((f) => faceShape(f) === 'triangle')).toBeTrue();
      expect(countRole(s, 'hip')).toBe(4);
      expect(countRole(s, 'eave')).toBe(4);
      expect(countRole(s, 'ridge')).toBe(0);
      expect(s.hubs.length).toBe(1);
      expect(s.hubs[0].role).toBe('crown');
      expect(s.hubs[0].jointIds.length).toBe(4);
      expect(checkStructure(s)).toEqual([]);
    });

    it('gives the hand-calculated sizes', () => {
      // Rise 1000 × tan 45° = 1000. Hip √(1000² + 1414.21²) = 1732.05. Slope height 1000 / cos 45° = 1414.21.
      expect(barLengths(s, 'hip')).toEqual(Array(4).fill(1732.1));
      expect(summarize(s).overall.heightMm).toBe(1000);
      const size = panelSize(s.faces[0]);
      expect(size.edges).toEqual([2000, 1732, 1732]);
      expect(size.heightMm).toBe(1414);
      expect(roofPitchDeg(s.faces[0])).toBeCloseTo(45, 6);
      // cos φ = cos²p + sin²p cos 90° = 0.5, so the glass planes meet at 180 − 60 = 120°.
      expect(dihedralDeg(facesOf(s, 'roof-front')[0], facesOf(s, 'roof-end-b')[0])).toBeCloseTo(120, 6);
    });

    it('is closed along the hips and open at the eaves', () => {
      const use = edgeUse(s);
      expect(use.filter((n) => n === 2).length).toBe(4);
      expect(use.filter((n) => n === 1).length).toBe(4);
    });
  });

  it('lantern 3000 × 2000 at 30°: a ridge of length − width and two ridge end hubs', () => {
    const s = createStructure('pyramid', { length: 3000, width: 2000, pitch: 30, spacing: 0, upstand: 0 });
    expect(s.name).toBe('Lantern roof');
    // Rise 1000 × tan 30° = 577.35; hip √(577.35² + 1000² + 1000²) = 1527.53.
    expect(barLengths(s, 'ridge')).toEqual([1000]);
    expect(barLengths(s, 'hip')).toEqual(Array(4).fill(1527.5));
    expect(s.faces.map((f) => faceShape(f)).sort()).toEqual(['trapezoid', 'trapezoid', 'triangle', 'triangle']);
    expect(panelSize(facesOf(s, 'roof-front')[0]).edges).toEqual([3000, 1000, 1528, 1528]);
    expect(s.hubs.map((h) => h.role)).toEqual(['ridge_end', 'ridge_end']);
    expect(s.hubs.every((h) => h.jointIds.length === 3)).toBeTrue();
    expect(checkStructure(s)).toEqual([]);
  });

  it('a base wider than it is long turns the ridge the other way', () => {
    const s = createStructure('pyramid', { length: 1500, width: 2400, pitch: 30, spacing: 0, upstand: 0 });
    const ridge = s.joints.find((j) => j.role === 'ridge');
    expect(ridge && Math.abs(ridge.b[2] - ridge.a[2])).toBeCloseTo(900, 6);
    expect(ridge && ridge.a[0]).toBeCloseTo(0, 6);
    expect(summarize(s).overall).toEqual({ widthMm: 1500, depthMm: 2400, heightMm: 433 });
  });

  it('bar spacing divides each slope evenly with jack rafters and keeps the glass area', () => {
    const whole = createStructure('pyramid', { length: 2000, width: 2000, pitch: 45, spacing: 0, upstand: 0 });
    const s = createStructure('pyramid', { length: 2000, width: 2000, pitch: 45, spacing: 500, upstand: 0 });
    expect(s.faces.length).toBe(16);
    // Three rafters a slope. At 500 from a corner: plan run 500, true length 500 / cos 45° = 707.11; the middle one 1414.21.
    expect(barLengths(s, 'rafter')).toEqual([...Array(8).fill(707.1), ...Array(4).fill(1414.2)]);
    expect(barLengths(s, 'hip')).toEqual(Array(4).fill(1732.1)); // hips stay whole bars
    expect(countRole(s, 'eave')).toBe(4);
    expect(summarize(s).glassAreaSqM).toBeCloseTo(summarize(whole).glassAreaSqM, 2);
    expect(summarize(whole).glassAreaSqM).toBeCloseTo(5.66, 2); // 4 × 2000 × 1414.21 / 2
    expect(checkStructure(s)).toEqual([]);
  });

  it('upstand: four solid walls under the eaves', () => {
    const s = createStructure('pyramid', { length: 2000, width: 2000, pitch: 45, spacing: 0, upstand: 200 });
    expect(facesOf(s, 'upstand').length).toBe(4);
    expect(barLengths(s, 'corner_post')).toEqual(Array(4).fill(200));
    expect(summarize(s).overall.heightMm).toBe(1200);
    // Closed where wall meets slope: every eave is now shared.
    expect(edgeUse(s).filter((n) => n === 2).length).toBe(4 + 4 + 4);
    expect(checkStructure(s)).toEqual([]);
  });
});
