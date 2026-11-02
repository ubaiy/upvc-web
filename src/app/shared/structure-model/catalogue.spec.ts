import { createDesign, setLeafSpec, setSlide, equalPanels, makeDoor } from '../design-model';
import { chargedJoints, isWindowBar, isWindowFace, summarize } from './derive';
import {
  chargedBarRoles,
  openingOfDesign,
  setBarProfile,
  setDefaults,
  setFaceDesigns,
  setFaceGlass,
  setFaceProduct,
  setHubItem,
} from './catalogue-ops';
import { createStructure, parseStructure, retemplate, serializeStructure, setFaceFill } from './operations';
import { windowFrameOf } from './window-shape';
import { Face, Structure } from './types';

const face = (s: Structure, id: string): Face => s.faces.find((f) => f.id === id)!;
const rolesCharged = (s: Structure): string[] => [...new Set(chargedJoints(s).map((j) => j.role))].sort();

describe('structure defaults for the catalogue', () => {
  it('a new structure has no bar and no hub chosen yet', () => {
    const s = createStructure('cabin');
    expect(s.defaults).toEqual({ profileSystemId: null, colorId: null, glassId: null, bars: {}, hubs: {} });
  });

  it('a saved structure from before the catalogue loads with empty bars and hubs', () => {
    const s = createStructure('lean-to');
    const old = JSON.parse(serializeStructure(s));
    old.defaults = { profileSystemId: null, colorId: 4, glassId: null };
    const loaded = parseStructure(JSON.stringify(old));
    expect(loaded.defaults).toEqual({ profileSystemId: null, colorId: 4, glassId: null, bars: {}, hubs: {} });
    delete old.defaults;
    expect(parseStructure(JSON.stringify(old)).defaults).toEqual({ profileSystemId: null, colorId: null, glassId: null, bars: {}, hubs: {} });
  });

  it('a stretch of the structure keeps what was chosen', () => {
    const s = setBarProfile(setDefaults(createStructure('cabin'), { glassId: 5 }), 'eave', 29);
    const wider = retemplate(s, { width: 4200 });
    expect(wider.defaults.glassId).toBe(5);
    expect(wider.defaults.bars).toEqual({ eave: 29 });
  });

  it('chooses a bar profile, a hub item, a glass for roof panes and an item for solid panels', () => {
    let s = createStructure('gable');
    s = setBarProfile(s, 'rafter', 29);
    s = setHubItem(s, 'ridge_end', 71);
    expect(s.defaults.bars).toEqual({ rafter: 29 });
    expect(s.defaults.hubs).toEqual({ ridge_end: 71 });
    expect(setBarProfile(s, 'rafter', null).defaults.bars).toEqual({});
    expect(setHubItem(s, 'ridge_end', null).defaults.hubs).toEqual({});

    s = setFaceGlass(s, ['roof-left-1', 'front-1'], 15);
    expect((face(s, 'roof-left-1').fill as { glassId: number }).glassId).toBe(15);
    expect(face(s, 'front-1').fill.kind).withContext('a window has its own glass').toBe('design');
    expect(face(s, 'roof-left-2').fill).toEqual({ kind: 'glass', glassId: null });

    s = setFaceFill(s, ['roof-right-1', 'roof-right-2'], 'panel');
    s = setFaceProduct(s, ['roof-right-1', 'roof-left-1'], 22);
    expect((face(s, 'roof-right-1').fill as { productId: number }).productId).toBe(22);
    expect((face(s, 'roof-right-2').fill as { productId: number | null }).productId).toBeNull();
    expect(face(s, 'roof-left-1').fill.kind).toBe('glass');
  });
});

describe('a bar between wall panels belongs to the windows', () => {
  it('cabin: the frame bars round the wall panels are the windows; couplers and corner posts are charged', () => {
    const s = createStructure('cabin');
    const roles = rolesCharged(s);
    expect(roles).toContain('coupler');
    expect(roles).toContain('corner_post');
    expect(roles).toContain('eave');
    expect(roles).not.toContain('frame');
    expect(roles).not.toContain('transom');
    const sum = summarize(s);
    expect(sum.bars.map((b) => b.role)).not.toContain('frame');
    const inside = s.joints.filter((j) => isWindowBar(j, s));
    expect(inside.length).toBeGreaterThan(0);
    expect(sum.windowBars.count).toBe(inside.length);
    expect(sum.barCount + sum.windowBars.count).toBe(s.joints.length);
    expect(sum.barCount).toBe(sum.bars.reduce((n, r) => n + r.count, 0));
  });

  it('cabin: the bar over the door belongs to the door and the light over it', () => {
    const s = createStructure('cabin');
    const transoms = s.joints.filter((j) => j.role === 'transom');
    expect(transoms.length).toBe(1);
    expect(transoms[0].faceIds.sort()).toEqual(['door', 'door-top']);
    expect(isWindowBar(transoms[0], s)).toBeTrue();
  });

  it('bay: the corner posts are charged and the frame bars are not', () => {
    const s = createStructure('bay');
    expect(rolesCharged(s)).toEqual(['corner_post']);
    expect(chargedJoints(s).length).toBe(2);
  });

  it('lean-to: the eave, rafters and wall plate are charged, the bottom frame bars are not', () => {
    const s = createStructure('lean-to');
    const roles = rolesCharged(s);
    expect(roles).toEqual(['corner_post', 'coupler', 'eave', 'rafter', 'wall_plate']);
    expect(chargedJoints(s).length).toBeLessThan(s.joints.length);
  });

  it('gable: the mullion between the two halves of the gable light is part of the windows', () => {
    const s = createStructure('gable');
    const mullion = s.joints.find((j) => j.role === 'mullion')!;
    expect(mullion.faceIds.sort()).toEqual(['gable-1', 'gable-2']);
    expect(isWindowBar(mullion, s)).toBeTrue();
    expect(rolesCharged(s)).not.toContain('mullion');
  });

  it('a bar is charged again when a panel it touches is no longer a window', () => {
    let s = createStructure('bay');
    const frame = s.joints.find((j) => j.role === 'frame' && j.faceIds.includes('s1'))!;
    expect(isWindowBar(frame, s)).toBeTrue();
    s = setFaceFill(s, ['s1'], 'panel');
    expect(isWindowBar(s.joints.find((j) => j.id === frame.id)!, s)).toBeFalse();
    expect(chargedBarRoles(s)).toContain('frame');
    expect(summarize(s).bars.map((b) => b.role)).toContain('frame');
  });

  it('a roof with no window in it keeps every bar charged', () => {
    const s = createStructure('dome');
    expect(chargedJoints(s).length).toBe(s.joints.length);
    expect(summarize(s).windowBars).toEqual({ count: 0, totalMm: 0 });
  });
});

