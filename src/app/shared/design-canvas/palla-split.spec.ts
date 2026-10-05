// Split and Transom divide ONE palla (card T127): the four cases the owner
// named, on the canvas itself: what the tools divide, the hint line, the
// bar that is drawn, dragging it, deleting it, undo and redo.
import 'zone.js/testing';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import type Konva from 'konva';
import {
  LeafNode,
  WindowDesign,
  addDoorTopLight,
  findNode,
  isSplit,
  layout,
  makeDoor,
  pallaBarLayouts,
  setSlideMesh,
  toPayload,
  walkLeaves,
} from '../design-model';
import { singleFixed, slidingThreeTrackMesh, twoSashOpenable } from '../design-model/testing/fixtures';
import { pxFromMm } from './canvas-view';
import { DesignCanvasComponent } from './design-canvas.component';

describe('DesignCanvasComponent: Split / Transom on one palla (T127)', () => {
  let fixture: ComponentFixture<DesignCanvasComponent>;
  let component: DesignCanvasComponent;

  function create(model: WindowDesign): void {
    fixture = TestBed.createComponent(DesignCanvasComponent);
    component = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    el.style.display = 'block';
    el.style.width = '900px';
    el.style.height = '640px';
    fixture.componentRef.setInput('model', model);
    fixture.detectChanges();
  }

  function find<T extends Konva.Node = Konva.Node>(name: string): T[] {
    const stage = component.getStage();
    return stage ? (stage.getLayers()[0].find(`.${name}`) as T[]) : [];
  }

  function fireMm(type: string, xMm: number, yMm: number, init: PointerEventInit = {}): void {
    const host = (fixture.nativeElement as HTMLElement).querySelector('.dc-canvas-host') as HTMLElement;
    const rect = host.getBoundingClientRect();
    const p = pxFromMm(component.currentView(), xMm, yMm);
    host.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: rect.left + p.x,
        clientY: rect.top + p.y,
        ...init,
      })
    );
  }

  function clickMm(xMm: number, yMm: number, init: PointerEventInit = {}): void {
    fireMm('pointermove', xMm, yMm, init);
    fireMm('pointerdown', xMm, yMm, init);
    fireMm('pointerup', xMm, yMm, init);
  }

  const leaf = (id: string): LeafNode => findNode(component.design.root, id) as LeafNode;
  const leaves = (): LeafNode[] => walkLeaves(component.design.root);
  const bars = () => pallaBarLayouts(component.currentLayout());

  function doorWithTopLight(): WindowDesign {
    const base = singleFixed();
    return addDoorTopLight(
      makeDoor({ ...base, frame: { ...base.frame, widthMm: 1800, heightMm: 2400 } }, 'p1', {
        leaves: 2,
        swing: 'Out',
        threshold: 'Low',
      }),
      300,
      { dividerFaceMm: 60 }
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DesignCanvasComponent] }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  it('(a) single fixed window: the selected pane takes a frame divider, no palla bar', () => {
    create(singleFixed());
    component.selectPane('p1');
    expect(component.toolHint).toContain('frame divider');
    expect(component.splitSelected('x')).toBeTrue();
    expect(isSplit(component.design.root)).toBeTrue();
    expect(leaves().length).toBe(2);
    expect(find('palla-bar').length).toBe(0);
    component.undo();
    expect(leaves().length).toBe(1);
  });

  it('(b) 2-sash casement: Split, then Transom on the other sash, each divides its own sash only', () => {
    const model = twoSashOpenable();
    create(model);
    const [left, right] = leaves();
    component.selectPane(left.id);
    expect(component.toolHint).toBe('Split / Transom will divide sash 1 only.');
    expect(component.splitSelected('x')).toBeTrue();
    expect(leaves().length).toBe(2);
    expect(leaf(left.id).bars).toEqual({ axis: 'x', at: [0.5] });
    expect(leaf(right.id).bars).toBeUndefined();
    // The same sash does not take a bar the other way; the model is untouched.
    const before = component.design;
    expect(component.splitSelected('y')).toBeFalse();
    expect(component.design).toBe(before);
    component.selectPane(right.id);
    expect(component.splitSelected('y')).toBeTrue();
    expect(leaf(right.id).bars).toEqual({ axis: 'y', at: [0.5] });
    expect(find('palla-bar').length).toBe(2);
    expect(toPayload(component.design)).toEqual(toPayload(model));
  });

  for (const mesh of [true, false]) {
    it(`(c) 3-shutter slider ${mesh ? 'with' : 'without'} mesh: the armed tool divides the shutter under the pointer`, () => {
      const model = mesh ? slidingThreeTrackMesh() : setSlideMesh(slidingThreeTrackMesh(), 'p1', false);
      create(model);
      component.armTool('split-y');
      expect(component.toolHint).toContain('pick the palla to divide');
      // The middle of the middle shutter.
      const rect = component.currentLayout().nodes.get('p1')!.rect;
      const x = rect.xMm + rect.wMm / 2;
      const y = rect.yMm + rect.hMm * 0.4;
      fireMm('pointermove', x, y);
      expect(component.toolHint).toContain('shutter 2 of 3');
      fireMm('pointerdown', x, y);
      fireMm('pointerup', x, y);
      expect(component.armedTool).toBeNull();
      const slide = leaf('p1').slide!;
      expect(slide.panels.length).toBe(3);
      expect(slide.mesh).toBe(mesh);
      expect(slide.panels[0].bars).toBeUndefined();
      expect(slide.panels[2].bars).toBeUndefined();
      expect(slide.panels[1].bars!.axis).toBe('y');
      expect(slide.panels[1].bars!.at[0]).toBeCloseTo(0.4, 2);
      expect(isSplit(component.design.root)).toBeFalse();
      // One bar is drawn, inside shutter 2.
      const drawn = find<Konva.Rect>('palla-bar');
      expect(drawn.length).toBe(1);
      const palla = bars()[0].palla;
      const a = pxFromMm(component.currentView(), palla.xMm, palla.yMm);
      const b = pxFromMm(component.currentView(), palla.xMm + palla.wMm, palla.yMm + palla.hMm);
      expect(drawn[0].x()).toBeGreaterThanOrEqual(a.x - 0.5);
      expect(drawn[0].x() + drawn[0].width()).toBeLessThanOrEqual(b.x + 0.5);
      expect(toPayload(component.design)).toEqual(toPayload(model));
    });
  }

  it('(d) door with a top light: a leaf gets its own bar, the top light a frame divider', () => {
    const model = doorWithTopLight();
    create(model);
    const [light, leafA, leafB] = leaves();
    component.selectPane(leafA.id);
    expect(component.splitSelected('y')).toBeTrue();
    expect(leaves().length).toBe(3);
    expect(leaf(leafA.id).bars).toEqual({ axis: 'y', at: [0.5] });
    expect(leaf(leafB.id).bars).toBeUndefined();
    expect(toPayload(component.design)).toEqual(toPayload(model));
    component.selectPane(light.id);
    expect(component.toolHint).toContain('frame divider');
    expect(component.splitSelected('x')).toBeTrue();
    expect(leaves().length).toBe(4);
    expect(leaf(leafA.id).bars).toEqual({ axis: 'y', at: [0.5] });
    expect(find('palla-bar').length).toBe(1);
  });

  it('a bar is dragged inside its sash, deleted, and both are undone and redone', () => {
    create(twoSashOpenable());
    const id = leaves()[0].id;
    component.selectPane(id);
    component.splitSelected('y');
    const bar = bars()[0];
    const x = bar.rect.xMm + bar.rect.wMm / 2;
    const y0 = bar.rect.yMm + bar.rect.hMm / 2;
    fireMm('pointermove', x, y0);
    fireMm('pointerdown', x, y0);
    expect(component.selection).toEqual({ type: 'bar', paneId: id, index: 0 });
    fireMm('pointermove', x, y0 + 100);
    fireMm('pointermove', x, y0 + 200);
    fireMm('pointerup', x, y0 + 200);
    const at = leaf(id).bars!.at[0];
    expect(at * bar.palla.hMm).toBeCloseTo(0.5 * bar.palla.hMm + 200, 0);
    expect(leaves().length).toBe(2);

    component.undo();
    expect(leaf(id).bars).toEqual({ axis: 'y', at: [0.5] });
    component.redo();
    expect(leaf(id).bars!.at[0]).toBe(at);

    component.setSelection({ type: 'bar', paneId: id, index: 0 });
    component.deleteSelectedDivider();
    expect(leaf(id).bars).toBeUndefined();
    expect(component.selection).toEqual({ type: 'pane', paneId: id });
    expect(find('palla-bar').length).toBe(0);
    component.undo();
    expect(leaf(id).bars!.at[0]).toBe(at);
    component.undo();
    component.undo();
    expect(leaf(id).bars).toBeUndefined();
    expect(component.design).toEqual(twoSashOpenable());
  });

  it('every part of a divided palla carries its own size, and the hint says which tool still works', () => {
    create(twoSashOpenable());
    const [left, right] = leaves();
    const whole = find<Konva.Text>('pane-label').length;
    expect(whole).toBe(2);
    component.selectPane(left.id);
    component.splitSelected('y');
    // The divided sash has no label for the whole; its two parts have one each.
    const parts = find<Konva.Text>('palla-part-label');
    expect(parts.length).toBe(2);
    expect(parts.every((n) => n.getAttr('paneId') === left.id)).toBeTrue();
    const paneLabels = find<Konva.Text>('pane-label');
    expect(paneLabels.length).toBe(1);
    expect(paneLabels[0].getAttr('paneId')).toBe(right.id);
    const rect = component.currentLayout().nodes.get(left.id)!.rect;
    expect(parts.map((n) => n.getAttr('wMm'))).toEqual([rect.wMm, rect.wMm]);
    // The two parts and the 40 mm bar make up the sash height.
    expect(parts[0].getAttr('hMm') + parts[1].getAttr('hMm') + 40).toBeCloseTo(rect.hMm, -0.5);
    expect(parts[0].y()).toBeLessThan(parts[1].y());
    expect(component.toolHint).toBe(
      'Transom adds another bar to sash 1 only. Split needs its horizontal bars removed first (pick a bar, Delete).'
    );
    // The armed tool over that sash says why it will not divide it.
    component.armTool('split-x');
    fireMm('pointermove', rect.xMm + rect.wMm / 2, rect.yMm + rect.hMm * 0.3);
    expect(component.toolHint).toContain('sash 1 already has horizontal bars');
  });

  it('the parts of a divided shutter are labelled, the other shutters are not', () => {
    create(setSlideMesh(slidingThreeTrackMesh(), 'p1', false));
    component.setSelection({ type: 'pane', paneId: 'p1', panelIndex: 1 });
    expect(component.splitSelected('x')).toBeTrue();
    const parts = find<Konva.Text>('palla-part-label');
    expect(parts.length).toBe(2);
    expect(parts.every((n) => n.getAttr('panelIndex') === 1)).toBeTrue();
    // The shutter as drawn (its laps on the neighbours included) is the two parts and the bar.
    const drawn = find<Konva.Rect>('slide-panel').find((n) => n.getAttr('panelIndex') === 1)!;
    const drawnMm = drawn.width() / component.currentView().pxPerMm;
    expect(parts[0].getAttr('wMm') + parts[1].getAttr('wMm') + 40).toBeCloseTo(drawnMm, -0.5);
    expect(drawnMm).toBeGreaterThanOrEqual(bars()[0].palla.wMm);
  });

  it('Alt+click with the armed tool puts a frame divider across the pane instead', () => {
    create(twoSashOpenable());
    const [left] = leaves();
    const rect = component.currentLayout().nodes.get(left.id)!.rect;
    component.armTool('split-y');
    clickMm(rect.xMm + rect.wMm / 2, rect.yMm + rect.hMm / 2, { altKey: true });
    expect(leaves().length).toBe(3);
    expect(leaves().every((l) => !l.bars)).toBeTrue();
  });

  it('with the frame selected an undivided window is divided as a whole', () => {
    create(layoutCheck(slidingThreeTrackMesh()));
    component.setSelection({ type: 'frame' });
    expect(component.toolHint).toContain('WHOLE window');
    expect(component.splitSelected('x')).toBeTrue();
    expect(isSplit(component.design.root)).toBeTrue();
  });
});

/** The fixture as the canvas lays it out (guards the spec's own geometry). */
function layoutCheck(d: WindowDesign): WindowDesign {
  expect(layout(d).leaves.length).toBe(1);
  return d;
}
