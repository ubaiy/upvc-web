import { DesignerCatalog } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog';
import { demoCatalog } from '../quotation/sub-quotation/sub-quotation-design/testing/demo-catalog';
import { setLeafSpec, setWindowGlass } from '../../shared/design-model';
import { createStructure, setFaceFill, Structure } from '../../shared/structure-model';
import { withWindows } from './panel-designs';
import {
  barChoices,
  barControls,
  controlOf,
  describeWindow,
  firstChoices,
  glassChoices,
  hubControls,
  setStructureColour,
  setStructureGlass,
  tintOfGlass,
} from './structure-choices';

/** The demo catalogue with a second colour, a bronze glass and a mullion more. */
function catalog(): DesignerCatalog {
  const base = demoCatalog();
  const oak = { id: 7, color_name: 'Oak', color_code: '#6b4a32', is_default: 0 };
  return {
    ...base,
    glass: [...base.glass, { id: 16, label: '6mm bronze glass', isDefault: false }],
    colours: [...base.colours, { id: 7, label: 'Oak', hex: '#6b4a32', isDefault: false, row: oak }],
    mullions: [...base.mullions, { id: 30, label: 'P60-T · Transom' }],
  };
}

const empty = (): DesignerCatalog => ({ ...demoCatalog(), glass: [], colours: [], mullions: [] });

describe('what the catalogue offers a structure', () => {
  it('offers the glass rows and the mullion profiles of the catalogue, in its order', () => {
    expect(glassChoices(catalog()).map((g) => [g.id, g.label])).toEqual([
      [1, '5mm plain glass'],
      [2, '4mm Plain glass'],
      [15, '6+6 DGU glass reflactive'],
      [16, '6mm bronze glass'],
    ]);
    expect(barChoices(catalog()).map((b) => b.id)).toEqual([29, 30]);
  });

  it('a new structure takes the default glass, the default colour and the first mullion for every bar it charges', () => {
    const s = firstChoices(createStructure('cabin'), catalog());
    expect(s.defaults.glassId).toBe(1);
    expect(s.defaults.colorId).toBe(1);
    expect(s.appearance.profileColour).toBe('#ffffff');
    expect(s.defaults.bars).toEqual({ eave: 29, rafter: 29 });
    expect(s.defaults.bars['frame']).withContext('window frames are the windows').toBeUndefined();
    expect(s.defaults.bars['coupler']).withContext('couplers and corner posts come from the accessories').toBeUndefined();
    expect(s.defaults.bars['corner_post']).toBeUndefined();
  });

  it('the default glass is the one the catalogue marks; the first when it marks none', () => {
    const c = catalog();
    c.glass = c.glass.map((g) => ({ ...g, isDefault: g.id === 15 }));
    expect(firstChoices(createStructure('cabin'), c).defaults.glassId).toBe(15);
    c.glass = c.glass.map((g) => ({ ...g, isDefault: false }));
    expect(firstChoices(createStructure('cabin'), c).defaults.glassId).toBe(1);
  });

  it('keeps what is already chosen, and only fills what is empty', () => {
    let s: Structure = createStructure('lean-to');
    s = { ...s, defaults: { ...s.defaults, glassId: 15, colorId: 7, bars: { rafter: 30 } } };
    const next = firstChoices(s, catalog());
    expect(next.defaults.glassId).toBe(15);
    expect(next.defaults.colorId).toBe(7);
    expect(next.defaults.bars['rafter']).toBe(30);
    expect(next.defaults.bars['eave']).toBe(29);
    expect(next.defaults.bars['wall_plate']).toBe(29);
    expect(firstChoices(next, catalog())).withContext('a second pass changes nothing').toBe(next);
  });

  it('chooses nothing from an empty catalogue', () => {
    const s = firstChoices(createStructure('cabin'), empty());
    expect(s.defaults).toEqual({ profileSystemId: null, colorId: null, glassId: null, bars: {}, hubs: {} });
  });

  it('a bar whose profile was removed from the catalogue gets the first mullion again', () => {
    let s = createStructure('lean-to');
    s = { ...s, defaults: { ...s.defaults, bars: { rafter: 999 } } };
    expect(firstChoices(s, catalog()).defaults.bars['rafter']).toBe(29);
  });

  it('lists one control for each bar role the structure charges, couplers and corner posts as automatic', () => {
    const s = firstChoices(createStructure('cabin'), catalog());
    const rows = barControls(s);
    expect(rows.map((r) => r.role)).toEqual(['eave', 'rafter', 'coupler', 'corner_post']);
    expect(rows.find((r) => r.role === 'eave')).toEqual(jasmine.objectContaining({ label: 'Eave beam', value: 29, automatic: false }));
    expect(rows.find((r) => r.role === 'coupler')).toEqual(jasmine.objectContaining({ label: 'Coupler', value: null, automatic: true }));
    expect(barControls(createStructure('bay')).map((r) => r.role)).toEqual(['corner_post']);
  });

  it('lists the hubs a structure has, none chosen to begin with', () => {
    expect(hubControls(createStructure('dome')).map((h) => [h.role, h.label, h.value])).toEqual([
      ['crown', 'Crown hub', null],
      ['node', 'Node connector', null],
    ]);
    expect(hubControls(createStructure('cabin'))).toEqual([]);
  });

  it('knows which control a refusal means', () => {
    expect(controlOf('glass')).toEqual({ kind: 'glass' });
    expect(controlOf('colour')).toEqual({ kind: 'colour' });
    expect(controlOf('solid_panel')).toEqual({ kind: 'solid_panel' });
    expect(controlOf('bar.rafter')).toEqual({ kind: 'bar', role: 'rafter' });
    expect(controlOf('bar.corner_post')).toEqual({ kind: 'bar', role: 'corner_post' });
    expect(controlOf('')).toBeNull();
    expect(controlOf('something new')).toBeNull();
  });
});