describe('which wall panels can be windows', () => {
  it('a rectangle is a frame of its width and height', () => {
    const s = createStructure('cabin');
    expect(windowFrameOf(face(s, 'front-1'))).toEqual({ widthMm: 675, heightMm: 2400, shape: { kind: 'rect' } });
  });

  it('the panels under a lean-to roof are trapezoids with vertical sides', () => {
    const s = createStructure('lean-to');
    const spec = windowFrameOf(face(s, 'left-1'))!;
    expect(spec.shape.kind).toBe('trapezoid');
    const shape = spec.shape as { leftHeightMm: number; rightHeightMm: number };
    expect(spec.heightMm).toBe(Math.max(shape.leftHeightMm, shape.rightHeightMm));
    expect(Math.min(shape.leftHeightMm, shape.rightHeightMm)).toBeGreaterThanOrEqual(200);
  });

  it('the halves of a gable light are triangles with a vertical side', () => {
    const s = createStructure('gable');
    const apexes = ['gable-1', 'gable-2'].map((id) => (windowFrameOf(face(s, id))!.shape as { apex: string }).apex);
    expect(apexes.sort()).toEqual(['left', 'right']);
  });

  it('a panel with a shape no window has is not a window', () => {
    const ring = createStructure('dome').faces.find((f) => f.outline.length === 4)!;
    expect(windowFrameOf(ring)).withContext('sloping sides').toBeNull();
    const odd: Face = { ...face(createStructure('cabin'), 'front-1'), outline: [[0, 0], [900, 0], [900, 1500], [450, 2400], [0, 1500]] };
    expect(windowFrameOf(odd)).toBeNull();
    const sliver: Face = { ...odd, outline: [[0, 0], [120, 0], [120, 2400], [0, 2400]] };
    expect(windowFrameOf(sliver)).withContext('narrower than any window').toBeNull();
  });

  it('every wall panel of the templates is a window or says why not', () => {
    for (const kind of ['cabin', 'bay', 'lean-to', 'gable']) {
      const s = createStructure(kind);
      for (const f of s.faces.filter(isWindowFace)) expect(windowFrameOf(f)).withContext(`${kind} ${f.id}`).not.toBeNull();
    }
  });
});

describe('what a window design means for its panel', () => {
  it('fixed, opening, top-hung, sliding and door', () => {
    expect(openingOfDesign(createDesign({ frame: { widthMm: 900, heightMm: 1200 } }))).toBe('fixed');
    const casement = setLeafSpec(createDesign({ frame: { widthMm: 900, heightMm: 1200 } }), 'p1', {
      category: 'Casement',
      casementType: 'Openable',
      opening: { direction: 'Left', handleId: null, hingesType: null },
    });
    expect(openingOfDesign(casement)).toBe('casement');
    const top = setLeafSpec(casement, 'p1', { opening: { direction: 'Top', handleId: null, hingesType: null } });
    expect(openingOfDesign(top)).toBe('top-hung');
    const slide = setSlide(createDesign({ frame: { widthMm: 1800, heightMm: 1200 } }), 'p1', { tracks: '2 Track', mesh: false, panels: equalPanels(2, 1680, 0, '2 Track') });
    expect(openingOfDesign(slide)).toBe('sliding');
    const door = makeDoor(createDesign({ frame: { widthMm: 1000, heightMm: 2100 } }), 'p1', { leaves: 1, swing: 'In', threshold: 'Standard' });
    expect(openingOfDesign(door)).toBe('door');
  });

  it('a design given to panels changes those panels and no others', () => {
    const s = createStructure('cabin');
    const design = createDesign({ frame: { widthMm: 675, heightMm: 2400 } });
    const next = setFaceDesigns(s, new Map([['front-1', design]]));
    expect(face(next, 'front-1').fill).toEqual({ kind: 'design', opening: 'fixed', design });
    expect(face(next, 'front-1').edited).toBeTrue();
    expect(next.faces.filter((f, i) => f !== s.faces[i]).map((f) => f.id)).toEqual(['front-1']);
    expect(face(next, 'front-2')).toBe(face(s, 'front-2'));
    expect(setFaceDesigns(s, new Map())).toBe(s);
  });
});
