import { Mesh, Vector3 } from 'three';
import { buildWindowParts } from '../../../shared/design-3d/window-parts';
import { WindowDesign } from '../../../shared/design-model';
import { Face, faceCorners, faceNormal, createStructure, Structure } from '../../../shared/structure-model';
import { withWindows } from '../panel-designs';
import { buildStructure, createMaterials, disposeStructure } from './structure-mesh';
import { panelPlacement, windowPoint } from './panel-window';

const face = (s: Structure, id: string): Face => s.faces.find((f) => f.id === id)!;
const designOf = (s: Structure, id: string): WindowDesign => {
  const fill = face(s, id).fill;
  if (fill.kind !== 'design' || !fill.design) throw new Error(`${id} has no design`);
  return fill.design;
};
const near = (a: number[], b: number[]): boolean => a.every((x, i) => Math.abs(x - b[i]) < 0.01);
const placed = (f: Face, design: WindowDesign) => panelPlacement(f, buildWindowParts(design, { frameFaceMm: 60 }).depthMm);

describe('a window drawn on the plane of its panel', () => {
  it('the corners of the window frame are the corners of the panel', () => {
    const s = withWindows(createStructure('cabin'));
    const f = face(s, 'front-1');
    const m = placed(f, designOf(s, 'front-1'));
    const [a, b, c, d] = faceCorners(f);
    const n = faceNormal(f);
    // The frame stands across the plane, so compare the corner along the panel's own axes.
    for (const [x, y, corner] of [[0, 0, a], [675, 0, b], [675, 2400, c], [0, 2400, d]] as [number, number, number[]][]) {
      const p = windowPoint(m, x, y, 0);
      const rel = [p.x - corner[0], p.y - corner[1], p.z - corner[2]];
      // Whatever depth the frame stands at, the sideways and upward place is the panel's corner.
      const out = rel[0] * n[0] + rel[1] * n[1] + rel[2] * n[2];
      const flat = [rel[0] - out * n[0], rel[1] - out * n[1], rel[2] - out * n[2]];
      expect(near(flat, [0, 0, 0])).withContext(`${x},${y}`).toBeTrue();
    }
  });

  it('the window looks the way the panel looks, centred on the bars', () => {
    const s = withWindows(createStructure('cabin'));
    for (const id of ['front-1', 'right-1', 'back-1', 'left-1']) {
      const f = face(s, id);
      const design = designOf(s, id);
      const m = placed(f, design);
      const depth = buildWindowParts(design, { frameFaceMm: 60 }).depthMm;
      const outer = windowPoint(m, 0, 0, 0);
      const inner = windowPoint(m, 0, 0, -depth);
      const toward = inner.clone().sub(outer);
      const n = faceNormal(f);
      expect(toward.dot(new Vector3(...n))).withContext(id).toBeCloseTo(-depth, 3);
      // The middle of the frame is on the plane of the panel.
      const plane = new Vector3(...f.plane.origin).dot(new Vector3(...n));
      expect((outer.dot(new Vector3(...n)) + inner.dot(new Vector3(...n))) / 2).withContext(id).toBeCloseTo(plane, 3);
    }
  });

  it('every part of the window lies inside the box of its panel', () => {
    const s = withWindows(createStructure('lean-to'));
    for (const id of ['front-1', 'left-1', 'roof-1']) {
      const f = face(s, id);
      if (f.fill.kind !== 'design') continue;
      const design = designOf(s, id);
      const m = placed(f, design);
      const n = new Vector3(...faceNormal(f));
      const u = new Vector3(...f.plane.u);
      const v = new Vector3(...f.plane.v);
      const o = new Vector3(...f.plane.origin);
      const width = Math.max(...f.outline.map((p) => p[0]));
      const height = Math.max(...f.outline.map((p) => p[1]));
      const parts = buildWindowParts(design, { frameFaceMm: 60 });
      for (const part of parts.parts) {
        for (let i = 0; i < part.positions.length; i += 3) {
          const p = windowPoint(m, part.positions[i], part.positions[i + 1], part.positions[i + 2]).sub(o);
          expect(p.dot(u)).withContext(id).toBeGreaterThan(-1);
          expect(p.dot(u)).withContext(id).toBeLessThan(width + 1);
          expect(p.dot(v)).withContext(id).toBeGreaterThan(-1);
          expect(p.dot(v)).withContext(id).toBeLessThan(height + 1);
          expect(Math.abs(p.dot(n))).withContext(id).toBeLessThan(200);
        }
      }
    }
  });
});

describe('the structure drawn with its windows', () => {
  const look = { frameFaceMm: 60, glassTints: {} as Record<string, string> };

  it('a panel with a window is drawn as that window, and is still there to be tapped', () => {
    const s = withWindows(createStructure('cabin', { shape: 'straight', width: 1800, module: 900, doorWidth: 0 }));
    const m = createMaterials();
    const drawn = buildStructure(s, m, look);
    const windows = drawn.root.children.filter((c) => c.userData['window']);
    expect(windows.map((w) => w.userData['window']).sort()).toEqual(['front-1', 'front-2']);
    expect(drawn.windows.length).toBe(2);
    // The ray still finds the panel: a hidden plate of the panel's outline is in the merged meshes.
    const owners = drawn.pickables.flatMap((mesh) => (mesh.userData['owner'] as { id: string }[]).map((o) => o.id));
    expect(owners).toContain('front-1');
    // Nothing of the plain frame of the panel is drawn: no panel-sized sash plate in the profile mesh of the plain drawing.
    const plain = buildStructure(s, m, undefined);
    const trianglesOf = (o: typeof drawn): number => o.pickables.reduce((n, mesh) => n + (mesh as Mesh).geometry.getAttribute('position').count / 3, 0);
    expect(trianglesOf(drawn)).toBeLessThan(trianglesOf(plain));
    disposeStructure(drawn);
    disposeStructure(plain);
  });

  it('without a look the plain drawing of the panel is kept (thumbnails, the checks)', () => {
    const s = withWindows(createStructure('bay'));
    const drawn = buildStructure(s, createMaterials());
    expect(drawn.windows.length).toBe(0);
    disposeStructure(drawn);
  });

  it('a panel with no design is drawn plain even with a look', () => {
    const drawn = buildStructure(createStructure('bay'), createMaterials(), look);
    expect(drawn.windows.length).toBe(0);
    disposeStructure(drawn);
  });

  it('glass of another tint is drawn in it', () => {
    const s = withWindows(createStructure('bay'));
    const fill = s.faces[0].fill;
    if (fill.kind !== 'design' || !fill.design) throw new Error('no design');
    const tinted: Structure = {
      ...s,
      faces: s.faces.map((f, i) => (i === 0 ? { ...f, fill: { ...fill, design: { ...fill.design!, glazing: { ...fill.design!.glazing, glassId: 16 } } } } : f)),
    };
    const drawn = buildStructure(tinted, createMaterials(), { ...look, glassTints: { '16': '#c9a27a' } });
    expect(drawn.windowMaterials.length).withContext('one set of materials for the other tint').toBe(2);
    disposeStructure(drawn);
  });
});
