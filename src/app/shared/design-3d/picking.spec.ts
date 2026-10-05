import { Raycaster, Vector3 } from 'three';
import { LAB_PRESETS } from 'src/app/views/design-lab/lab-presets';
import { WindowDesign, walkLeaves } from '../design-model';
import { boundsOf } from './member-mesh';
import { WindowObject, buildWindowGroup, createMaterials, disposeMaterials, disposeWindow, pickPane, setOpen, setSelected } from './window-mesh';
import { WindowParts, buildWindowParts } from './window-parts';

function preset(key: string): WindowDesign {
  const found = LAB_PRESETS.find((p) => p.key === key);
  if (!found) throw new Error(`no lab preset ${key}`);
  return found.build();
}

/** A ray from far outside the window straight at a point of its face. */
function rayAt(x: number, y: number): Raycaster {
  return new Raycaster(new Vector3(x, y, 5000), new Vector3(0, 0, -1));
}

describe('design-3d picking (a tap in 3D, T124)', () => {
  const materials = createMaterials();
  let obj: WindowObject | null = null;

  const stand = (key: string): { design: WindowDesign; parts: WindowParts; obj: WindowObject } => {
    const design = preset(key);
    const parts = buildWindowParts(design);
    obj = buildWindowGroup(parts, materials);
    return { design, parts, obj };
  };

  afterEach(() => {
    if (obj) disposeWindow(obj);
    obj = null;
  });
  afterAll(() => disposeMaterials(materials));

  for (const p of LAB_PRESETS) {
    it(`${p.key}: every pane can be tapped, and a tap on its middle finds it`, () => {
      const made = stand(p.key);
      const leaves = walkLeaves(made.design.root).map((l) => l.id);
      const tappable = new Set(made.parts.picks.map((k) => k.leafId));
      // A pane the outline leaves nothing of has nothing to tap; every other pane has.
      tappable.forEach((id) => expect(leaves).toContain(id));
      expect(tappable.size).toBeGreaterThan(0);
      for (const pick of made.parts.picks) {
        expect(pick.slab.positions.length % 9).toBe(0);
        expect(pick.ring.positions.length).toBeGreaterThan(0);
        const b = boundsOf([pick.slab]);
        const hit = pickPane(made.obj, rayAt((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2));
        // Shutters of a slider lap: the middle of one is its own, or the one in front of it.
        expect(hit).withContext(pick.leafId).not.toBeNull();
        if (pick.panelIndex === undefined) expect(hit?.leafId).toBe(pick.leafId);
      }
    });
  }

  it('a sash that opens is tapped where it stands, not where it was', () => {
    const made = stand('two-sash-casement');
    const sash = made.parts.picks.find((k) => k.groupId?.startsWith('open-'));
    if (!sash) throw new Error('the preset has no opening sash');
    const b = boundsOf([sash.slab]);
    const middle = rayAt((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2);
    expect(pickPane(made.obj, middle)?.leafId).toBe(sash.leafId);

    setOpen(made.obj, 1); // turned 90°: edge-on to this ray
    const after = pickPane(made.obj, middle);
    expect(after?.leafId === sash.leafId).withContext('the opening it left is empty space').toBeFalse();

    // Aim at the middle of the sash where it now stands, from the side it faces.
    const target = made.obj.picks.find((k) => k.leafId === sash.leafId);
    if (!target) throw new Error('no tap volume');
    target.volume.geometry.computeBoundingBox();
    const centre = (target.volume.geometry.boundingBox as NonNullable<typeof target.volume.geometry.boundingBox>)
      .getCenter(new Vector3())
      .applyMatrix4(target.volume.matrixWorld);
    for (const from of [new Vector3(-4000, centre.y, centre.z), new Vector3(6000, centre.y, centre.z)]) {
      const ray = new Raycaster(from, centre.clone().sub(from).normalize());
      const hit = pickPane(made.obj, ray);
      if (hit?.leafId === sash.leafId) return;
    }
    fail('the open sash was not found where it stands');
  });

  it('a slider gives each shutter its own tap volume, all of the same pane', () => {
    const made = stand('sliding-3-track-mesh');
    const picks = made.parts.picks;
    expect(picks.map((k) => k.panelIndex)).toEqual([0, 1, 2]);
    expect(new Set(picks.map((k) => k.leafId)).size).toBe(1);
    // A moving shutter's volume moves with it.
    picks.forEach((k, i) => {
      const group = made.parts.groups.find((g) => g.id === `slide-${k.leafId}-${i}`);
      expect(k.groupId).toBe(group ? group.id : null);
    });
  });

  it('a ray that misses the window hits nothing: a tap on empty space clears the selection', () => {
    const made = stand('two-sash-casement');
    expect(pickPane(made.obj, rayAt(-500, -500))).toBeNull();
    expect(pickPane(made.obj, rayAt(made.parts.widthMm + 400, made.parts.heightMm / 2))).toBeNull();
  });

  it('the band is shown round the selected panes and no other; tap volumes are never drawn', () => {
    const made = stand('two-sash-casement');
    const ids = [...new Set(made.obj.picks.map((k) => k.leafId))];
    expect(ids.length).toBeGreaterThan(1);
    expect(made.obj.picks.every((k) => !k.ring.visible)).toBeTrue();
    expect(materials.pick.visible).toBeFalse();

    setSelected(made.obj, [ids[0]]);
    expect(made.obj.picks.filter((k) => k.ring.visible).map((k) => k.leafId)).toEqual([ids[0]]);
    setSelected(made.obj, ids); // shift-tap: several
    expect(made.obj.picks.every((k) => k.ring.visible)).toBeTrue();
    setSelected(made.obj, []);
    expect(made.obj.picks.some((k) => k.ring.visible)).toBeFalse();
  });
});
