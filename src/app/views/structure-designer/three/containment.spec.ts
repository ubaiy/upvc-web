import { BufferGeometry, LineSegments, Mesh, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import {
  bounds,
  createStructure,
  defaultParams,
  Dim,
  faceCorners,
  FillKey,
  FREE,
  formatPlan,
  gableRidges,
  normalizeParams,
  orientPlan,
  Params,
  paramsOf,
  Pt,
  regularPolygonPlan,
  roofsFor,
  roofsOffered,
  setFaceFill,
  Structure,
  TEMPLATES,
  Vec3,
} from '../../../shared/structure-model';
import { Gizmos } from './gizmos';
import { buildStructure, createMaterials, disposeMaterials, disposeStructure, insideOutline, traceOpenings } from './structure-mesh';

/**
 * Card T173: nothing is drawn outside the design. For every template and a set of plans drawn from
 * nothing, after a set of changes of the sizes, every piece of hardware and every line of an opening
 * sign lies on its own sash, every bar and every piece lies inside the structure, every handle sits
 * on the structure, and a guide line is in the scene only while a size is hovered, dragged or typed.
 */
describe('structure-designer: nothing is drawn outside the design', () => {
  const materials = createMaterials();
  afterAll(() => disposeMaterials(materials));

  // In the stored direction, as the designer keeps them.
  const RECT = orientPlan([[0, 0], [4800, 0], [4800, 3600], [0, 3600]]);
  const L = orientPlan([[0, 0], [4800, 0], [4800, 3600], [2400, 3600], [2400, 1800], [0, 1800]]);
  const DEEP_L = orientPlan([[0, 0], [4800, 0], [4800, 3600], [1200, 3600], [1200, 2700], [0, 2700]]);
  const U = orientPlan([[0, 0], [6000, 0], [6000, 3600], [4500, 3600], [4500, 2400], [1500, 2400], [1500, 3600], [0, 3600]]);
  const T = orientPlan([[0, 0], [4800, 0], [4800, 1800], [3300, 1800], [3300, 3600], [1500, 3600], [1500, 1800], [0, 1800]]);
  const BAY = orientPlan([[0, 0], [3600, 0], [3600, 2400], [2700, 3300], [900, 3300], [0, 2400]]);
  const PLANS: Record<string, Pt[]> = { RECT, L, DEEP_L, U, T, BAY, ROUND8: regularPolygonPlan(8, 4000) };
  const OPENINGS: FillKey[] = ['casement', 'top-hung', 'door', 'sliding'];

  /** Every structure the checks run on: each template and each plan with each roof, at several sizes. */
  function cases(): { name: string; structure: Structure }[] {
    const out: { name: string; structure: Structure }[] = [];
    for (const def of TEMPLATES) {
      const base = defaultParams(def);
      out.push({ name: `${def.kind} at its default size`, structure: def.generate(base) });
      for (const share of [0.2, 0.8]) {
        const p: Params = { ...base };
        for (const spec of def.params) {
          if ((spec.type === 'mm' || spec.type === 'deg') && spec.min !== undefined && spec.max !== undefined) p[spec.key] = spec.min + (spec.max - spec.min) * share;
        }
        out.push({ name: `${def.kind} with every size at ${share * 100} % of its range`, structure: def.generate(normalizeParams(def, p)) });
      }
      for (const spec of def.params) {
        if (spec.type !== 'choice') continue;
        for (const option of spec.options ?? []) out.push({ name: `${def.kind}, ${spec.key} = ${option.value}`, structure: def.generate(normalizeParams(def, { ...base, [spec.key]: option.value })) });
      }
    }
    const changes: Params[] = [{}, { height: 3000, pitch: 35, module: 600, rise: 1800 }, { height: 2100, pitch: 8, module: 1500, rise: 600 }, { ridge: 'across', pitch: 25 }, { walls: 'wohw' }];
    for (const [key, plan] of Object.entries(PLANS)) {
      for (const roof of roofsFor(plan)) {
        changes.forEach((change, i) => out.push({ name: `own plan ${key}, roof ${roof}, change ${i}`, structure: createStructure(FREE.kind, { plan: formatPlan(plan), roof, ...change }) }));
      }
    }
    return out;
  }

  const ALL = cases();

  it('runs on every template and on own plans with every roof they can carry', () => {
    expect(ALL.length).toBeGreaterThan(150);
    expect(new Set(ALL.map((c) => c.structure.template?.kind))).toEqual(new Set(['dome', 'cabin', 'bay', 'pyramid', 'lean-to', 'gable', 'free']));
  });

  it('keeps every handle, hinge, stay and line of an opening sign on its own sash, whatever the shape of the panel', () => {
    const bad: string[] = [];
    let sloped = 0;
    let withHardware = 0;
    for (const c of ALL) {
      for (const opening of OPENINGS) {
        const opened = setFaceFill(c.structure, c.structure.faces.map((f) => f.id), opening);
        for (const trace of traceOpenings(opened)) {
          const where = `${c.name}: ${trace.faceId} as ${opening}`;
          for (const part of trace.parts) if (!part.every((p) => insideOutline(trace.sash, p, 1))) bad.push(`${where}: a piece of hardware leaves the sash`);
          for (const line of trace.lines) if (!line.every((p) => insideOutline(trace.pane, p, 1))) bad.push(`${where}: the opening sign leaves the glass`);
          // The sash is inside the panel it belongs to.
          const face = opened.faces.find((f) => f.id === trace.faceId)!;
          if (!trace.sash.every((p) => insideOutline(face.outline, p, 1))) bad.push(`${where}: the sash leaves its panel`);
          if (opening === 'sliding') continue;
          // A wall panel of four sides, sloped head or not, big enough to carry them, has all its pieces.
          const vs = trace.pane.map((p) => p[1]);
          const us = trace.pane.map((p) => p[0]);
          const upright = trace.pane.filter((p, i) => Math.abs(p[0] - trace.pane[(i + 1) % trace.pane.length][0]) < 1).length;
          if (face.role !== 'wall' || trace.pane.length !== 4 || upright !== 2 || Math.max(...us) - Math.min(...us) < 450) continue;
          const stiles = trace.pane.map((p, i) => (Math.abs(p[0] - trace.pane[(i + 1) % 4][0]) < 1 ? Math.abs(p[1] - trace.pane[(i + 1) % 4][1]) : Infinity));
          if (Math.min(...stiles) < 700) continue;
          withHardware++;
          if (new Set(vs.map((v) => Math.round(v))).size > 2) sloped++;
          const pieces = opening === 'door' ? 5 : 4;
          if (trace.parts.length !== pieces) bad.push(`${where}: ${trace.parts.length} pieces of hardware, ${pieces} expected`);
          if (trace.lines.length !== 2) bad.push(`${where}: ${trace.lines.length} lines in the sign, 2 expected`);
        }
      }
    }
    expect(bad.slice(0, 12)).toEqual([]);
    expect(bad.length).toBe(0);
    // The check means something: many panels under a slope were among them.
    expect(withHardware).toBeGreaterThan(2000);
    expect(sloped).toBeGreaterThan(300);
  });

  it('on a panel with a sloped head: hinges on the upright stile, the handle on the other, the sign inside the real outline', () => {
    // A lean-to side wall: its first panel is 2100 high at the front and higher at the building.
    let s = createStructure('lean-to');
    const face = s.faces.find((f) => f.id === 'right-1')!;
    const heights = face.outline.map((p) => p[1]);
    expect(new Set(heights.map((v) => Math.round(v))).size).toBe(3); // a raked head
    s = setFaceFill(s, ['right-1'], 'casement');
    const trace = traceOpenings(s).find((t) => t.faceId === 'right-1')!;
    const us = trace.pane.map((p) => p[0]);
    const [left, right] = [Math.min(...us), Math.max(...us)];
    const centre = (part: [number, number][]): [number, number] => [part.reduce((a, p) => a + p[0], 0) / 4, part.reduce((a, p) => a + p[1], 0) / 4];
    const [hinge1, hinge2, plate, lever] = trace.parts.map(centre);
    // Hinges just outside the glass on the left stile, between the foot and the LOWER end of that stile's head.
    const leftTop = Math.max(...trace.pane.filter((p) => Math.abs(p[0] - left) < 1).map((p) => p[1]));
    const rightTop = Math.max(...trace.pane.filter((p) => Math.abs(p[0] - right) < 1).map((p) => p[1]));
    for (const hinge of [hinge1, hinge2]) {
      expect(hinge[0]).toBeLessThan(left);
      expect(hinge[0]).toBeGreaterThan(left - 42);
      expect(hinge[1]).toBeLessThan(leftTop);
    }
    expect(plate[0]).toBeGreaterThan(right);
    expect(plate[1]).toBeCloseTo((Math.min(...trace.pane.map((p) => p[1])) + rightTop) / 2, 0);
    expect(lever[0]).toBeLessThan(plate[0]);
    // The sign: from the two corners of the lock stile to the middle of the hinge stile. No end is above the head.
    for (const [from, to] of trace.lines) {
      expect(Math.abs(from[0] - right)).toBeLessThan(1);
      expect(Math.abs(to[0] - left)).toBeLessThan(1);
      expect(from[1]).toBeLessThanOrEqual(rightTop + 0.01);
    }
    expect(leftTop).not.toBeCloseTo(rightTop, 0);
  });

  it('draws every bar, knuckle, piece of hardware and sign line inside the structure', () => {
    // Half the diagonal of the largest section (ridge 80 × 110), and the lift of a handle from its face.
    const REACH = 72;
    const bad: string[] = [];
    for (const c of ALL) {
      const opened = setFaceFill(c.structure, c.structure.faces.filter((f) => f.role === 'wall').map((f) => f.id), 'casement');
      const box = bounds(opened);
      const object = buildStructure(opened, materials);
      object.root.traverse((o) => {
        const g = (o as Mesh | LineSegments).geometry as BufferGeometry | undefined;
        if (!g) return;
        const pos = g.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
          if (p.some((x, k) => x < box.min[k] - REACH || x > box.max[k] + REACH)) {
            bad.push(`${c.name}: a point of ${o.type} at ${p.map((x) => Math.round(x)).join(', ')} is outside ${box.min.map(Math.round).join(', ')} … ${box.max.map(Math.round).join(', ')}`);
            break;
          }
        }
      });
      disposeStructure(object);
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  /** Distance from a point to the nearest bar line or panel of the structure, mm. */
  function distanceToStructure(s: Structure, at: Vec3): number {
    const p = new Vector3(...at);
    let best = Infinity;
    const closest = new Vector3();
    for (const j of s.joints) {
      const a = new Vector3(...j.a);
      const ab = new Vector3(...j.b).sub(a);
      const t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
      best = Math.min(best, closest.copy(a).addScaledVector(ab, t).distanceTo(p));
    }
    for (const face of s.faces) {
      const { origin, u, v } = face.plane;
      const rel = p.clone().sub(new Vector3(...origin));
      const uv: [number, number] = [rel.dot(new Vector3(...u)), rel.dot(new Vector3(...v))];
      const off = Math.abs(rel.dot(new Vector3().crossVectors(new Vector3(...u), new Vector3(...v))));
      if (insideOutline(face.outline, uv, 0.5)) best = Math.min(best, off);
    }
    return best;
  }

  it('puts every drag handle on the structure; no guide goes below the floor, and each is as long as the size it measures', () => {
    const bad: string[] = [];
    for (const c of ALL) {
      const own = paramsOf(c.structure)!;
      for (const dim of own.def.dims(own.params)) {
        if (dim.handle) {
          const d = distanceToStructure(c.structure, dim.handle.at);
          if (d > 1) bad.push(`${c.name}: the handle of "${dim.label}" is ${Math.round(d)} mm off the structure`);
        }
        for (const end of [dim.a, dim.b]) {
          if (end[1] < -0.01) bad.push(`${c.name}: the guide of "${dim.label}" ends at height ${Math.round(end[1])}`);
        }
        if (dim.unit === 'mm' && (dim.a[0] !== dim.b[0] || dim.a[1] !== dim.b[1] || dim.a[2] !== dim.b[2])) {
          const length = new Vector3(...dim.a).distanceTo(new Vector3(...dim.b));
          if (Math.abs(length - dim.value) > 0.5) bad.push(`${c.name}: the guide of "${dim.label}" is ${Math.round(length)} long for a size of ${dim.value}`);
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('the height handle of an own plan is on a wall top of exactly the wall height, also under a slope', () => {
    for (const roof of ['leanto', 'gable', 'flat'] as const) {
      const s = createStructure(FREE.kind, { plan: formatPlan(RECT), roof, pitch: 20 });
      const own = paramsOf(s)!;
      const [dim] = own.def.dims(own.params);
      expect(dim.handle!.at[1]).withContext(roof).toBe(2400);
      expect(dim.b[1] - dim.a[1]).withContext(roof).toBe(2400);
      // At the corner nearest the usual view: the front right one.
      expect([dim.handle!.at[0], dim.handle!.at[2]]).withContext(roof).toEqual([4800, 3600]);
    }
  });

  describe('guide lines', () => {
    const guides = (g: Gizmos): LineSegments[] => {
      const out: LineSegments[] = [];
      g.root.traverse((o) => {
        if ((o as LineSegments).isLineSegments) out.push(o as LineSegments);
      });
      return out;
    };
    const camera = new PerspectiveCamera(32, 1, 10, 100000);
    camera.position.set(0, 1200, 12000);
    camera.lookAt(0, 1200, 0);
    camera.updateMatrixWorld();
    const rayAt = (p: Vec3): Raycaster => {
      const ndc = new Vector3(...p).project(camera);
      const ray = new Raycaster();
      ray.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
      return ray;
    };
    const dimsOf = (s: Structure): Dim[] => {
      const own = paramsOf(s)!;
      return own.def.dims(own.params);
    };

    it('no guide is in the scene when nothing is hovered, dragged or typed: for every structure', () => {
      const g = new Gizmos('#0e6f6a');
      for (const c of ALL) {
        g.setDims(dimsOf(c.structure));
        expect(guides(g).length).withContext(c.name).toBe(0);
        expect(g.guide).withContext(c.name).toBeNull();
      }
      g.dispose();
    });

    it('one guide while a handle is hovered or dragged, from one end of its size to the other, and gone afterwards', () => {
      const g = new Gizmos('#0e6f6a');
      const dims = dimsOf(createStructure('cabin'));
      g.setDims(dims);
      g.face(camera, 800);
      const height = dims.find((d) => d.id === 'height')!;
      expect(g.hover(rayAt(height.handle!.at))).toBeTrue();
      let lines = guides(g);
      expect(lines.length).toBe(1);
      expect(lines[0].userData['dim']).toBe('height');
      lines[0].geometry.computeBoundingBox();
      const box = lines[0].geometry.boundingBox!;
      // Exactly the measured height: from the floor to the top of the wall, and only the end ticks wide.
      expect([box.min.y, box.max.y]).toEqual([0, height.value]);
      expect(box.max.x - box.min.x).toBeLessThanOrEqual(90);
      expect(box.max.z - box.min.z).toBeLessThanOrEqual(90);
      // Dragged: the structure is rebuilt on every step and the guide follows the size.
      expect(g.grab(rayAt(height.handle!.at), false)).toEqual({ id: 'height', value: height.value });
      g.setDims(dimsOf(createStructure('cabin', { height: 2600 })));
      lines = guides(g);
      expect(lines.length).toBe(1);
      lines[0].geometry.computeBoundingBox();
      expect(lines[0].geometry.boundingBox!.max.y).toBe(2600);
      g.release();
      // Still under the pointer after the drag; gone when the pointer leaves the view.
      expect(guides(g).length).toBe(1);
      expect(g.unhover()).toBeTrue();
      expect(guides(g).length).toBe(0);
      // Hovering empty space shows none.
      g.hover(rayAt([9000, 9000, 0]));
      expect(guides(g).length).toBe(0);
      g.dispose();
    });

    it('the guide of a size shows while its label is pointed at or typed in', () => {
      const g = new Gizmos('#0e6f6a');
      g.setDims(dimsOf(createStructure('lean-to')));
      expect(g.setActive('width')).toBeTrue();
      expect(guides(g).map((l) => l.userData['dim'])).toEqual(['width']);
      // A size shown as a label only (the pitch) has no line.
      g.setActive('pitch');
      expect(guides(g).length).toBe(0);
      g.setActive('eave');
      expect(guides(g).map((l) => l.userData['dim'])).toEqual(['eave']);
      expect(g.setActive(null)).toBeTrue();
      expect(guides(g).length).toBe(0);
      expect(g.setActive(null)).toBeFalse();
      g.dispose();
    });
  });

  describe('a roof is what its name says', () => {
    it('a gable is offered only where the ridge has a slope on both sides', () => {
      expect(gableRidges(RECT)).toEqual(['along', 'across']);
      // An L whose ridge would lie on the inner edge: one part would be a single slope under a tall wall.
      expect(gableRidges(L)).toEqual([]);
      expect(roofsOffered(L)).toEqual(['none', 'flat', 'leanto']);
      // An L with a small notch has roof on both sides of the ridge either way; a U only with the ridge along its back.
      expect(gableRidges(DEEP_L)).toEqual(['along', 'across']);
      expect(gableRidges(U)).toEqual(['along']);
      expect(roofsOffered(U)).toContain('gable');
      const roofSpec = FREE.params.find((p) => p.key === 'roof')!;
      expect(roofSpec.optionsFor!({ ...defaultParams(FREE), plan: formatPlan(L) }).map((o) => o.value)).toEqual(['none', 'flat', 'leanto']);
      // A structure saved with that gable keeps it, and keeps showing it as its roof.
      const saved = createStructure(FREE.kind, { plan: formatPlan(L), roof: 'gable' });
      expect(saved.template!.params['roof']).toBe('gable');
      expect(roofSpec.optionsFor!(saved.template!.params).map((o) => o.value)).toContain('gable');
    });

    it('a gable newly chosen takes the ridge that gives two slopes', () => {
      const s = createStructure(FREE.kind, { plan: formatPlan(U), roof: 'gable', ridge: 'across' });
      expect(s.template!.params['ridge']).toBe('along');
    });

    for (const [key, plan] of Object.entries({ RECT, DEEP_L, U, BAY })) {
      it(`gable on ${key}: a ridge at the top, a slope down each side of it, end walls filled up to the slopes`, () => {
        const s = createStructure(FREE.kind, { plan: formatPlan(plan), roof: 'gable', pitch: 20 });
        const ridges = s.joints.filter((j) => j.role === 'ridge');
        expect(ridges.length).toBeGreaterThan(0);
        const top = bounds(s).max[1];
        for (const r of ridges) for (const y of [r.a[1], r.b[1]]) expect(y).toBeCloseTo(top, 6);
        // Two groups of roof panels, each sloping, falling away from the ridge to opposite sides.
        const normals = ['roof-a', 'roof-b'].map((group) => {
          const faces = s.faces.filter((f) => f.group === group);
          expect(faces.length).withContext(group).toBeGreaterThan(0);
          const { u, v } = faces[0].plane;
          return new Vector3().crossVectors(new Vector3(...u), new Vector3(...v));
        });
        for (const n of normals) expect(Math.acos(n.y) * (180 / Math.PI)).toBeCloseTo(20, 3);
        expect(normals[0].clone().setY(0).normalize().dot(normals[1].clone().setY(0).normalize())).toBeCloseTo(-1, 6);
        // Every wall panel reaches the roof above it: its top corners are corners of the roof's edge.
        const roofPoints = s.faces.filter((f) => f.role === 'roof').flatMap(faceCorners);
        const wallTops = s.faces.filter((f) => f.role === 'wall').flatMap((f) => faceCorners(f).filter((p) => p[1] > 1));
        const onRoof = (p: Vec3): boolean =>
          s.faces.some((f) => {
            if (f.role !== 'roof') return false;
            const rel = new Vector3(...p).sub(new Vector3(...f.plane.origin));
            const n = new Vector3().crossVectors(new Vector3(...f.plane.u), new Vector3(...f.plane.v));
            return Math.abs(rel.dot(n)) < 0.5 && insideOutline(f.outline, [rel.dot(new Vector3(...f.plane.u)), rel.dot(new Vector3(...f.plane.v))], 0.5);
          });
        expect(roofPoints.length).toBeGreaterThan(0);
        expect(wallTops.filter((p) => !onRoof(p)).length).toBe(0);
        // The gable ends: some wall panel reaches the ridge height.
        expect(Math.max(...wallTops.map((p) => p[1]))).toBeCloseTo(top, 3);
      });
    }

    it('a lean-to is one slope; a hipped roof has hips and no gable end; a pyramid comes to one point', () => {
      const lean = createStructure(FREE.kind, { plan: formatPlan(RECT), roof: 'leanto', pitch: 15 });
      const leanNormals = new Set(lean.faces.filter((f) => f.role === 'roof').map((f) => f.plane.v.map((x) => x.toFixed(4)).join()));
      expect(leanNormals.size).toBe(1);
      expect(lean.joints.some((j) => j.role === 'ridge')).toBeFalse();
      const hipped = createStructure(FREE.kind, { plan: formatPlan(RECT), roof: 'hipped', pitch: 25 });
      expect(hipped.joints.filter((j) => j.role === 'hip').length).toBe(4);
      expect(hipped.joints.filter((j) => j.role === 'ridge').length).toBe(1);
      // No wall rises above the wall height: all four sides are eaves.
      expect(Math.max(...hipped.faces.filter((f) => f.role === 'wall').flatMap((f) => faceCorners(f).map((p) => p[1])))).toBe(2400);
      const pyramid = createStructure(FREE.kind, { plan: formatPlan(RECT), roof: 'pyramid', rise: 1200 });
      const apexes = pyramid.joints.filter((j) => j.role === 'hip').map((j) => (j.a[1] > j.b[1] ? j.a : j.b).join());
      expect(new Set(apexes).size).toBe(1);
      expect(pyramid.hubs.filter((h) => h.role === 'crown').length).toBe(1);
    });
  });
});
