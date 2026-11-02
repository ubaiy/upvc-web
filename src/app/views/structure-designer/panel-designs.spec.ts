import { walkLeaves, WindowDesign, setLeafSpec } from '../../shared/design-model';
import { createStructure, Face, retemplate, setFaceFill, Structure } from '../../shared/structure-model';
import { applyDesign, fitDesign, noWindowReason, startingWindow, withWindows } from './panel-designs';

const face = (s: Structure, id: string): Face => s.faces.find((f) => f.id === id)!;
const designOf = (s: Structure, id: string): WindowDesign => {
  const fill = face(s, id).fill;
  if (fill.kind !== 'design' || !fill.design) throw new Error(`${id} has no design`);
  return fill.design;
};
const size = (d: WindowDesign): [number, number] => [d.frame.widthMm, d.frame.heightMm];
const leaf = (d: WindowDesign) => walkLeaves(d.root)[0];

describe('a window for every wall panel', () => {
  it('a structure from a template has no design yet; every panel gets a starting window at its own size', () => {
    const raw = createStructure('cabin');
    expect(raw.faces.filter((f) => f.fill.kind === 'design' && f.fill.design).length).toBe(0);
    const s = withWindows(raw);
    for (const f of s.faces.filter((x) => x.fill.kind === 'design')) {
      const d = designOf(s, f.id);
      expect(d.frame.widthMm).withContext(f.id).toBeGreaterThan(0);
    }
    expect(size(designOf(s, 'front-1'))).toEqual([675, 2400]);
    expect(leaf(designOf(s, 'front-1')).casementType).toBe('Fixed');
  });

  it('the starting window follows what the panel opens as', () => {
    let s = createStructure('cabin', { shape: 'straight', width: 7200, module: 1800, doorWidth: 0 });
    s = setFaceFill(s, ['front-1'], 'casement');
    s = setFaceFill(s, ['front-2'], 'top-hung');
    s = setFaceFill(s, ['front-3'], 'sliding');
    s = setFaceFill(s, ['front-4'], 'door');
    s = withWindows(s);
    const l1 = leaf(designOf(s, 'front-1'));
    expect([l1.casementType, l1.opening?.direction]).toEqual(['Openable', 'Left']);
    const l2 = leaf(designOf(s, 'front-2'));
    expect([l2.casementType, l2.opening?.direction]).toEqual(['Openable', 'Top']);
    expect(leaf(designOf(s, 'front-3')).category).toBe('Slidding');
    expect(designOf(s, 'front-4').productType).toBe('Door');
    expect(size(designOf(s, 'front-3'))).toEqual([1800, 2400]);
  });

  it('the door of a new cabin is a door at its own size', () => {
    const s = withWindows(createStructure('cabin'));
    const door = designOf(s, 'door');
    expect(door.productType).toBe('Door');
    expect(size(door)).toEqual([900, 2100]);
  });

  it('a lean-to side panel is a trapezoid window and a gable half is a triangle window', () => {
    const lean = withWindows(createStructure('lean-to'));
    expect(designOf(lean, 'left-1').frame.shape.kind).toBe('trapezoid');
    const gable = withWindows(createStructure('gable'));
    expect(designOf(gable, 'gable-1').frame.shape.kind).toBe('triangle');
    expect(designOf(gable, 'gable-2').frame.shape).toEqual(jasmine.objectContaining({ kind: 'triangle' }));
  });

  it('a panel that cannot be a window becomes plain glass', () => {
    const base = createStructure('cabin');
    const odd: Face = { ...face(base, 'front-1'), outline: [[0, 0], [900, 0], [900, 1500], [450, 2400], [0, 1500]] };
    const s = withWindows({ ...base, faces: base.faces.map((f) => (f.id === 'front-1' ? odd : f)) });
    expect(face(s, 'front-1').fill).toEqual({ kind: 'glass', glassId: null });
    expect(noWindowReason(face(s, 'front-1'))).toContain('no window');
    expect(noWindowReason(face(s, 'front-2'))).toBe('');
  });

  it('a stored window is kept; a structure with nothing to fit is returned as it is', () => {
    const s = withWindows(createStructure('bay'));
    expect(withWindows(s)).withContext('same object when nothing changed').toBe(s);
  });

  it('a window that no longer fits its panel is fitted again when the structure is stretched', () => {
    const s = withWindows(createStructure('cabin', { shape: 'straight', width: 3600, module: 900, doorWidth: 0 }));
    const casement = setLeafSpec(designOf(s, 'front-1'), 'p1', { category: 'Casement', casementType: 'Openable', opening: { direction: 'Right', handleId: null, hingesType: null } });
    const edited = applyDesign(s, ['front-1'], casement).structure;
    const wider = withWindows(retemplate(edited, { width: 4000 }));
    expect(size(designOf(wider, 'front-1'))).toEqual([1000, 2400]);
    expect(leaf(designOf(wider, 'front-1')).opening?.direction).withContext('its choices stay').toBe('Right');
    expect(size(designOf(wider, 'front-2'))).toEqual([1000, 2400]);
    const taller = withWindows(retemplate(wider, { height: 2700 }));
    expect(size(designOf(taller, 'front-1'))).toEqual([1000, 2700]);
  });
});

