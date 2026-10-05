/**
 * T137: the 3D view draws what the 2D designer draws. Each spec here reads
 * the same model functions the 2D drawing reads and checks the 3D parts
 * against them.
 */
import { LAB_PRESETS } from 'src/app/views/design-lab/lab-presets';
import { glassTrackCount } from '../design-canvas/render/render-sliding';
import {
  LeafNode,
  PALLA_BAR_FACE_MM,
  SlideSpec,
  TRACK_COUNTS,
  TrackType,
  WindowDesign,
  allowedPanelCounts,
  layout,
  pallaBarLayouts,
  paneOutlines,
  shapedSash,
  walkLeaves,
} from '../design-model';
import { slideTracks } from '../design-model/slide-tracks';
import { boundsOf } from './member-mesh';
import { SECTION_DATA as S, trackCentreMm } from './profile-section';
import { DesignScene, webglAvailable } from './scene';
import { MeshPart, WindowParts, buildWindowParts, partsOfRole } from './window-parts';

function preset(key: string): WindowDesign {
  const found = LAB_PRESETS.find((p) => p.key === key);
  if (!found) throw new Error(`no lab preset '${key}'`);
  return JSON.parse(JSON.stringify(found.build()));
}

const leavesOf = (d: WindowDesign): LeafNode[] => walkLeaves(d.root);
const withId = (parts: WindowParts, re: RegExp): MeshPart[] => parts.parts.filter((p) => re.test(p.id));

const round = (diameterMm: number, leaf: Partial<LeafNode>): WindowDesign => {
  const d = preset('single-fixed');
  d.frame = { ...d.frame, shape: { kind: 'circle' }, widthMm: diameterMm, heightMm: diameterMm };
  d.root = { ...(leavesOf(d)[0] as LeafNode), casementType: 'Openable', ...leaf };
  return d;
};
const opening = (extra?: object): LeafNode['opening'] => ({ direction: 'Left', handleId: null, hingesType: null, ...extra }) as LeafNode['opening'];

