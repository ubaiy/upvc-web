import { faceShape, panelSize, roofPitchDeg, summarize } from '../derive';
import { checkStructure, createStructure } from '../operations';
import { barLengths, countRole, edgeUse, facesOf } from '../testing/helpers';

describe('lean-to template', () => {
  // 3600 wide, 2400 out, eave 2100, 15°: rise 2400 × tan 15° = 643.08; rafter 2400 / cos 15° = 2484.66.
  const s = createStructure('lean-to', { width: 3600, projection: 2400, eave: 2100, pitch: 15, spacing: 600, module: 900 });

  it('has a front wall, two raked sides and a roof of rectangles', () => {
    expect(facesOf(s, 'wall-front').length).toBe(4);
    expect(facesOf(s, 'wall-left').length).toBe(3);
    expect(facesOf(s, 'wall-right').length).toBe(3);
    expect(facesOf(s, 'roof').length).toBe(6);
    expect(facesOf(s, 'roof').every((f) => faceShape(f) === 'rectangle' && f.fill.kind === 'glass')).toBeTrue();
    expect(facesOf(s, 'wall-left').every((f) => faceShape(f) === 'trapezoid')).toBeTrue();
    expect(checkStructure(s)).toEqual([]);
  });

  it('gives the hand-calculated roof', () => {
    expect(barLengths(s, 'rafter')).toEqual(Array(7).fill(2484.7)); // 5 between the panes, 2 at the ends
    expect(barLengths(s, 'eave')).toEqual([3600]);
    expect(barLengths(s, 'wall_plate')).toEqual([3600]);
    expect(panelSize(facesOf(s, 'roof')[0]).edges).toEqual([600, 2485]);
    expect(roofPitchDeg(facesOf(s, 'roof')[0])).toBeCloseTo(15, 6);
    expect(summarize(s).overall.heightMm).toBe(2743);
  });

  it('gives the hand-calculated side panels', () => {
    // Sides in 3 of 800. Height at z: 2100 + 643.08 × (1 − z / 2400): 2528.72 at 800, 2314.36 at 1600.
    expect(barLengths(s, 'coupler')).toEqual([2100, 2100, 2100, 2314.4, 2314.4, 2528.7, 2528.7]);
    expect(barLengths(s, 'corner_post')).toEqual([2100, 2100]);
    // The panel next to the building: parallel sides 2743 and 2529, 800 apart.
    const tall = facesOf(s, 'wall-left').map((f) => panelSize(f)).find((z) => z.edges[0] === 2743);
    expect(tall?.edges.slice(0, 2)).toEqual([2743, 2529]);
    expect(tall?.heightMm).toBe(800);
  });

  it('is closed on three sides and the roof; open only to the building and the floor', () => {
    const use = edgeUse(s);
    expect(use.every((n) => n <= 2)).toBeTrue();
    expect(s.joints.filter((j) => j.role === 'eave')[0].faceIds.length).toBe(4 + 6);
  });
});

describe('gable template', () => {
  // 3600 wide, 3000 out, eave 2100, 25°: rise 1800 × tan 25° = 839.35; common rafter 1800 / cos 25° = 1986.08.
  const s = createStructure('gable', { width: 3600, projection: 3000, eave: 2100, pitch: 25, spacing: 750, module: 900 });

  it('has walls, two roof slopes and a glazed gable in two triangles', () => {
    expect(facesOf(s, 'wall-front').length).toBe(4);
    expect(facesOf(s, 'wall-left').length).toBe(3);
    expect(facesOf(s, 'roof-left').length).toBe(4);
    expect(facesOf(s, 'roof-right').length).toBe(4);
    expect(facesOf(s, 'gable').map((f) => faceShape(f))).toEqual(['triangle', 'triangle']);
    expect(panelSize(facesOf(s, 'gable')[0]).edges).toEqual([1986, 1800, 839]); // rafter, half the width, the mullion
    expect(checkStructure(s)).toEqual([]);
  });

  it('gives the hand-calculated roof', () => {
    expect(barLengths(s, 'ridge')).toEqual([3000]);
    expect(barLengths(s, 'rafter')).toEqual(Array(10).fill(1986.1)); // 3 between the panes + 2 ends, each slope
    expect(barLengths(s, 'mullion')).toEqual([839.4]);
    expect(barLengths(s, 'eave')).toEqual([3000, 3000, 3600]);
    expect(roofPitchDeg(facesOf(s, 'roof-left')[0])).toBeCloseTo(25, 6);
    expect(panelSize(facesOf(s, 'roof-right')[0]).edges).toEqual([750, 1986]);
    expect(summarize(s).overall).toEqual({ widthMm: 3600, depthMm: 3000, heightMm: 2939 });
  });

  it('has a hub where the ridge, the two gable rafters and the mullion meet', () => {
    expect(s.hubs.length).toBe(1);
    expect(s.hubs[0].jointIds.length).toBe(4);
    expect(countRole(s, 'corner_post')).toBe(2);
  });

  it('is closed along the ridge and the gable', () => {
    const ridge = s.joints.find((j) => j.role === 'ridge')!;
    expect(ridge.faceIds.length).toBe(8);
    expect(edgeUse(s).every((n) => n <= 2)).toBeTrue();
  });
});
