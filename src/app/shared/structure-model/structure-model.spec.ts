import { barSection, BAR_SECTIONS } from './bar-sections';
import { clipPoly, evenParts, faceCorners, faceNormal, slicePoly, StructureBuilder, TaggedPoly } from './builder';
import { faceShape, fillKey, panelSize, summarize } from './derive';
import { History } from './history';
import {
  checkStructure,
  createStructure,
  groupFaceIds,
  paramsOf,
  parseStructure,
  renameStructure,
  retemplate,
  serializeStructure,
  setAppearance,
  setFaceFill,
} from './operations';
import { defaultParams, normalizeParams } from './template';
import { TEMPLATES, templateOf } from './templates';
import { STRUCTURE_SCHEMA, Vec3 } from './types';

describe('structure-model builder', () => {
  const square: TaggedPoly = {
    pts: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0], [0, 1000, 0]],
    roles: ['a', 'b', 'c', 'd'],
  };

  it('divides a length into even parts close to the target', () => {
    expect(evenParts(3000, 900)).toBe(3);
    expect(evenParts(2550, 1000)).toBe(3);
    expect(evenParts(300, 900)).toBe(1);
    expect(evenParts(3000, 0)).toBe(1);
  });

  it('clips a polygon and names the cut edge', () => {
    const left = clipPoly(square, [0, 0, 0], [1, 0, 0], 400, true, 'cut');
    expect(left.pts).toEqual([[0, 0, 0], [400, 0, 0], [400, 1000, 0], [0, 1000, 0]]);
    expect(left.roles).toEqual(['a', 'cut', 'c', 'd']);
    const right = clipPoly(square, [0, 0, 0], [1, 0, 0], 400, false, 'cut');
    expect(right.roles.filter((r) => r === 'cut').length).toBe(1);
    expect(right.pts.length).toBe(4);
  });

  it('slices a triangle through its apex into two triangles', () => {
    const tri: TaggedPoly = { pts: [[0, 0, 0], [1000, 0, 0], [500, 800, 0]], roles: ['', '', ''] };
    const parts = slicePoly(tri, [1, 0, 0], 2, 'cut');
    expect(parts.map((q) => q.pts.length)).toEqual([3, 3]);
    expect(parts.every((q) => q.roles.filter((r) => r === 'cut').length === 1)).toBeTrue();
  });

  it('turns every face outward, with u to the right and v up as seen from outside', () => {
    const b = new StructureBuilder([500, 500, -500]);
    // Given clockwise as seen from the front: the builder turns it round and the roles follow their edges.
    b.face({ id: 'f', label: 'F', role: 'wall', group: 'g', groupLabel: 'G', fill: { kind: 'open' }, pts: [...square.pts].reverse(), roles: ['c', 'b', 'a', 'd'] });
    const s = b.build('t', 'none', {});
    const face = s.faces[0];
    expect(faceNormal(face)).toEqual([0, 0, 1]);
    expect(face.plane.u).toEqual([1, 0, 0]);
    expect(face.plane.v).toEqual([0, 1, 0]);
    expect(face.plane.origin).toEqual([0, 0, 0]);
    expect(faceCorners(face).length).toBe(4);
    const role = (a: Vec3, c: Vec3): string | undefined =>
      s.joints.find((j) => (same(j.a, a) && same(j.b, c)) || (same(j.a, c) && same(j.b, a)))?.role;
    const same = (p: Vec3, q: Vec3): boolean => p.every((v, i) => Math.abs(v - q[i]) < 1e-6);
    expect(role([0, 0, 0], [1000, 0, 0])).toBe('a');
    expect(role([1000, 0, 0], [1000, 1000, 0])).toBe('b');
    expect(role([1000, 1000, 0], [0, 1000, 0])).toBe('c');
    expect(role([0, 1000, 0], [0, 0, 0])).toBe('d');
  });

  it('keeps one joint for an edge two faces share, and lists both faces', () => {
    const b = new StructureBuilder([0, 500, -500]);
    const base = { role: 'wall' as const, group: 'g', groupLabel: 'G', fill: { kind: 'open' as const } };
    b.face({ ...base, id: 'l', label: 'L', pts: [[-1000, 0, 0], [0, 0, 0], [0, 1000, 0], [-1000, 1000, 0]], roles: ['', 'coupler', '', ''] });
    b.face({ ...base, id: 'r', label: 'R', pts: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0], [0, 1000, 0]], roles: ['', '', '', 'mullion'] });
    b.bar([-1000, 0, 0], [1000, 0, 0], 'frame');
    const s = b.build('t', 'none', {});
    expect(s.joints.map((j) => j.role)).toEqual(['coupler', 'frame']); // the first role given to a line is kept
    expect(s.joints[0].faceIds).toEqual(['l', 'r']);
    expect(s.joints[1].faceIds).toEqual(['l', 'r']); // a long bar under two short edges
  });
});