describe('design-3d mirrors the 2D drawing (T137)', () => {
  describe('a bar that divides one palla', () => {
    it('a casement sash: the bar where the model puts it, from glass edge to glass edge, one glass per part, all moving with the sash', () => {
      const d = preset('two-sash-casement');
      const [first, second] = leavesOf(d);
      first.bars = { axis: 'y', at: [0.55] };
      const parts = buildWindowParts(d);
      const bar = pallaBarLayouts(layout(d)).find((b) => b.paneId === first.id);
      if (!bar) throw new Error('the model lays out no bar');
      const bars = partsOfRole(parts, 'sash-bar');
      expect(bars.length).toBe(1);
      expect(bars[0].groupId).toBe(`open-${first.id}`);
      const box = boundsOf(bars);
      // Face 40 mm, centred on the model's bar; y is up in 3D.
      expect(box.max[1] - box.min[1]).toBeCloseTo(PALLA_BAR_FACE_MM, 6);
      expect((box.max[1] + box.min[1]) / 2).toBeCloseTo(d.frame.heightMm - (bar.rect.yMm + bar.rect.hMm / 2), 6);
      // It ends on the inner edge of the sash members.
      expect(box.min[0]).toBeCloseTo(bar.palla.xMm + S.sash.faceMm, 6);
      expect(box.max[0]).toBeCloseTo(bar.palla.xMm + bar.palla.wMm - S.sash.faceMm, 6);
      // Two glasses in the divided sash, one in the other; both parts turn on the sash's hinge.
      const own = withId(parts, new RegExp(`^${first.id}-glass-\\d+$`));
      expect(own.length).toBe(2);
      expect(own.every((g) => g.groupId === `open-${first.id}`)).toBeTrue();
      expect(withId(parts, new RegExp(`^${second.id}-glass$`)).length).toBe(1);
      // The two glasses do not overlap and the bar lies between them.
      const [a, b] = own.map((g) => boundsOf([g])).sort((p, q) => p.min[1] - q.min[1]);
      expect(a.max[1]).toBeLessThan(b.min[1]);
      expect(a.max[1]).toBeGreaterThan(box.min[1]);
      expect(b.min[1]).toBeLessThan(box.max[1]);
    });

    it('two bars make three glasses; an undivided sash is built exactly as before', () => {
      const d = preset('two-sash-casement');
      const before = buildWindowParts(d);
      leavesOf(d)[0].bars = { axis: 'x', at: [0.33, 0.66] };
      const parts = buildWindowParts(d);
      expect(partsOfRole(parts, 'sash-bar').length).toBe(2);
      expect(partsOfRole(parts, 'glass').length).toBe(partsOfRole(before, 'glass').length + 2);
      expect(partsOfRole(before, 'sash-bar').length).toBe(0);
    });

    it('a sliding shutter: the bar is on that shutter only, on its track, and slides with it', () => {
      const d = preset('sliding-3-track-mesh');
      const leaf = leavesOf(d)[0];
      (leaf.slide as SlideSpec).panels[1].bars = { axis: 'x', at: [0.5] };
      const parts = buildWindowParts(d);
      const bars = partsOfRole(parts, 'sash-bar');
      expect(bars.length).toBe(1);
      expect(bars[0].id).toBe(`${leaf.id}-panel-1-bar-0`);
      expect(bars[0].groupId).toBe(`slide-${leaf.id}-1`);
      const bar = pallaBarLayouts(layout(d)).find((b) => b.panelIndex === 1);
      if (!bar) throw new Error('the model lays out no bar');
      const box = boundsOf(bars);
      expect((box.min[0] + box.max[0]) / 2).toBeCloseTo(bar.rect.xMm + bar.rect.wMm / 2, 6);
      // Inside the depth of its own shutter.
      const shutter = boundsOf(withId(parts, new RegExp(`^${leaf.id}-panel-1-sash-`)));
      expect(box.max[2]).toBeLessThanOrEqual(shutter.max[2]);
      expect(box.min[2]).toBeGreaterThanOrEqual(shutter.min[2]);
      expect(withId(parts, new RegExp(`^${leaf.id}-panel-1-glass-\\d+$`)).length).toBe(2);
      expect(withId(parts, new RegExp(`^${leaf.id}-panel-0-glass$`)).length).toBe(1);
    });
  });

  describe('a sash in a round frame', () => {
    it('follows the outline the 2D drawing uses: bent, inside the gap, glass inside the profile', () => {
      const d = round(1200, { opening: opening({ pivot: 'horizontal' }) });
      const parts = buildWindowParts(d);
      const outline = [...paneOutlines(d).values()][0];
      const model = shapedSash(outline, 4, S.sash.faceMm);
      const sash = boundsOf(partsOfRole(parts, 'sash'));
      const xs = model.outerMm.map((p) => p.xMm);
      // One bent member, as wide as the model's outer sash line (to the facet of the circle).
      expect(partsOfRole(parts, 'sash').length).toBe(1);
      expect(sash.min[0]).toBeCloseTo(Math.min(...xs), 0);
      expect(sash.max[0]).toBeCloseTo(Math.max(...xs), 0);
      // The glass is round too: narrower than the sash by the profile on each side, less its bite.
      const glass = boundsOf(partsOfRole(parts, 'glass'));
      expect(glass.max[0] - glass.min[0]).toBeCloseTo(sash.max[0] - sash.min[0] - 2 * (S.sash.faceMm - S.glassBiteMm), 0);
    });

    it('a centre pivot turns about the line through its middle, top half inwards; no hinge on the curve', () => {
      const d = round(1200, { opening: opening({ pivot: 'horizontal' }) });
      const parts = buildWindowParts(d);
      const g = parts.groups[0];
      expect(g.axis).toEqual([1, 0, 0]);
      expect(g.pivot[0]).toBeCloseTo(600, 3);
      expect(g.pivot[1]).toBeCloseTo(600, 3);
      // A point above the axis goes to −z (the room) for a negative turn about +x.
      expect(g.travel).toBeCloseTo(-Math.PI / 2, 9);
      expect(withId(parts, /-hinge-\d+$/).length).toBe(0);
      const pivots = withId(parts, /-pivot-\d+$/);
      expect(pivots.length).toBe(2);
      // Both fittings sit on the axis, so they stay where they are while the sash turns.
      for (const p of pivots) {
        const b = boundsOf([p]);
        expect((b.min[1] + b.max[1]) / 2).toBeCloseTo(g.pivot[1], 3);
      }
      expect(pivots.every((p) => p.groupId === g.id)).toBeTrue();
    });

    it('a vertical pivot turns about the upright line through its middle, left half inwards', () => {
      const parts = buildWindowParts(round(1200, { opening: opening({ pivot: 'vertical' }) }));
      const g = parts.groups[0];
      expect(g.axis).toEqual([0, 1, 0]);
      expect(g.pivot[0]).toBeCloseTo(600, 3);
      expect(g.travel).toBeLessThan(0);
    });

    it('a round tilt is hung at its lowest point on two bearings and leans into the room', () => {
      const parts = buildWindowParts(round(1200, { opening: opening({ direction: 'Bottom' }) }));
      const g = parts.groups[0];
      const sash = boundsOf(partsOfRole(parts, 'sash'));
      expect(g.axis).toEqual([1, 0, 0]);
      expect(g.pivot[1]).toBeCloseTo(sash.min[1], 3);
      // The top goes to −z: a positive y above the axis and a negative turn about +x.
      expect(g.travel).toBeLessThan(0);
      expect(withId(parts, /-bearing-\d+$/).length).toBe(2);
      expect(withId(parts, /-hinge-\d+$/).length).toBe(0);
    });

    it('a half round on a mullion is side-hung on the mullion: hinges on the straight side only, the handle on the curve', () => {
      const d = preset('shape-circle');
      const leaf = { ...(leavesOf(d)[0] as LeafNode) };
      d.frame = { ...d.frame, widthMm: 1500, heightMm: 1500 };
      d.root = {
        id: 's1', kind: 'split', axis: 'x', dividerKind: 'mullion', dividerProfileId: null, dividerFaceMm: 60, positionsMm: [690], lockedMm: [false],
        children: [
          { ...leaf, id: 'a', casementType: 'Openable', opening: opening({ direction: 'Right' }) },
          { ...leaf, id: 'b', casementType: 'Fixed' },
        ],
      } as WindowDesign['root'];
      const parts = buildWindowParts(d);
      const g = parts.groups.find((x) => x.leafId === 'a');
      if (!g) throw new Error('the half round does not open');
      const sash = boundsOf(withId(parts, /^a-sash-/));
      expect(g.axis).toEqual([0, 1, 0]);
      expect(g.pivot[0]).toBeCloseTo(sash.max[0], 3);
      const hinges = withId(parts, /^a-hinge-\d+$/);
      expect(hinges.length).toBe(2);
      for (const h of hinges) expect(boundsOf([h]).max[0]).toBeCloseTo(sash.max[0] + 9, 0);
      // The handle is on the profile of the far (curved) side, not floating at the edge of the bounding box.
      const plate = boundsOf(withId(parts, /^a-handle-0$/));
      expect(plate.min[0]).toBeGreaterThan(sash.min[0]);
      expect(plate.max[0]).toBeLessThan(sash.min[0] + 2 * S.sash.faceMm + 40);
      // The fixed half stays plain glass cut to the circle.
      expect(withId(parts, /^b-sash-/).length).toBe(0);
    });
  });

  describe('the fly mesh track: one rule (design-model slide-tracks)', () => {
    const TYPES: TrackType[] = ['2 Track', '2.5 Track', '3 Track', '4 Track'];
    const spec = (tracks: TrackType, n: number, mesh: boolean): SlideSpec => ({
      tracks,
      mesh,
      panels: Array.from({ length: n }, () => ({ widthMm: 500, direction: 'Left' as const })),
    });

    it('gives the glass the tracks the 2D drawing gives it, for every track type and panel count', () => {
      for (const tracks of TYPES) {
        for (const n of allowedPanelCounts(tracks)) {
          for (const mesh of [false, true]) {
            if (mesh && tracks === '2 Track') continue;
            const s = spec(tracks, n, mesh);
            const t = slideTracks(s);
            expect(t.glassTracks).withContext(`${tracks} ${n} ${mesh}`).toBe(glassTrackCount(s));
            expect(Math.max(...t.panelTrack)).withContext(`${tracks} ${n} ${mesh}`).toBeLessThan(t.glassTracks);
          }
        }
      }
    });

    it('puts the mesh on the track nearest the room and never adds a track to a 3 or 4 track', () => {
      expect(slideTracks(spec('3 Track', 3, true))).toEqual({ railCount: 3, glassTracks: 2, panelTrack: [0, 1, 0], meshTrack: 2, meshOwnTrack: true });
      expect(slideTracks(spec('4 Track', 4, true))).toEqual({ railCount: 4, glassTracks: 3, panelTrack: [0, 1, 1, 0], meshTrack: 3, meshOwnTrack: true });
      // A 2.5 track: two glass tracks and the half track, on the room side.
      expect(slideTracks(spec('2.5 Track', 2, true))).toEqual({ railCount: 3, glassTracks: 2, panelTrack: [0, 1], meshTrack: 2, meshOwnTrack: true });
      // Six shutters on a 3 track need every track: the mesh shares the innermost one.
      const crowded = slideTracks(spec('3 Track', 6, true));
      expect(crowded.railCount).toBe(TRACK_COUNTS['3 Track']);
      expect(crowded.meshTrack).toBe(2);
      expect(crowded.meshOwnTrack).toBeFalse();
      expect(slideTracks(spec('3 Track', 3, false))).toEqual({ railCount: 3, glassTracks: 3, panelTrack: [0, 1, 2], meshTrack: null, meshOwnTrack: false });
    });

    it('the 3D view stands every shutter on the track the rule names', () => {
      for (const key of ['sliding-2-5-track-mesh', 'sliding-3-track-mesh', 'sliding-2-track']) {
        const d = preset(key);
        const leaf = leavesOf(d)[0];
        const rule = slideTracks(leaf.slide as SlideSpec);
        const parts = buildWindowParts(d);
        rule.panelTrack.forEach((track, i) => {
          const b = boundsOf(withId(parts, new RegExp(`^${leaf.id}-panel-${i}-sash-`)));
          expect((b.min[2] + b.max[2]) / 2).withContext(`${key} shutter ${i}`).toBeCloseTo(-trackCentreMm(track), 6);
        });
        expect(partsOfRole(parts, 'rail').length).withContext(key).toBe(2 * rule.railCount);
        if (rule.meshTrack === null) continue;
        const mesh = boundsOf(partsOfRole(parts, 'mesh'));
        expect((mesh.min[2] + mesh.max[2]) / 2).withContext(key).toBeCloseTo(-trackCentreMm(rule.meshTrack), 6);
        // The same size as the end glass shutter it is parked behind.
        const last = (leaf.slide as SlideSpec).meshPosition === 'Right' ? rule.panelTrack.length - 1 : 0;
        const end = boundsOf(withId(parts, new RegExp(`^${leaf.id}-panel-${last}-sash-`)));
        const meshSash = boundsOf(withId(parts, new RegExp(`^${leaf.id}-mesh-sash-`)));
        expect(meshSash.min[0]).withContext(key).toBeCloseTo(end.min[0], 6);
        expect(meshSash.max[0]).withContext(key).toBeCloseTo(end.max[0], 6);
      }
    });
  });

  describe('closing the view (the second press of 3D)', () => {
    it('gives back everything it took: the GL context, the buffers, the frame it had asked for', async () => {
      if (!webglAvailable()) {
        pending('no WebGL in this browser');
        return;
      }
      const lost = (scene: DesignScene): boolean => scene.renderer.getContext().isContextLost();
      // Five opens and closes, as a user going 2D -> 3D -> 2D: each view ends with nothing held.
      for (let i = 0; i < 5; i++) {
        const canvas = document.createElement('canvas');
        document.body.appendChild(canvas);
        const scene = new DesignScene(canvas);
        scene.resize(320, 240);
        scene.setParts(buildWindowParts(preset(i % 2 ? 'sliding-3-track-mesh' : 'two-sash-casement')));
        scene.render();
        expect(scene.info().geometries).toBeGreaterThan(0);
        expect(lost(scene)).toBeFalse();
        let frames = 0;
        scene.onFrame = () => frames++;
        scene.requestRender();
        scene.dispose();
        expect(lost(scene)).withContext(`view ${i}`).toBeTrue();
        // Every buffer of the window and the studio is released; the one left is three.js's own
        // backdrop plane, which it keeps no handle to release and which goes with the context.
        expect(scene.info().geometries).withContext(`view ${i}`).toBeLessThanOrEqual(1);
        // The frame asked for before the close is not drawn, and none can be asked for after it.
        scene.requestRender();
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        expect(frames).withContext(`view ${i}`).toBe(0);
        // Closing twice is harmless (the host closes on destroy as well).
        scene.dispose();
        canvas.remove();
      }
    });

    it('asking whether WebGL is there does not keep a context', () => {
      if (!webglAvailable()) {
        pending('no WebGL in this browser');
        return;
      }
      const made: (WebGLRenderingContext | WebGL2RenderingContext)[] = [];
      const real = HTMLCanvasElement.prototype.getContext;
      spyOn(HTMLCanvasElement.prototype, 'getContext').and.callFake(function (this: HTMLCanvasElement, ...args: unknown[]) {
        const gl = (real as (...a: unknown[]) => unknown).apply(this, args);
        if (gl && String(args[0]).startsWith('webgl')) made.push(gl as WebGLRenderingContext);
        return gl as never;
      });
      expect(webglAvailable()).toBeTrue();
      expect(made.length).toBe(1);
      expect(made[0].isContextLost()).toBeTrue();
    });
  });
});