describe('the colour and the glass of the whole structure', () => {
  it('the glass of a structure is the glass of the windows that followed it, not of one the user changed', () => {
    let s = withWindows(firstChoices(createStructure('cabin'), catalog()));
    const own = s.faces.find((f) => f.id === 'front-2')!;
    s = {
      ...s,
      faces: s.faces.map((f) =>
        f === own && f.fill.kind === 'design' && f.fill.design
          ? { ...f, fill: { ...f.fill, design: { ...f.fill.design, glazing: { ...f.fill.design.glazing, glassId: 2 } } } }
          : f
      ),
    };
    const next = setStructureGlass(s, catalog(), 16);
    expect(next.defaults.glassId).toBe(16);
    const glassOf = (id: string): unknown => {
      const fill = next.faces.find((f) => f.id === id)!.fill;
      return fill.kind === 'design' ? fill.design?.glazing.glassId : undefined;
    };
    expect(glassOf('front-1')).toBe(16);
    expect(glassOf('front-2')).withContext('chosen for itself').toBe(2);
    expect(next.appearance.glassTint).toBe('#c9a27a');
  });

  it('the colour goes to the structure and to every window', () => {
    const s = withWindows(firstChoices(createStructure('cabin'), catalog()));
    const next = setStructureColour(s, catalog(), 7);
    expect(next.defaults.colorId).toBe(7);
    expect(next.appearance.profileColour).toBe('#6b4a32');
    for (const f of next.faces.filter((x) => x.fill.kind === 'design')) {
      const d = f.fill.kind === 'design' ? f.fill.design : undefined;
      expect([d?.frame.colorId, d?.frame.profileColor]).withContext(f.id).toEqual([7, '#6b4a32']);
    }
  });

  it('draws a glass in the tint its name gives, or the usual one', () => {
    expect(tintOfGlass(catalog(), 16)).toBe('#c9a27a');
    expect(tintOfGlass(catalog(), 1)).toBe('#9fc4cf');
    expect(tintOfGlass(catalog(), null)).toBe('#9fc4cf');
  });

  it('solid panels and roof panes are not touched by a change of colour', () => {
    const base = setFaceFill(firstChoices(createStructure('cabin'), catalog()), ['roof-1'], 'panel');
    const s = setStructureColour(withWindows(base), catalog(), 7);
    expect(s.faces.find((f) => f.id === 'roof-1')!.fill).toEqual({ kind: 'panel', productId: null });
  });
});

describe('a window said in one line', () => {
  it('gives the size, the glass, how it opens and its handle', () => {
    const s = withWindows(createStructure('cabin'));
    const fill = s.faces.find((f) => f.id === 'front-1')!.fill;
    if (fill.kind !== 'design' || !fill.design) throw new Error('no design');
    expect(describeWindow(fill.design, catalog())).toBe('675 × 2400 mm · Fixed glass');
    const open = setLeafSpec(setWindowGlass(fill.design, 16), 'p1', {
      category: 'Casement',
      casementType: 'Openable',
      opening: { direction: 'Left', handleId: 55, hingesType: 'Friction' },
    });
    expect(describeWindow(open, catalog())).toBe('675 × 2400 mm · 6mm bronze glass · Casement (side-hung) · Casement Handle');
  });
});
