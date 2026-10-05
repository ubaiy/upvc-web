import { BufferGeometry, Mesh, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { createStructure, DOME, defaultParams, setFaceFill } from '../../../shared/structure-model';
import { Gizmos } from './gizmos';
import { buildHighlight, buildStructure, createMaterials, disposeHighlight, disposeMaterials, disposeStructure, insetOutline, PickTarget } from './structure-mesh';

// Geometry only: none of this needs a WebGL context.
describe('structure-designer mesh', () => {
  const materials = createMaterials();
  afterAll(() => disposeMaterials(materials));

  const owners = (mesh: Mesh): PickTarget[] => mesh.userData['owner'] as PickTarget[];
  const triangles = (mesh: Mesh): number => (mesh.geometry as BufferGeometry).getAttribute('position').count / 3;

  it('merges a dome into one mesh a material, with an owner for every triangle', () => {
    const dome = createStructure('dome');
    const object = buildStructure(dome, materials);
    expect(object.pickables.length).toBe(3); // bars, gaskets, glass
    for (const mesh of object.pickables) expect(owners(mesh).length).toBe(triangles(mesh));
    const bars = object.pickables.find((m) => m.material === materials.profile)!;
    // 72 bars of 12 triangles, 37 hubs of 8.
    expect(triangles(bars)).toBe(72 * 12 + 37 * 8);
    expect(new Set(owners(bars).filter((o) => o.kind === 'bar').map((o) => o.id)).size).toBe(72);
    const glass = object.pickables.find((m) => m.material === materials.glass)!;
    expect(new Set(owners(glass).map((o) => o.id)).size).toBe(36);
    expect(triangles(glass)).toBe(12 * 1 + 24 * 2);
    disposeStructure(object);
  });

  it('draws each panel type: framed, opening, door, solid, and an opening that can still be picked', () => {
    let cabin = createStructure('cabin', { shape: 'straight', width: 3600, module: 900, doorWidth: 0 });
    const fixed = buildStructure(cabin, materials);
    const count = (object: ReturnType<typeof buildStructure>, material: unknown): number => {
      const mesh = object.pickables.find((m) => m.material === material);
      return mesh ? triangles(mesh) : 0;
    };
    const fixedProfile = count(fixed, materials.profile);
    cabin = setFaceFill(cabin, ['front-1'], 'casement');
    cabin = setFaceFill(cabin, ['front-2'], 'panel');
    cabin = setFaceFill(cabin, ['front-3'], 'open');
    const mixed = buildStructure(cabin, materials);
    // A casement adds a sash of four bars; a panel and an opening lose their frame of four.
    expect(count(mixed, materials.profile)).toBe(fixedProfile + 4 * 12 - 2 * 4 * 12);
    expect(count(mixed, materials.panel)).toBe(2);
    expect(count(mixed, materials.hidden)).toBe(2);
    expect(owners(mixed.pickables.find((m) => m.material === materials.hidden)!)[0]).toEqual({ kind: 'face', id: 'front-3' });
    expect(mixed.root.children.some((o) => o.type === 'LineSegments')).toBeTrue(); // the opening sign
    disposeStructure(fixed);
    disposeStructure(mixed);
  });

  it('a ray through a glass panel finds that panel', () => {
    const cabin = createStructure('cabin', { shape: 'straight', width: 3600, module: 900, doorWidth: 0 });
    const object = buildStructure(cabin, materials);
    const ray = new Raycaster(new Vector3(-1350, 1200, 5000), new Vector3(0, 0, -1));
    const hit = ray.intersectObjects(object.pickables, false)[0];
    expect(owners(hit.object as Mesh)[hit.faceIndex ?? -1]).toEqual({ kind: 'face', id: 'front-1' });
    // Aimed at the coupler between panels 1 and 2: the bar is in front.
    const onBar = new Raycaster(new Vector3(-900, 1200, 5000), new Vector3(0, 0, -1)).intersectObjects(object.pickables, false)[0];
    expect(owners(onBar.object as Mesh)[onBar.faceIndex ?? -1].kind).toBe('bar');
    disposeStructure(object);
  });

  it('insets an outline by the same distance on every edge, and never turns a thin panel inside out', () => {
    expect(insetOutline([[0, 0], [1000, 0], [1000, 500], [0, 500]], 50)).toEqual([[50, 50], [950, 50], [950, 450], [50, 450]]);
    const sliver = insetOutline([[0, 0], [1000, 0], [500, 60]], 50);
    const area = (o: number[][]): number => o.reduce((s, p, i) => s + p[0] * o[(i + 1) % o.length][1] - o[(i + 1) % o.length][0] * p[1], 0) / 2;
    expect(area(sliver)).toBeGreaterThan(0);
  });

  it('highlights the selected panels and bar, and frees what it made', () => {
    const dome = createStructure('dome');
    const group = buildHighlight(dome, ['r1-s1', 'r2-s1'], null, '#0e6f6a');
    expect(triangles(group.children[0] as Mesh)).toBe(2 * (1 + 2));
    disposeHighlight(group);
    const bar = buildHighlight(dome, [], dome.joints[0].id, '#0e6f6a');
    expect(triangles(bar.children[0] as Mesh)).toBe(12);
    disposeHighlight(bar);
    expect(buildHighlight(dome, [], null, '#0e6f6a').children.length).toBe(0);
  });
});

describe('structure-designer gizmos', () => {
  const camera = new PerspectiveCamera(32, 1.5, 10, 100000);
  camera.position.set(4000, 2500, 7000);
  camera.lookAt(0, 500, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const p = defaultParams(DOME);

  /** A ray from the camera through a world point. */
  const through = (x: number, y: number, z: number): Raycaster => {
    const v = new Vector3(x, y, z).project(camera);
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(v.x, v.y), camera);
    return ray;
  };

  it('grabs the handle under the pointer and moves along its axis only', () => {
    const g = new Gizmos('#0e6f6a');
    g.setDims(DOME.dims(p));
    g.face(camera);
    expect(g.grab(through(0, 3000, -3000), false)).toBeNull(); // empty space
    expect(g.grab(through(1500, 0, 0), false)).toEqual({ id: 'diameter', value: 3000 });
    expect(g.dragging).toBeTrue();
    // 500 mm along X, and well off the axis in Y: only X counts. The diameter grows by twice the move.
    const moved = g.drag(through(2000, 0, 0));
    expect(moved).toEqual({ id: 'diameter', value: 4000 });
    expect(g.drag(through(2000, 0, 0))).toBeNull(); // no change, no event
    expect(g.release()).toEqual({ id: 'diameter', value: 4000 });
    expect(g.dragging).toBeFalse();
    g.dispose();
  });

  it('holds a dragged value inside the limits of its dimension, on a 10 mm step', () => {
    const g = new Gizmos('#0e6f6a');
    g.setDims(DOME.dims(p));
    g.face(camera);
    g.grab(through(0, 1000, 0), false);
    expect(g.drag(through(0, 1234, 0))?.value).toBe(1230);
    expect(g.drag(through(0, 9000, 0))?.value).toBe(6000);
    g.release();
    g.dispose();
  });

  it('places a label for every dimension', () => {
    const g = new Gizmos('#0e6f6a');
    g.setDims(DOME.dims(p));
    const labels = g.labels(camera, 900, 600);
    expect(labels.map((l) => l.id)).toEqual(['diameter', 'rise']);
    expect(labels.every((l) => l.visible && l.x > 0 && l.x < 900 && l.y > 0 && l.y < 600)).toBeTrue();
    g.dispose();
  });
});
