import {
  crossedSide,
  highSides,
  isConvexPlan,
  moveSide,
  orientPlan,
  planArea,
  planProblem,
  pointAtLength,
  Pt,
  READY_PLANS,
  rectanglePlan,
  regularPlan,
  regularPolygonPlan,
  removeCorner,
  roofsFor,
  setSideLength,
  sideLength,
  slabsOf,
  snapCorner,
  splitSide,
} from './footprint';

const L: Pt[] = READY_PLANS.find((r) => r.key === 'l')!.plan;

describe('footprint: the plan of a structure drawn from nothing', () => {
  describe('while drawing', () => {
    const chain: Pt[] = [[0, 0], [3000, 0], [3000, 2000], [1000, 2000]];

    it('lets a side be drawn that crosses nothing', () => {
      expect(crossedSide(chain, [1000, 1000])).toBe(-1);
      expect(crossedSide([[0, 0]], [3000, 0])).toBe(-1);
    });

    it('refuses a side that would cross the outline, and names the side it crosses', () => {
      // From (1000, 2000) down through the first side.
      expect(crossedSide(chain, [1000, -500])).toBe(0);
      // Through the second side.
      expect(crossedSide([[0, 0], [3000, 0], [3000, 2000], [1000, 2000], [1000, 1000]], [4000, 1000])).toBe(1);
    });

    it('refuses a side that runs back over the one before', () => {
      expect(crossedSide([[0, 0], [3000, 0]], [1000, 0])).toBe(0);
    });

    it('refuses to close a shape whose last side would cross it', () => {
      // A bow tie: the side back to the first corner crosses the second side.
      expect(crossedSide([[0, 0], [3000, 0], [0, 2000], [3000, 2000]], [0, 0], true)).toBe(1);
      expect(crossedSide([[0, 0], [3000, 0], [3000, 2000], [0, 2000]], [0, 0], true)).toBe(-1);
    });

    it('snaps a corner to a right angle, to 45°, to the first corner and otherwise to the 100 mm grid', () => {
      expect(snapCorner([[0, 0]], [2960, 70], 250)).toEqual({ point: [3000, 0], kind: 'angle' });
      expect(snapCorner([[0, 0]], [2040, 1960], 250)).toEqual({ point: [2000, 2000], kind: 'angle' });
      expect(snapCorner([[0, 0]], [2030, 930], 100)).toEqual({ point: [2000, 900], kind: 'grid' });
      expect(snapCorner([[0, 0], [3000, 0], [3000, 2000]], [90, 60], 250)).toEqual({ point: [0, 0], kind: 'close' });
      // Two corners cannot be closed: the first corner does not catch the pointer yet.
      expect(snapCorner([[0, 0], [3000, 0]], [90, 60], 250).kind).not.toBe('close');
    });

    it('puts a typed length along the direction shown', () => {
      expect(pointAtLength([0, 0], [500, 0], 2750)).toEqual([2750, 0]);
      expect(pointAtLength([1000, 1000], [1000, 1300], 1800)).toEqual([1000, 2800]);
    });
  });

  describe('a closed plan', () => {
    it('is sound for every ready plan, and stored so that each side runs left to right seen from outside', () => {
      for (const r of READY_PLANS) {
        expect(planProblem(r.plan)).withContext(r.key).toBeNull();
        expect(planArea(r.plan)).withContext(r.key).toBeLessThan(0);
      }
      expect(planArea(orientPlan([[0, 0], [3000, 0], [3000, 2000], [0, 2000]]))).toBeLessThan(0);
    });

    it('says in plain words what is wrong, and on which side', () => {
      expect(planProblem([[0, 0], [3000, 0]])?.message).toBe('A plan needs at least 3 corners.');
      expect(planProblem([[0, 0], [3000, 0], [0, 2000], [3000, 2000]])).toEqual({ side: 3, message: 'Side 4 crosses side 2.' });
      expect(planProblem([[0, 0], [200, 0], [200, 2000], [0, 2000]])).toEqual({ side: 0, message: 'Side 1 is shorter than 300 mm.' });
      expect(planProblem(rectanglePlan(40000, 3000))?.message).toBe('A plan can be 30 m long at most.');
    });

    it('offers only the roofs the plan can carry', () => {
      expect(roofsFor(rectanglePlan(3600, 2400))).toEqual(['none', 'flat', 'leanto', 'gable', 'hipped', 'pyramid']);
      expect(roofsFor(L)).toEqual(['none', 'flat', 'leanto', 'gable']);
      expect(roofsFor(regularPolygonPlan(12, 4000))).toEqual(['none', 'flat', 'leanto', 'gable', 'hipped', 'pyramid', 'dome']);
      expect(isConvexPlan(L)).toBeFalse();
    });

    it('lets a lean-to be high only on a side the whole plan lies behind', () => {
      // The L has six sides; the two of its inward corner cannot carry the high end.
      expect(highSides(L).length).toBe(4);
      expect(highSides(rectanglePlan(3600, 2400))).toEqual([0, 1, 2, 3]);
    });

    it('knows a regular plan and its circle', () => {
      const round = regularPlan(regularPolygonPlan(8, 3000));
      expect(round?.radius).toBeCloseTo(1500, 0);
      expect(regularPlan(rectanglePlan(3000, 3000))).toBeNull();
      expect(regularPlan(L)).toBeNull();
    });

    it('a typed length keeps a rectangle a rectangle', () => {
      const plan = rectanglePlan(3600, 2400);
      const wider = setSideLength(plan, 1, 5000);
      expect(Math.round(sideLength(wider, 1))).toBe(5000);
      expect(Math.round(sideLength(wider, 3))).toBe(5000);
      expect(Math.abs(planArea(wider))).toBe(5000 * 2400);
      expect(planProblem(wider)).toBeNull();
    });

    it('a side is pushed square to itself; a corner is added and removed', () => {
      const plan = rectanglePlan(3600, 2400);
      const deeper = moveSide(plan, 1, 600);
      expect(Math.abs(planArea(deeper))).toBe(3600 * 3000);
      const five = splitSide(plan, 1);
      expect(five.length).toBe(5);
      expect(five[2]).toEqual([1800, 2400]);
      expect(removeCorner(five, 2)).toEqual(plan);
      expect(removeCorner([[0, 0], [1000, 0], [0, 1000]], 0).length).toBe(3);
    });
  });

  describe('cut into flat roof pieces', () => {
    it('covers an L exactly, with pieces that have no inward corner', () => {
      const slabs = slabsOf(L, [1, 0], 900);
      const pieces = slabs.flatMap((s) => s.pieces);
      expect(pieces.every((p) => p.pts.length === 4 && isConvexPlan(p.pts))).toBeTrue();
      const area = pieces.reduce((sum, p) => sum + Math.abs(planArea(p.pts)), 0);
      expect(area).toBeCloseTo(4800 * 3600 - 2400 * 1800, 3);
      // A cut line runs through the inward corner: no piece spans it.
      expect(slabs.some((s) => Math.abs(s.c1 - 2400) < 0.01)).toBeTrue();
    });

    it('gives triangles at a pointed end', () => {
      const pieces = slabsOf([[0, 0], [0, 2000], [3000, 1000]], [1, 0], 5000).flatMap((s) => s.pieces);
      expect(pieces.length).toBe(1);
      expect(pieces[0].pts.length).toBe(3);
    });
  });
});