describe('one design for several panels', () => {
  it('each panel takes the design fitted to its own size', () => {
    const s = withWindows(createStructure('cabin'));
    const design = setLeafSpec(designOf(s, 'front-1'), 'p1', { category: 'Casement', casementType: 'Openable', opening: { direction: 'Left', handleId: 8, hingesType: 'Friction' } });
    const { structure, kept } = applyDesign(s, ['front-1', 'front-2', 'door'], design);
    expect(kept).toEqual([]);
    expect(size(designOf(structure, 'front-1'))).toEqual([675, 2400]);
    expect(size(designOf(structure, 'front-2'))).toEqual([675, 2400]);
    expect(size(designOf(structure, 'door'))).withContext('its own size, not the first panel').toEqual([900, 2100]);
    for (const id of ['front-1', 'front-2', 'door']) {
      const l = leaf(designOf(structure, id));
      expect([id, l.casementType, l.opening?.handleId]).toEqual([id, 'Openable', 8]);
      expect(face(structure, id).edited).toBeTrue();
      expect(face(structure, id).fill).toEqual(jasmine.objectContaining({ kind: 'design', opening: 'casement' }));
    }
    expect(face(structure, 'front-3')).withContext('not selected').toBe(face(s, 'front-3'));
  });

  it('a design taken to a lean-to side panel is cut to that panel\'s trapezoid', () => {
    const s = withWindows(createStructure('lean-to'));
    const { structure, kept } = applyDesign(s, ['front-1', 'left-1'], designOf(s, 'front-1'));
    expect(kept).toEqual([]);
    expect(designOf(structure, 'left-1').frame.shape.kind).toBe('trapezoid');
    expect(designOf(structure, 'front-1').frame.shape.kind).toBe('rect');
    expect(size(designOf(structure, 'left-1'))).toEqual(size(designOf(s, 'left-1')));
  });

  it('a sliding design cannot go to a shaped panel: that panel keeps its window and is named', () => {
    const s = withWindows(setFaceFill(createStructure('lean-to', { module: 1800 }), ['front-1'], 'sliding'));
    const sliding = designOf(s, 'front-1');
    expect(leaf(sliding).category).toBe('Slidding');
    const { structure, kept } = applyDesign(s, ['front-2', 'left-1'], sliding);
    expect(face(s, 'left-1').outline.length).toBe(4);
    expect(kept).toEqual(['left-1']);
    expect(leaf(designOf(structure, 'front-2')).category).toBe('Slidding');
    expect(designOf(structure, 'left-1')).toBe(designOf(s, 'left-1'));
  });

  it('only the panels that are windows take a design', () => {
    const s = withWindows(setFaceFill(createStructure('cabin'), ['roof-1'], 'panel'));
    const { structure } = applyDesign(s, ['front-1', 'roof-1'], designOf(s, 'front-1'));
    expect(face(structure, 'roof-1')).toBe(face(s, 'roof-1'));
  });
});

describe('fitting one design to one panel', () => {
  it('returns the very same design when it already fits', () => {
    const s = withWindows(createStructure('cabin'));
    const d = designOf(s, 'front-1');
    expect(fitDesign(d, face(s, 'front-1'))).toBe(d);
  });

  it('says no when the panel is too large for any window', () => {
    const base = withWindows(createStructure('cabin'));
    const big: Face = { ...face(base, 'front-1'), outline: [[0, 0], [7000, 0], [7000, 2400], [0, 2400]] };
    expect(fitDesign(designOf(base, 'front-1'), big)).toBeNull();
    expect(startingWindow(big, 'fixed')).toBeNull();
  });
});
