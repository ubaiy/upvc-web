import { WindowDesign, frameMembers, layout, serialize } from '../design-model';
import { LAB_PRESETS } from 'src/app/views/design-lab/lab-presets';
import { boundsOf } from './member-mesh';
import { SECTION_DATA, slidingFrameDepthMm } from './profile-section';
import { MovingGroup, WindowParts, buildWindowParts, partsOfRole, triangleTotal } from './window-parts';

function preset(key: string): WindowDesign {
  const found = LAB_PRESETS.find((p) => p.key === key);
  if (!found) throw new Error(`no lab preset '${key}'`);
  return found.build();
}

function build(key: string): { design: WindowDesign; parts: WindowParts } {
  const design = preset(key);
  return { design, parts: buildWindowParts(design) };
}

function count(parts: WindowParts, role: Parameters<typeof partsOfRole>[1]): number {
  return partsOfRole(parts, role).length;
}

function group(parts: WindowParts, index: number): MovingGroup {
  return parts.groups[index];
}

const DEG = Math.PI / 180;

describe('design-3d window-parts', () => {
  describe('every design the lab can draw', () => {
    for (const p of LAB_PRESETS) {
      it(`${p.key}: builds sound, bounded geometry`, () => {
        const design = p.build();
        const before = serialize(design);
        const parts = buildWindowParts(design);
        expect(serialize(design)).toBe(before); // the document is not touched
        expect(parts.parts.length).toBeGreaterThan(0);

        const ids = new Set(parts.groups.map((g) => g.id));
        const partIds = new Set<string>();
        for (const part of parts.parts) {
          expect(partIds.has(part.id)).withContext(part.id).toBeFalse();
          partIds.add(part.id);
          expect(part.positions.length % 9).toBe(0);
          expect(part.normals.length).toBe(part.positions.length);
          expect(part.positions.every(Number.isFinite)).withContext(part.id).toBeTrue();
          expect(part.normals.every(Number.isFinite)).withContext(part.id).toBeTrue();
          if (part.groupId) expect(ids.has(part.groupId)).withContext(part.id).toBeTrue();
        }
        // Every moving group moves something.
        parts.groups.forEach((g) => expect(parts.parts.some((x) => x.groupId === g.id)).toBeTrue());

        // Closed, the window stays inside frame size × depth (handles stand proud of the room face).
        const b = boundsOf(parts.parts.filter((x) => x.role !== 'handle'));
        expect(b.min[0]).toBeGreaterThanOrEqual(-1e-6);
        expect(b.max[0]).toBeLessThanOrEqual(design.frame.widthMm + 1e-6);
        expect(b.min[1]).toBeGreaterThanOrEqual(-1e-6);
        expect(b.max[1]).toBeLessThanOrEqual(design.frame.heightMm + 1e-6);
        expect(b.min[2]).toBeGreaterThanOrEqual(-parts.depthMm - 1e-6);
        expect(b.max[2]).toBeLessThanOrEqual(1e-6);

        // Far inside the roadmap's budget of 20,000 triangles for one window.
        expect(triangleTotal(parts)).toBeLessThan(5000);
        // Same document, same parts.
        expect(buildWindowParts(p.build())).toEqual(parts);
      });
    }
  });

  it('a fixed window: four mitred frame members and one glass, in a box of frame size × depth', () => {
    const { design, parts } = build('single-fixed');
    const { widthMm, heightMm, shape } = design.frame;
    expect(count(parts, 'frame')).toBe(frameMembers(shape, widthMm, heightMm).length);
    expect(count(parts, 'glass')).toBe(1);
    expect(count(parts, 'sash')).toBe(0);
    expect(parts.groups).toEqual([]);
    const b = boundsOf(partsOfRole(parts, 'frame'));
    [0, 0, -SECTION_DATA.casementFrameDepthMm].forEach((v, i) => expect(b.min[i]).toBeCloseTo(v, 9));
    [widthMm, heightMm, 0].forEach((v, i) => expect(b.max[i]).toBeCloseTo(v, 9));
  });

  it('member count = frame members + dividers + four per sash', () => {
    const { design, parts } = build('mixed-mullion-transom');
    const { widthMm, heightMm, shape } = design.frame;
    const lay = layout(design);
    expect(count(parts, 'frame')).toBe(frameMembers(shape, widthMm, heightMm).length);
    expect(count(parts, 'divider')).toBe(lay.dividers.length);
    expect(count(parts, 'divider')).toBe(2);
    expect(count(parts, 'sash')).toBe(4); // one opening sash
    expect(count(parts, 'glass')).toBe(lay.leaves.length);
  });

  it('a two-sash casement: each sash turns outwards about its own jamb, up to 90°', () => {
    const { design, parts } = build('two-sash-casement');
    expect(count(parts, 'sash')).toBe(8);
    expect(parts.groups.length).toBe(2);
    const [left, right] = [group(parts, 0), group(parts, 1)];
    expect(left.kind).toBe('hinge');
    expect(left.axis).toEqual([0, 1, 0]);
    expect(left.pivot[0]).toBeCloseTo(60, 9);
    expect(right.pivot[0]).toBeCloseTo(design.frame.widthMm - 60, 9);
    // Turning +y by a negative angle takes +x towards +z (outside): the left sash opens out.
    expect(left.travel).toBeCloseTo(-90 * DEG, 9);
    expect(right.travel).toBeCloseTo(90 * DEG, 9);
    // The handle is on the meeting side, away from the hinges.
    const handle = boundsOf(parts.parts.filter((p) => p.role === 'handle' && p.groupId === left.id));
    expect(handle.min[0]).toBeGreaterThan(design.frame.widthMm / 2 - 200);
  });

  it('top-hung and bottom-hung sashes turn about a horizontal edge within their limits', () => {
    const { parts } = build('opening-symbols');
    const travels = parts.groups.map((g) => Math.round(g.travel / DEG));
    expect(travels).toEqual([-90, 90, -45, -25, -90]);
    expect(group(parts, 2).axis).toEqual([1, 0, 0]);
    expect(group(parts, 3).axis).toEqual([1, 0, 0]);
    // Top-hung pivots on its top edge, bottom-hung on its bottom edge.
    expect(group(parts, 2).pivot[1]).toBeGreaterThan(group(parts, 3).pivot[1]);
  });

  it('a 3-track slider with mesh: one shutter per track, a mesh track behind, a deeper frame', () => {
    const { parts } = build('sliding-3-track-mesh');
    expect(parts.depthMm).toBe(slidingFrameDepthMm(4));
    expect(count(parts, 'mesh')).toBe(1);
    expect(count(parts, 'glass')).toBe(3);
    expect(count(parts, 'sash')).toBe(16); // three shutters and the mesh shutter
    expect(parts.groups.map((g) => g.kind)).toEqual(['slide', 'slide', 'slide']);
    // No shutter is sent out of the frame: the end ones slide inwards.
    expect(parts.groups.map((g) => Math.sign(g.travel))).toEqual([1, -1, -1]);
    // Each shutter runs on its own track: three different depths.
    const depths = [0, 1, 2].map((i) => boundsOf(parts.parts.filter((p) => p.id.startsWith(`p1-panel-${i}-sash`))).max[2]);
    expect(new Set(depths.map((d) => d.toFixed(3))).size).toBe(3);
    const frame = boundsOf(partsOfRole(parts, 'frame'));
    expect(frame.min[2]).toBeCloseTo(-parts.depthMm, 9);
  });

  it('fixed shutters do not slide', () => {
    const { parts } = build('sliding-2-track-4-panel');
    expect(parts.groups.length).toBe(2);
    expect(parts.parts.filter((p) => p.id.startsWith('p1-panel-0')).every((p) => p.groupId === null)).toBeTrue();
  });

  it('a door with a low threshold: two jambs, a head, a threshold, and the leaf swings its own way', () => {
    const { design, parts } = build('door-single');
    expect(count(parts, 'frame')).toBe(3);
    expect(count(parts, 'threshold')).toBe(1);
    expect(parts.groups.length).toBe(1);
    // Hinged on the left, swing In: the free edge goes to the room (−z).
    expect(group(parts, 0).travel).toBeCloseTo(90 * DEG, 9);
    // The leaf comes down to the threshold instead of stopping at a sill.
    const leaf = boundsOf(partsOfRole(parts, 'sash'));
    expect(leaf.min[1]).toBeLessThan(SECTION_DATA.lowThresholdHeightMm + 10);
    expect(design.door?.threshold).toBe('Low');
    // A handle on each face.
    expect(count(parts, 'handle')).toBe(4);
  });

  it('a double door that swings out opens both leaves outwards', () => {
    const { parts } = build('door-double-top-light');
    expect(count(parts, 'frame')).toBe(4); // standard threshold: a full sill
    expect(parts.groups.map((g) => Math.round(g.travel / DEG))).toEqual([-90, 90]);
  });

  describe('shaped frames', () => {
    it('an arch: one curved head, a sill and two jambs', () => {
      const { design, parts } = build('shape-arch');
      const { widthMm, heightMm, shape } = design.frame;
      expect(count(parts, 'frame')).toBe(frameMembers(shape, widthMm, heightMm).length);
      expect(count(parts, 'frame')).toBe(4);
      // The apex of the head touches the top of the frame box.
      expect(boundsOf(partsOfRole(parts, 'frame')).max[1]).toBeCloseTo(heightMm, 6);
    });

    it('a mullion under an arch is cut to the arch', () => {
      const { design, parts } = build('shape-arch-semicircle');
      expect(count(parts, 'divider')).toBe(1);
      const mullion = boundsOf(partsOfRole(parts, 'divider'));
      expect(mullion.max[1]).toBeLessThan(design.frame.heightMm - 60 + 1e-6);
      expect(mullion.max[1]).toBeGreaterThan(design.frame.heightMm - 120);
      expect(count(parts, 'glass')).toBe(2);
    });

    it('a circle is one ring; a triangle three members; a trapezoid four', () => {
      expect(count(build('shape-circle').parts, 'frame')).toBe(1);
      expect(count(build('shape-triangle').parts, 'frame')).toBe(3);
      expect(count(build('shape-trapezoid').parts, 'frame')).toBe(4);
    });
  });

  it('follows the frame face it is given, like the 2D layout', () => {
    const design = preset('single-fixed');
    const glass = (faceMm: number): number =>
      boundsOf(partsOfRole(buildWindowParts(design, { frameFaceMm: faceMm }), 'glass')).min[0];
    expect(glass(60)).toBeCloseTo(60, 9);
    expect(glass(80)).toBeCloseTo(80, 9);
  });

  it('draws glazing bars on every glass when the design has them', () => {
    const design = preset('single-fixed');
    const withBars: WindowDesign = { ...design, glazing: { ...design.glazing, barsH: 1, barsV: 2 } };
    expect(count(buildWindowParts(withBars), 'glazing-bar')).toBe(3);
    expect(count(buildWindowParts(design), 'glazing-bar')).toBe(0);
  });
});
