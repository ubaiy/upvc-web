import { DesignerCatalog, completeDesign } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog';
import { buildManageProductBody } from '../quotation/sub-quotation/sub-quotation-design/designer-request';
import { demoCatalog } from '../quotation/sub-quotation/sub-quotation-design/testing/demo-catalog';
import { createStructure, setFaceFill, Structure } from '../../shared/structure-model';
import { firstChoices, setStructureColour } from './structure-choices';
import { applyDesign, withWindows } from './panel-designs';
import { documentFor, WALL_FRAME_FACE_MM, windowDesigns, windowsOf } from './structure-windows';
import { setLeafSpec, walkLeaves } from '../../shared/design-model';

const CTX = { quotationId: 12 };

function catalog(): DesignerCatalog {
  const base = demoCatalog();
  const oak = { id: 7, color_name: 'Oak', color_code: '#6b4a32', is_default: 0 };
  return { ...base, colours: [...base.colours, { id: 7, label: 'Oak', hex: '#6b4a32', isDefault: false, row: oak }] };
}

const open = (kind: string, params?: Record<string, number | string>): Structure => withWindows(firstChoices(createStructure(kind, params), catalog()));
const designFaces = (s: Structure): string[] => s.faces.filter((f) => f.fill.kind === 'design').map((f) => f.id);

describe('the windows of a structure, as the price asks for them', () => {
  it('names every wall panel exactly once', () => {
    for (const kind of ['cabin', 'bay', 'lean-to', 'gable']) {
      const s = open(kind);
      const named = windowsOf(s, catalog(), CTX).flatMap((w) => w.face_ids);
      expect([...named].sort()).withContext(kind).toEqual([...designFaces(s)].sort());
      expect(new Set(named).size).withContext(`${kind}: none twice`).toBe(named.length);
    }
  });

  it('equal windows are one group, with every panel that has it', () => {
    const s = open('cabin', { shape: 'straight', width: 3600, module: 900, doorWidth: 0 });
    const windows = windowsOf(s, catalog(), CTX);
    expect(windows.length).toBe(1);
    expect(windows[0].face_ids).toEqual(['front-1', 'front-2', 'front-3', 'front-4']);
  });

  it('windows of another size or another opening are another group', () => {
    const s = open('cabin');
    const windows = windowsOf(s, catalog(), CTX);
    const of = (id: string) => windows.find((w) => w.face_ids.includes(id))!;
    expect(of('front-1')).toBe(of('front-2'));
    expect(of('front-1')).not.toBe(of('door'));
    expect(of('door').face_ids).toEqual(['door']);
    expect(of('front-1').face_ids).toEqual(['front-1', 'front-2', 'front-3', 'front-4', 'right-1', 'back-1', 'back-2'].filter((id) => of('front-1').face_ids.includes(id)));

    const casement = setLeafSpec(windowDesigns(s).get('front-1')!, 'p1', { category: 'Casement', casementType: 'Openable', opening: { direction: 'Left', handleId: null, hingesType: null } });
    const edited = applyDesign(s, ['front-1'], casement).structure;
    const after = windowsOf(edited, catalog(), CTX);
    expect(after.find((w) => w.face_ids.includes('front-1'))!.face_ids).toEqual(['front-1']);
    expect(after.flatMap((w) => w.face_ids).length).toBe(designFaces(s).length);
  });

  it('the body of a window is the one the window designer sends to be priced', () => {
    const s = open('cabin');
    const [first] = windowsOf(s, catalog(), CTX);
    const design = completeDesign(windowDesigns(s).get(first.face_ids[0])!, catalog());
    const expected = buildManageProductBody(design, catalog(), { quotationId: 12, lineId: null, quantity: 1, label: '', frameFaceMm: WALL_FRAME_FACE_MM });
    expect(first.body).toEqual(expected);
    expect(first.body.is_saved).toBeFalse();
    expect(first.body.quantity).toBe(1);
    expect(first.body.quatation_id).toBe(12);
  });

  it('the colour and glass of the structure are in every body', () => {
    let s = open('cabin');
    s = setStructureColour(s, catalog(), 7);
    s = { ...s, defaults: { ...s.defaults, glassId: 15 } };
    for (const w of windowsOf(s, catalog(), CTX)) {
      expect((w.body.color as { id: number }).id).toBe(7);
      expect(w.body.profile_color).toBe('#6b4a32');
    }
    const design = windowDesigns(s).get('front-1')!;
    expect(design.glazing.glassId).withContext('a window that follows the structure takes its glass').toBe(15);
  });

  it('a window with a glass of its own keeps it', () => {
    let s = open('cabin');
    const d = windowDesigns(s).get('front-1')!;
    s = applyDesign(s, ['front-1'], { ...d, glazing: { ...d.glazing, glassId: 2 } }).structure;
    expect(windowDesigns(s).get('front-1')!.glazing.glassId).toBe(2);
    expect(windowDesigns(s).get('front-2')!.glazing.glassId).toBe(1);
  });

  it('plain glass and solid panels are not windows', () => {
    const s = setFaceFill(open('cabin'), ['front-1'], 'panel');
    const named = windowsOf(s, catalog(), CTX).flatMap((w) => w.face_ids);
    expect(named).not.toContain('front-1');
    expect(named.length).toBe(designFaces(s).length);
  });

  it('a roof with no window has none to price', () => {
    expect(windowsOf(open('dome'), catalog(), CTX)).toEqual([]);
  });

  it('the document that goes with the windows carries them complete, nothing else changed', () => {
    const s = open('bay');
    const doc = documentFor(s, catalog());
    expect(doc.faces.length).toBe(s.faces.length);
    for (const f of doc.faces) {
      expect(f.fill.kind).toBe('design');
      const design = f.fill.kind === 'design' ? f.fill.design : undefined;
      const leaf = walkLeaves(design!.root)[0];
      expect(leaf.productId).withContext(`${f.id} has its frame profile`).not.toBeNull();
    }
    expect(doc.defaults).toEqual(s.defaults);
    expect(doc.joints).toBe(s.joints);
  });
});