describe('structure-model bar sections', () => {
  it('is the one table of roles, and still draws a role it does not know', () => {
    expect(new Set(BAR_SECTIONS.map((s) => s.role)).size).toBe(BAR_SECTIONS.length);
    expect(barSection('rib').label).toBe('Rib');
    expect(barSection('something_new').widthMm).toBeGreaterThan(0);
  });

  it('knows every role a template makes', () => {
    const known = new Set(BAR_SECTIONS.map((s) => s.role));
    for (const def of TEMPLATES) {
      for (const joint of createStructure(def.kind).joints) expect(known.has(joint.role)).withContext(`${def.kind}: ${joint.role}`).toBeTrue();
    }
  });
});

describe('structure-model templates', () => {
  it('offers the six structure types, each sound at its defaults', () => {
    expect(TEMPLATES.map((t) => t.kind)).toEqual(['dome', 'cabin', 'bay', 'pyramid', 'lean-to', 'gable']);
    for (const def of TEMPLATES) {
      const s = createStructure(def.kind);
      expect(s.schema).toBe(STRUCTURE_SCHEMA);
      expect(checkStructure(s)).withContext(def.kind).toEqual([]);
      expect(s.template?.kind).toBe(def.kind);
      expect(new Set(s.faces.map((f) => f.id)).size).withContext(`${def.kind}: face ids`).toBe(s.faces.length);
    }
  });

  it('stays sound at every limit of every numeric parameter', () => {
    for (const def of TEMPLATES) {
      for (const spec of def.params) {
        if (spec.min === undefined || spec.max === undefined) continue;
        for (const value of [spec.min, spec.max]) {
          const s = def.generate(normalizeParams(def, { ...defaultParams(def), [spec.key]: value }));
          expect(checkStructure(s)).withContext(`${def.kind} ${spec.key}=${value}`).toEqual([]);
          expect(s.faces.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every dimension reads its own value back, and every handle moves it', () => {
    for (const def of TEMPLATES) {
      const p = defaultParams(def);
      for (const dim of def.dims(p)) {
        const target = Math.min(dim.max, dim.value + (dim.unit === 'deg' ? 2 : 100));
        const q = normalizeParams(def, dim.set(p, target));
        const again = def.dims(q).find((d) => d.id === dim.id);
        expect(again).withContext(`${def.kind} ${dim.id}`).toBeDefined();
        expect(Math.abs((again?.value ?? 0) - target)).withContext(`${def.kind} ${dim.id}`).toBeLessThan(dim.unit === 'deg' ? 0.6 : 12);
        if (dim.handle) expect(Math.hypot(...dim.handle.axis)).toBeCloseTo(1, 9);
      }
    }
  });

  it('normalises a wrong or missing parameter to its default', () => {
    const def = templateOf('cabin')!;
    const p = normalizeParams(def, { shape: 'hexagon', width: 'wide' as unknown as number, height: 99999 });
    expect(p['shape']).toBe('box');
    expect(p['width']).toBe(3600);
    expect(p['height']).toBe(3600);
    expect(() => createStructure('igloo')).toThrowError(/Unknown structure template/);
  });
});

describe('structure-model operations', () => {
  const cabin = createStructure('cabin');

  it('changes the fill of faces without touching the document it was given', () => {
    const next = setFaceFill(cabin, ['front-1', 'roof-1'], 'casement');
    expect(fillKey(next.faces.find((f) => f.id === 'front-1')!)).toBe('casement');
    expect(next.faces.find((f) => f.id === 'front-1')?.edited).toBeTrue();
    expect(fillKey(cabin.faces.find((f) => f.id === 'front-1')!)).toBe('fixed');
    expect(setFaceFill(cabin, ['nothing'], 'panel')).toBe(cabin);
  });

  it('fixed glass is plain glass on a roof and a framed unit in a wall', () => {
    const next = setFaceFill(setFaceFill(cabin, ['front-1', 'roof-1'], 'panel'), ['front-1', 'roof-1'], 'fixed');
    expect(next.faces.find((f) => f.id === 'roof-1')?.fill.kind).toBe('glass');
    expect(next.faces.find((f) => f.id === 'front-1')?.fill).toEqual({ kind: 'design', opening: 'fixed' });
  });

  it('selects a whole wall or ring', () => {
    expect(groupFaceIds(cabin, 'right-2')).toEqual(['right-1', 'right-2', 'right-3']);
    expect(groupFaceIds(createStructure('dome'), 'r2-s5').length).toBe(12);
    expect(groupFaceIds(cabin, 'nothing')).toEqual([]);
  });

  it('re-runs the template and keeps what the user changed', () => {
    let s = setFaceFill(cabin, ['right-2'], 'top-hung');
    s = setAppearance(renameStructure(s, 'Balcony cabin'), { profileColour: '#3b3f44' });
    const wider = retemplate(s, { width: 5400, height: 2700 });
    expect(paramsOf(wider)?.params['width']).toBe(5400);
    expect(summarize(wider).overall.widthMm).toBe(5400);
    expect(wider.name).toBe('Balcony cabin');
    expect(wider.appearance.profileColour).toBe('#3b3f44');
    expect(fillKey(wider.faces.find((f) => f.id === 'right-2')!)).toBe('top-hung');
    expect(fillKey(wider.faces.find((f) => f.id === 'right-1')!)).toBe('fixed');
    expect(checkStructure(wider)).toEqual([]);
    expect(summarize(s).overall.widthMm).toBe(3600);
  });

  it('saves and loads the same document, and refuses what is not one', () => {
    const s = setFaceFill(createStructure('dome', { ribs: 10 }), ['r1-s1'], 'panel');
    expect(parseStructure(serializeStructure(s))).toEqual(s);
    expect(() => parseStructure('not json')).toThrowError(/not a structure document/);
    expect(() => parseStructure('{"schema":"upvc.design/1"}')).toThrowError(/upvc.structure\/1/);
    expect(() => parseStructure(JSON.stringify({ ...s, faces: [{ ...s.faces[0], outline: [[0, 0]] }] }))).toThrowError(/damaged/);
  });

  it('reports a damaged document', () => {
    const s = createStructure('bay');
    const bad = { ...s, joints: [{ ...s.joints[0], faceIds: ['ghost'] }, ...s.joints.slice(1)] };
    expect(checkStructure(bad)).toContain(`joint ${s.joints[0].id}: unknown face ghost`);
  });
});

describe('structure-model summary', () => {
  it('groups equal panels and adds the bars up by role', () => {
    const sum = summarize(createStructure('dome', { diameter: 3000, rise: 750, ribs: 8, rings: 2 }));
    expect(sum.panelCount).toBe(16);
    expect(sum.panels.map((r) => [r.shape, r.count])).toEqual([['trapezoid', 8], ['triangle', 8]]);
    expect(sum.bars.find((r) => r.role === 'rib')).toEqual(jasmine.objectContaining({ label: 'Rib', count: 16, totalMm: 16 * 862, lengths: [{ mm: 862, qty: 16 }] }));
    expect(sum.bars.find((r) => r.role === 'ring')?.lengths).toEqual([{ mm: 1148, qty: 8 }, { mm: 642, qty: 8 }]);
    expect(sum.barCount).toBe(32);
    expect(sum.barTotalMm).toBe(16 * 862 + 8 * 1148 + 8 * 642);
    expect(sum.hubs).toEqual([{ role: 'crown', label: 'Crown hub', count: 1 }, { role: 'node', label: 'Node connector', count: 16 }]);
    expect(sum.hubCount).toBe(17);
  });

  it('counts glass and solid separately and leaves an opening out', () => {
    let s = createStructure('cabin', { shape: 'straight', width: 3000, height: 2400, module: 1000, doorWidth: 0 });
    expect(summarize(s).glassAreaSqM).toBeCloseTo(7.2, 2);
    s = setFaceFill(setFaceFill(s, ['front-1'], 'panel'), ['front-2'], 'open');
    const sum = summarize(s);
    expect(sum.glassAreaSqM).toBeCloseTo(2.4, 2);
    expect(sum.solidAreaSqM).toBeCloseTo(2.4, 2);
    expect(sum.panels.length).toBe(3);
  });

  it('names shapes', () => {
    const lean = createStructure('lean-to');
    expect(faceShape(lean.faces.find((f) => f.id === 'roof-1')!)).toBe('rectangle');
    expect(panelSize(lean.faces.find((f) => f.id === 'left-1')!).shape).toBe('trapezoid');
  });
});

describe('structure-model history', () => {
  it('undoes and redoes, and a new step drops the redo branch', () => {
    const h = new History<string>('a');
    h.push('b');
    h.push('c');
    h.push('c');
    expect(h.undo()).toBe('b');
    expect(h.canRedo).toBeTrue();
    expect(h.redo()).toBe('c');
    h.undo();
    h.push('d');
    expect(h.canRedo).toBeFalse();
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeNull();
    h.replace('z');
    expect(h.present).toBe('z');
    expect(h.canUndo).toBeFalse();
  });

  it('holds no more than its cap', () => {
    const h = new History<number>(0, 3);
    for (let i = 1; i <= 10; i++) h.push(i);
    let steps = 0;
    while (h.undo() !== null) steps++;
    expect(steps).toBe(3);
  });
});
