import { dihedralDeg, panelSize, summarize } from '../derive';
import { checkStructure, createStructure } from '../operations';
import { defaultParams, normalizeParams } from '../template';
import { barLengths, countRole, edgeUse } from '../testing/helpers';
import { BAY, bayPlan } from './bay';

describe('bay / bow template', () => {
  it('3 segments of 900 at 45°: the classic bay', () => {
    const s = createStructure('bay', { segments: 3, segmentWidth: 900, angle: 45, height: 1500, sill: 900 });
    // Opening c + 2 s cos t = 900 + 2 × 900 × 0.70711 = 2172.79; projection s sin t = 636.40.
    const plan = bayPlan(3, 900, 45);
    expect(plan.opening).toBeCloseTo(2172.79, 2);
    expect(plan.projection).toBeCloseTo(636.4, 2);
    expect(s.faces.length).toBe(3);
    expect(s.faces.every((f) => panelSize(f).text === '900 × 1500')).toBeTrue();
    expect(barLengths(s, 'corner_post')).toEqual([1500, 1500]);
    expect(barLengths(s, 'frame')).toEqual([...Array(6).fill(900), 1500, 1500]); // sill and head a segment, two wall jambs
    expect(dihedralDeg(s.faces[0], s.faces[1])).toBeCloseTo(135, 6);
    expect(summarize(s).overall).toEqual({ widthMm: 2173, depthMm: 636, heightMm: 2400 });
    expect(checkStructure(s)).toEqual([]);
  });

  it('ends on the wall and is symmetric', () => {
    const plan = bayPlan(5, 600, 30);
    expect(plan.points[0][1]).toBeCloseTo(0, 9);
    expect(plan.points[5][1]).toBeCloseTo(0, 9);
    expect(plan.points[0][0]).toBeCloseTo(-plan.points[5][0], 9);
    // 5 segments at 30°: opening s (1 + 2 cos 30° + 2 cos 60°) = 3.7321 s; projection s (sin 60° + sin 30°) = 1.3660 s.
    expect(plan.opening).toBeCloseTo(600 * 3.732051, 2);
    expect(plan.projection).toBeCloseTo(600 * 1.366025, 2);
  });

  it('5 segment bow: five faces joined by four corner posts, each shared by two faces', () => {
    const s = createStructure('bay', { segments: 5, angle: 30 });
    expect(s.name).toBe('Bow window');
    expect(s.faces.length).toBe(5);
    expect(countRole(s, 'corner_post')).toBe(4);
    expect(edgeUse(s).filter((n) => n === 2).length).toBe(4);
    expect(s.joints.filter((j) => j.role === 'corner_post').every((j) => j.faceIds.length === 2)).toBeTrue();
  });

  it('limits the angle so the end segments still lean outward', () => {
    expect(normalizeParams(BAY, { ...defaultParams(BAY), segments: 7, angle: 60 })['angle']).toBe(28);
    expect(normalizeParams(BAY, { ...defaultParams(BAY), segments: 3, angle: 80 })['angle']).toBe(60);
  });

  it('typing a projection or an opening width finds the angle or the segment width', () => {
    const p = defaultParams(BAY);
    const dims = BAY.dims(p);
    const projection = dims.find((d) => d.id === 'projection')!;
    const q = normalizeParams(BAY, projection.set(p, 450));
    expect(bayPlan(3, 900, q['angle'] as number).projection).toBeCloseTo(450, 0);
    const opening = dims.find((d) => d.id === 'opening')!;
    const r = normalizeParams(BAY, opening.set(p, 3000));
    // The segment width is kept on its 10 mm step, so the opening lands within a few mm.
    expect(Math.abs(bayPlan(3, r['segmentWidth'] as number, 45).opening - 3000)).toBeLessThan(15);
  });
});
