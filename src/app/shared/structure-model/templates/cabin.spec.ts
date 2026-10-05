import { faceShape, fillKey, panelSize, summarize } from '../derive';
import { checkStructure, createStructure } from '../operations';
import { defaultParams } from '../template';
import { barLengths, countRole, edgeUse, facesOf } from '../testing/helpers';
import { CABIN, frontLayout } from './cabin';

describe('cabin template', () => {
  describe('closed box 6000 × 4000 × 2400, 1000 panels, 900 door in the middle, glass roof', () => {
    const s = createStructure('cabin', { shape: 'box', width: 6000, depth: 4000, height: 2400, module: 1000, doorWidth: 900, doorAt: 50, roof: 'glass' });

    it('divides every wall evenly', () => {
      // Front: (6000 − 900) / 2 = 2550 each side of the door, 3 panels of 850.
      expect(facesOf(s, 'wall-front').map((f) => f.id)).toEqual(['front-1', 'front-2', 'front-3', 'door', 'door-top', 'front-4', 'front-5', 'front-6']);
      expect(panelSize(facesOf(s, 'wall-front')[0]).edges).toEqual([850, 2400]);
      expect(facesOf(s, 'wall-right').length).toBe(4);
      expect(facesOf(s, 'wall-back').length).toBe(6);
      expect(facesOf(s, 'wall-left').length).toBe(4);
      expect(facesOf(s, 'roof').length).toBe(6);
      expect(s.faces.length).toBe(28);
      expect(s.faces.every((f) => faceShape(f) === 'rectangle')).toBeTrue();
      expect(checkStructure(s)).toEqual([]);
    });

    it('has a door of 900 × 2100 with a light over it', () => {
      const door = s.faces.find((f) => f.id === 'door');
      expect(door && fillKey(door)).toBe('door');
      expect(door && panelSize(door).edges).toEqual([900, 2100]);
      expect(panelSize(s.faces.find((f) => f.id === 'door-top')!).edges).toEqual([900, 300]);
      expect(barLengths(s, 'transom')).toEqual([900]);
    });

    it('has the hand-counted bars', () => {
      expect(barLengths(s, 'corner_post')).toEqual(Array(4).fill(2400));
      expect(barLengths(s, 'frame')).toEqual([4000, 4000, 6000, 6000]); // one floor frame a wall
      expect(barLengths(s, 'eave')).toEqual([4000, 4000, 6000, 6000]);
      expect(countRole(s, 'coupler')).toBe(6 + 3 + 5 + 3);
      expect(barLengths(s, 'rafter')).toEqual(Array(5).fill(4000));
      expect(summarize(s).cornerPosts).toBe(4);
    });

    it('has the hand-calculated glass area', () => {
      // Walls 2 × (6 + 4) × 2.4 = 48 m², roof 6 × 4 = 24 m².
      expect(summarize(s).glassAreaSqM).toBeCloseTo(72, 2);
      expect(summarize(s).overall).toEqual({ widthMm: 6000, depthMm: 4000, heightMm: 2400 });
    });

    it('is closed: no edge belongs to more than two panels, and the roof meets every wall', () => {
      const use = edgeUse(s);
      expect(use.every((n) => n <= 2)).toBeTrue();
      const eaves = s.joints.filter((j) => j.role === 'eave');
      expect(eaves.every((j) => j.faceIds.some((id) => id.startsWith('roof-')))).toBeTrue();
    });
  });

  it('straight wall: one row of panels with a frame all round', () => {
    const s = createStructure('cabin', { shape: 'straight', width: 3000, height: 2400, module: 1000, doorWidth: 0 });
    expect(s.faces.length).toBe(3);
    expect(countRole(s, 'coupler')).toBe(2);
    expect(barLengths(s, 'frame')).toEqual([2400, 2400, 3000, 3000]);
    expect(countRole(s, 'corner_post')).toBe(0);
    expect(summarize(s).overall.depthMm).toBe(0);
    expect(checkStructure(s)).toEqual([]);
  });

  it('L and U: one and two corner posts, a wall plate on the building under a roof', () => {
    const l = createStructure('cabin', { shape: 'l', roof: 'none' });
    expect(countRole(l, 'corner_post')).toBe(1);
    expect(new Set(l.faces.map((f) => f.group))).toEqual(new Set(['wall-front', 'wall-right']));
    const u = createStructure('cabin', { shape: 'u', roof: 'solid' });
    expect(countRole(u, 'corner_post')).toBe(2);
    expect(countRole(u, 'wall_plate')).toBe(1);
    expect(facesOf(u, 'roof').every((f) => f.fill.kind === 'panel')).toBeTrue();
    expect(checkStructure(l)).toEqual([]);
    expect(checkStructure(u)).toEqual([]);
  });

  it('a door too near the end of the wall goes to the end', () => {
    const p = { ...defaultParams(CABIN), width: 3000, doorWidth: 900, doorAt: 0, module: 900 };
    expect(frontLayout(p).door).toBe(0);
    expect(frontLayout({ ...p, doorAt: 20 }).widths[0]).toBe(900); // 600 − 450 = 150 left of the door is a sliver
    expect(frontLayout({ ...p, doorAt: 100 }).door).toBe(frontLayout({ ...p, doorAt: 100 }).widths.length - 1);
    const sum = frontLayout({ ...p, doorAt: 37 }).widths.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(3000, 6);
  });

  it('a low cabin has a full-height door and no light over it', () => {
    const s = createStructure('cabin', { height: 2200 });
    expect(s.faces.some((f) => f.id === 'door-top')).toBeFalse();
    expect(panelSize(s.faces.find((f) => f.id === 'door')!).edges).toEqual([900, 2200]);
    expect(countRole(s, 'transom')).toBe(0);
  });
});
