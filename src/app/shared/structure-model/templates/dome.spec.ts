import { faceCorners } from '../builder';
import { faceShape, panelSize, summarize } from '../derive';
import { checkStructure, createStructure } from '../operations';
import { defaultParams, normalizeParams } from '../template';
import { barLengths, countRole, edgeUse, facesOf } from '../testing/helpers';
import { dist } from '../vec';
import { DOME, domeShape } from './dome';

describe('dome template', () => {
  // Hand-calculated case: 3 m span, 750 rise, 8 ribs, 2 rings.
  // Sphere radius (1500² + 750²) / (2 × 750) = 1875; half angle asin(0.8) = 53.130°; ring step 26.565°.
  const p = { diameter: 3000, rise: 750, ribs: 8, rings: 2, opening: 0, kerb: 0 };
  const dome = createStructure('dome', p);

  it('has N × M panels: triangles in the top ring, trapezoids below', () => {
    expect(dome.faces.length).toBe(16);
    expect(facesOf(dome, 'ring-1').every((f) => faceShape(f) === 'triangle')).toBeTrue();
    expect(facesOf(dome, 'ring-2').every((f) => faceShape(f) === 'trapezoid')).toBeTrue();
    expect(checkStructure(dome)).toEqual([]);
  });

  it('puts every node on the sphere cap', () => {
    const { sphereR } = domeShape(normalizeParams(DOME, p));
    expect(sphereR).toBeCloseTo(1875, 6);
    for (const face of dome.faces) {
      for (const c of faceCorners(face)) expect(dist(c, [0, 750 - 1875, 0])).toBeCloseTo(1875, 3);
    }
  });

  it('gives the hand-calculated bar lengths', () => {
    // Rib chord 2 R sin(dA / 2) = 3750 × 0.229753 = 861.57, the same for every segment.
    expect(barLengths(dome, 'rib')).toEqual(Array(16).fill(861.6));
    // Ring 1: radius 1875 × sin 26.565° = 838.53, chord × 2 sin 22.5° = 641.78. Base ring: 3000 × sin 22.5° = 1148.05.
    expect(barLengths(dome, 'ring')).toEqual([...Array(8).fill(641.8), ...Array(8).fill(1148.1)]);
  });

  it('gives the hand-calculated panel sizes', () => {
    const tri = panelSize(facesOf(dome, 'ring-1')[0]);
    expect(tri.edges).toEqual([862, 642, 862]); // longest edge first, then round the triangle
    // Triangle on its ring edge: height √(861.57² − 320.89²) = 799.6. Trapezoid: √(861.57² − 253.13²) = 823.5.
    const trap = panelSize(facesOf(dome, 'ring-2')[0]);
    expect(trap.edges).toEqual([1148, 642, 862, 862]);
    expect(trap.heightMm).toBe(824);
    // Glass: 8 × (641.78 × 799.58 / 2) + 8 × ((1148.05 + 641.78) / 2 × 823.54) = 7.95 m².
    expect(summarize(dome).glassAreaSqM).toBeCloseTo(7.95, 2);
  });

  it('is closed: every rib and inner ring edge is shared by two panels, the base ring by one', () => {
    const use = edgeUse(dome);
    expect(use.filter((n) => n === 2).length).toBe(8 + 8 + 8); // 16 rib segments + 8 ring-1 bars
    expect(use.filter((n) => n === 1).length).toBe(8);
    expect(use.every((n) => n === 1 || n === 2)).toBeTrue();
  });

  it('has a crown hub where all ribs meet and a node at every rib and ring crossing', () => {
    const crown = dome.hubs.filter((h) => h.role === 'crown');
    expect(crown.length).toBe(1);
    expect(crown[0].jointIds.length).toBe(8);
    expect(dome.hubs.filter((h) => h.role === 'node').length).toBe(16);
  });

  it('every panel is flat and faces outward', () => {
    for (const face of dome.faces) {
      const c = faceCorners(face);
      const centre = c.reduce((s, q) => [s[0] + q[0], s[1] + q[1], s[2] + q[2]], [0, 0, 0]);
      const { u, v } = face.plane;
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      expect(n[0] * centre[0] + n[1] * centre[1] + n[2] * centre[2]).toBeGreaterThan(0);
    }
  });

  it('top opening: a flat cap, trapezoids in every ring, no crown hub', () => {
    const open = createStructure('dome', { ...p, opening: 600 });
    expect(open.faces.length).toBe(17);
    expect(open.faces.filter((f) => faceShape(f) === 'trapezoid').length).toBe(16);
    expect(open.faces.find((f) => f.id === 'cap')?.outline.length).toBe(8);
    expect(open.hubs.some((h) => h.role === 'crown')).toBeFalse();
    expect(countRole(open, 'ring')).toBe(24);
    expect(edgeUse(open).filter((n) => n === 1).length).toBe(8);
    expect(checkStructure(open)).toEqual([]);
  });

  it('kerb: N solid wall panels under the base ring, with corner posts and a floor frame', () => {
    const kerbed = createStructure('dome', { ...p, kerb: 400 });
    expect(facesOf(kerbed, 'kerb').length).toBe(8);
    expect(facesOf(kerbed, 'kerb').every((f) => f.fill.kind === 'panel' && faceShape(f) === 'rectangle')).toBeTrue();
    expect(barLengths(kerbed, 'corner_post')).toEqual(Array(8).fill(400));
    expect(countRole(kerbed, 'frame')).toBe(8);
    expect(summarize(kerbed).overall.heightMm).toBe(1150);
    expect(checkStructure(kerbed)).toEqual([]);
  });

  it('keeps the parameters inside their limits', () => {
    const q = normalizeParams(DOME, { ...defaultParams(DOME), diameter: 2000, rise: 5000, ribs: 99, opening: 50 });
    expect(q['rise']).toBe(1000); // never more than a hemisphere
    expect(q['ribs']).toBe(32);
    expect(q['opening']).toBe(0);
  });

  it('the default dome is the 12 rib, 3 ring one', () => {
    const d = createStructure('dome');
    expect(d.faces.length).toBe(36);
    expect(summarize(d).overall).toEqual({ widthMm: 3000, depthMm: 3000, heightMm: 1000 });
  });
});
