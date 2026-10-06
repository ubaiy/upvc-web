import { faceShape, fillKey, panelSize, summarize } from '../derive';
import { formatPlan, Pt, READY_PLANS, rectanglePlan, regularPolygonPlan, roofsFor } from '../footprint';
import { checkStructure, createStructure, paramsOf, parseStructure, retemplate, serializeStructure, setFaceFill } from '../operations';
import { barLengths, countRole, edgeUse, facesOf } from '../testing/helpers';
import { Structure } from '../types';
import { roofRefusal } from './free';

const RECT = formatPlan(rectanglePlan(3600, 2400));
const L: Pt[] = READY_PLANS.find((r) => r.key === 'l')!.plan;
const roofFaces = (s: Structure) => s.faces.filter((f) => f.role === 'roof');
const walls = (s: Structure) => s.faces.filter((f) => f.role === 'wall');
const free = (params: Record<string, string | number>): Structure => createStructure('free', params);

describe('free structure: walls and a roof on the user\'s own plan', () => {
  describe('walls rise from the plan', () => {
    const s = free({ plan: RECT, height: 2400, module: 900, roof: 'none' });

    it('one wall a side, divided evenly close to the panel width', () => {
      // 3600 / 900 = 4 panels of 900; 2400 / 900 → 3 panels of 800.
      expect(facesOf(s, 'wall-1').length).toBe(3);
      expect(facesOf(s, 'wall-2').length).toBe(4);
      expect(panelSize(facesOf(s, 'wall-2')[0]).edges).toEqual([900, 2400]);
      expect(panelSize(facesOf(s, 'wall-1')[0]).edges).toEqual([800, 2400]);
      expect(s.faces.length).toBe(14);
      expect(s.faces.every((f) => faceShape(f) === 'rectangle' && fillKey(f) === 'fixed')).toBeTrue();
      expect(checkStructure(s)).toEqual([]);
    });

    it('has the hand-counted bars', () => {
      expect(barLengths(s, 'corner_post')).toEqual([2400, 2400, 2400, 2400]);
      // A floor frame and a head frame a wall (no roof: the head is a frame, not an eave).
      expect(barLengths(s, 'frame')).toEqual([2400, 2400, 2400, 2400, 3600, 3600, 3600, 3600]);
      expect(countRole(s, 'coupler')).toBe(2 + 3 + 2 + 3);
      expect(summarize(s).glassAreaSqM).toBeCloseTo(2 * (3.6 + 2.4) * 2.4, 2);
      expect(summarize(s).overall).toEqual({ widthMm: 3600, depthMm: 2400, heightMm: 2400 });
    });

    it('every wall looks outward, also in an inward corner of an L', () => {
      const l = free({ plan: formatPlan(L), roof: 'none' });
      expect(walls(l).length).toBe(19);
      expect(countRole(l, 'corner_post')).toBe(6);
      // Wall area = perimeter × height.
      expect(summarize(l).glassAreaSqM).toBeCloseTo(2 * (4.8 + 3.6) * 2.4, 2);
      expect(checkStructure(l)).toEqual([]);
    });

    it('a panel changed by hand stays as it is while the structure is reshaped', () => {
      const door = setFaceFill(s, ['w2-2'], 'door');
      const taller = retemplate(door, { height: 2700 });
      expect(fillKey(taller.faces.find((f) => f.id === 'w2-2')!)).toBe('door');
      expect(summarize(taller).overall.heightMm).toBe(2700);
    });
  });

  describe('a side can be open, or against the existing wall', () => {
    it('against the existing wall: no panels and no posts there, a wall plate under the roof', () => {
      const s = free({ plan: RECT, roof: 'flat', walls: 'wwwh' });
      expect(facesOf(s, 'wall-4').length).toBe(0);
      expect(barLengths(s, 'wall_plate')).toEqual([3600]);
      expect(countRole(s, 'corner_post')).toBe(2);
      expect(barLengths(s, 'eave')).toEqual([2400, 2400, 3600]);
      expect(checkStructure(s)).toEqual([]);
    });

    it('open: one opening between its posts, under an eave beam', () => {
      const s = free({ plan: RECT, roof: 'flat', walls: 'wowh' });
      const open = facesOf(s, 'wall-2');
      expect(open.length).toBe(1);
      expect(fillKey(open[0])).toBe('open');
      expect(countRole(s, 'eave')).toBe(3);
      // The opening is not glass: only two walls and the roof are.
      expect(summarize(s).glassAreaSqM).toBeCloseTo(2 * 2.4 * 2.4 + 3.6 * 2.4, 2);
    });
  });

  describe('the roofs', () => {
    it('flat: panels across the longest side, a rafter between them', () => {
      const s = free({ plan: RECT, roof: 'flat' });
      expect(roofFaces(s).length).toBe(4);
      expect(roofFaces(s).every((f) => panelSize(f).text === '900 × 2400')).toBeTrue();
      expect(barLengths(s, 'rafter')).toEqual([2400, 2400, 2400]);
      expect(barLengths(s, 'eave')).toEqual([2400, 2400, 3600, 3600]);
      expect(edgeUse(s).every((n) => n <= 2)).toBeTrue();
    });

    it('flat on an L: flat four-sided panels that cover the plan exactly', () => {
      const s = free({ plan: formatPlan(L), roof: 'flat' });
      const area = roofFaces(s).reduce((sum, f) => sum + panelSize(f).edges[0] * panelSize(f).edges[1], 0);
      expect(roofFaces(s).every((f) => faceShape(f) === 'rectangle')).toBeTrue();
      expect(area).toBe(4800 * 3600 - 2400 * 1800);
      expect(checkStructure(s)).toEqual([]);
    });

    it('lean-to: the chosen wall is the high one, the pitch gives its height', () => {
      // High on wall 4 (the back), 2400 deep at 20°: 2400 + 2400 × tan 20° = 3273.5.
      const s = free({ plan: RECT, roof: 'leanto', highSide: '4', pitch: 20 });
      expect(summarize(s).overall.heightMm).toBe(3274);
      const slope = Math.round((2400 / Math.cos((20 * Math.PI) / 180)) * 10) / 10;
      // Three rafters between the four roof panels and one on each raked side wall.
      expect(barLengths(s, 'rafter')).toEqual(Array(5).fill(slope));
      expect(roofFaces(s).length).toBe(4);
      expect(facesOf(s, 'wall-1').every((f) => faceShape(f) === 'trapezoid')).toBeTrue();
      expect(facesOf(s, 'wall-4').every((f) => panelSize(f).edges[1] === 3274)).toBeTrue();
      expect(checkStructure(s)).toEqual([]);
    });

    it('lean-to: a side the plan does not lie behind is not taken as the high side', () => {
      const s = free({ plan: formatPlan(L), roof: 'leanto', highSide: '4' });
      expect(paramsOf(s)?.params['highSide']).not.toBe('4');
      expect(paramsOf(s)?.def.params.find((p) => p.key === 'highSide')?.optionsFor?.(paramsOf(s)!.params).length).toBe(4);
    });

    it('gable: one ridge along the longest wall, two slopes, pointed end walls', () => {
      // Half span 1200 at 15°: 2400 + 1200 × tan 15° = 2721.5.
      const s = free({ plan: RECT, roof: 'gable', ridge: 'along', pitch: 15 });
      expect(barLengths(s, 'ridge')).toEqual([3600]);
      expect(s.hubs.filter((h) => h.role === 'ridge_end').length).toBe(2);
      expect(summarize(s).overall.heightMm).toBe(2722);
      expect(facesOf(s, 'roof-a').length).toBe(4);
      expect(facesOf(s, 'roof-b').length).toBe(4);
      // The end walls are divided at the ridge, so every panel is still a flat four-sided one.
      expect(facesOf(s, 'wall-1').length).toBe(2);
      expect(checkStructure(s)).toEqual([]);
    });

    it('gable: the ridge can run across instead', () => {
      const s = free({ plan: RECT, roof: 'gable', ridge: 'across', pitch: 15 });
      expect(barLengths(s, 'ridge')).toEqual([2400]);
      expect(summarize(s).overall.heightMm).toBe(Math.round(2400 + 1800 * Math.tan((15 * Math.PI) / 180)));
    });

    it('hipped: a slope a side at one pitch, four hips and a short ridge', () => {
      const s = free({ plan: RECT, roof: 'hipped', pitch: 15 });
      expect(barLengths(s, 'ridge')).toEqual([1200]);
      expect(countRole(s, 'hip')).toBe(4);
      expect(barLengths(s, 'eave')).toEqual([2400, 2400, 3600, 3600]);
      expect(summarize(s).overall.heightMm).toBe(2722);
      expect(edgeUse(s).every((n) => n <= 2)).toBeTrue();
      expect(checkStructure(s)).toEqual([]);
    });

    it('pyramid: every side rises to one crown', () => {
      const s = free({ plan: RECT, roof: 'pyramid', rise: 1000 });
      expect(s.hubs.filter((h) => h.role === 'crown').length).toBe(1);
      expect(countRole(s, 'hip')).toBe(4);
      expect(summarize(s).overall.heightMm).toBe(3400);
    });

    it('dome on walls: the segments are the sides of the plan, the rings are the user\'s', () => {
      const s = free({ plan: formatPlan(regularPolygonPlan(12, 4000)), roof: 'dome', rings: 3, rise: 1200, height: 2100 });
      expect(roofFaces(s).length).toBe(36);
      expect(walls(s).length).toBe(12);
      expect(s.hubs.filter((h) => h.role === 'crown').length).toBe(1);
      expect(s.hubs.filter((h) => h.role === 'node').length).toBe(36);
      expect(countRole(s, 'rib')).toBe(36);
      expect(summarize(s).overall.heightMm).toBe(3300);
      expect(checkStructure(s)).toEqual([]);
      const five = free({ plan: formatPlan(regularPolygonPlan(16, 6000)), roof: 'dome', rings: 5 });
      expect(roofFaces(five).length).toBe(80);
    });

    it('a dome is never more than a hemisphere', () => {
      const s = free({ plan: formatPlan(regularPolygonPlan(12, 4000)), roof: 'dome', rise: 5000 });
      const rise = paramsOf(s)!.params['rise'] as number;
      expect(rise).toBeLessThanOrEqual(2000);
      expect(rise).toBeGreaterThan(1990);
    });

    it('a roof the plan cannot carry is not built: it is not offered, with the reason', () => {
      expect(paramsOf(free({ plan: RECT, roof: 'dome' }))?.params['roof']).toBe('flat');
      expect(paramsOf(free({ plan: formatPlan(L), roof: 'hipped' }))?.params['roof']).toBe('flat');
      expect(roofRefusal(L, 'hipped')).toBe('A hipped roof needs a plan with no inward corner.');
      expect(roofRefusal(rectanglePlan(3600, 2400), 'dome')).toContain('regular plan of 5 sides or more');
      expect(roofRefusal(L, 'flat')).toBe('');
    });

    it('every ready plan with every roof it is offered is a sound document of flat panels', () => {
      const plans = [...READY_PLANS.map((r) => r.plan), regularPolygonPlan(6, 3000), regularPolygonPlan(12, 4000)];
      for (const plan of plans) {
        for (const roof of roofsFor(plan)) {
          for (const sides of ['', 'hwo']) {
            const s = free({ plan: formatPlan(plan), roof, walls: sides });
            const what = `${formatPlan(plan)} ${roof} ${sides}`;
            expect(paramsOf(s)?.params['roof']).withContext(what).toBe(roof);
            expect(checkStructure(s)).withContext(what).toEqual([]);
            // A strip under a ridge end or a crown has five corners; nothing has more.
            expect(s.faces.every((f) => f.outline.length <= 5)).withContext(what).toBeTrue();
            expect(edgeUse(s).every((n) => n <= 2)).withContext(what).toBeTrue();
            const m = summarize(s);
            expect(m.barTotalMm).withContext(what).toBe(m.bars.reduce((sum, r) => sum + r.totalMm, 0));
          }
        }
      }
    });
  });

  describe('the document', () => {
    it('comes back from its saved text exactly, and can be reshaped again', () => {
      const s = setFaceFill(free({ plan: formatPlan(L), roof: 'gable', walls: 'wwwwwh', pitch: 25 }), ['w2-1'], 'door');
      const back = parseStructure(serializeStructure(s));
      expect(serializeStructure(back)).toBe(serializeStructure(s));
      expect(back.template?.kind).toBe('free');
      expect(paramsOf(back)?.params['plan']).toBe(formatPlan(L));
      const again = retemplate(back, { roof: 'flat' });
      expect(paramsOf(again)?.params['walls']).toBe('wwwwwh');
      expect(fillKey(again.faces.find((f) => f.id === 'w2-1')!)).toBe('door');
    });

    it('a plan that cannot be built is not taken: the structure keeps a plain rectangle', () => {
      const s = free({ plan: '0,0;3000,0;0,2000;3000,2000' });
      expect(paramsOf(s)?.params['plan']).toBe(RECT);
      expect(paramsOf(free({ plan: 'nonsense' }))?.params['plan']).toBe(RECT);
    });
  });
});
