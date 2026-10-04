// Phase 2-3 canvas behaviour (card T40): sliding, doors, opening symbols
// from inside / outside, shaped frames, four resize handles, glass tint,
// apply(), touch gestures. Phase 1 behaviour stays in
// design-canvas.component.spec.ts.
import 'zone.js/testing';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import type Konva from 'konva';
import {
  LeafNode,
  WindowDesign,
  addDoorSideLight,
  findNode,
  isSplit,
  makeDoor,
  serialize,
  setFrameShape,
  setGlazing,
  setLeafSpec,
  setSlidePanel,
  setSlidePanelCount,
  toPayload,
} from '../design-model';
import {
  singleFixed,
  slidingThreeTrackMesh,
  slidingTwoTrack,
} from '../design-model/testing/fixtures';
import { ViewTransform, pxFromMm } from './canvas-view';
import { DesignCanvasComponent } from './design-canvas.component';

describe('DesignCanvasComponent — Phase 2-3', () => {
  let fixture: ComponentFixture<DesignCanvasComponent>;
  let component: DesignCanvasComponent;

  function create(model: WindowDesign, inputs: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(DesignCanvasComponent);
    component = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    el.style.display = 'block';
    el.style.width = '900px';
    el.style.height = '640px';
    fixture.componentRef.setInput('model', model);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
  }

  function host(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector(
      '.dc-canvas-host'
    ) as HTMLElement;
  }

  function find<T extends Konva.Node = Konva.Node>(name: string): T[] {
    const stage = component.getStage();
    return stage ? (stage.getLayers()[0].find(`.${name}`) as T[]) : [];
  }

  function view(): ViewTransform {
    return component.currentView();
  }

  function fire(type: string, x: number, y: number, init: PointerEventInit = {}): void {
    const rect = host().getBoundingClientRect();
    host().dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: rect.left + x,
        clientY: rect.top + y,
        ...init,
      })
    );
  }

  function fireMm(type: string, xMm: number, yMm: number, init: PointerEventInit = {}): void {
    const p = pxFromMm(view(), xMm, yMm);
    fire(type, p.x, p.y, init);
  }

  function dblClickPx(x: number, y: number): void {
    const rect = host().getBoundingClientRect();
    host().dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        clientX: rect.left + x,
        clientY: rect.top + y,
      })
    );
    fixture.detectChanges();
  }

  function ctrl(key: string): void {
    component.onKeydown(new KeyboardEvent('keydown', { key, ctrlKey: true }));
  }

  function door(opts: Parameters<typeof makeDoor>[2]): WindowDesign {
    const base = singleFixed();
    return makeDoor(
      { ...base, frame: { ...base.frame, widthMm: 1000, heightMm: 2100 } },
      'p1',
      opts
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DesignCanvasComponent],
    }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  /* ---------------- sliding ---------------- */

  it('sliding: fixed panels get a FIX marker and no arrow; interlocks are drawn', () => {
    let d = setSlidePanelCount(slidingTwoTrack(), 'p1', 4, 1880, { interlockMm: 40 });
    d = setSlidePanel(d, 'p1', 0, { fixed: true });
    d = setSlidePanel(d, 'p1', 3, { fixed: true });
    create(d);
    expect(find('slide-panel').length).toBe(4);
    expect(find('track-line').length).toBe(2);
    expect(find('slide-fixed').length).toBe(2);
    expect(find('slide-arrow').length).toBe(2);
    expect(find('slide-interlock').length).toBe(3);
    // Mirrored track assignment from the model: outer panels on track 0.
    expect(find('slide-panel').map((p) => p.getAttr('track'))).toEqual([0, 1, 1, 0]);
  });

  it('sliding: clicking a panel selects it; double-click types its width (undoable)', () => {
    create(slidingThreeTrackMesh());
    const before = serialize(component.design);
    // Panel 3 of 3 (each 760 wide in a 2280 daylight starting at x = 60).
    fireMm('pointerdown', 60 + 760 * 2 + 300, 700);
    fireMm('pointerup', 60 + 760 * 2 + 300, 700);
    expect(component.selection).toEqual({ type: 'pane', paneId: 'p1', panelIndex: 2 });
    expect(find('panel-highlight').length).toBe(1);

    const p = pxFromMm(view(), 60 + 300, 700); // panel 1
    dblClickPx(p.x, p.y);
    expect(component.edit?.kind).toBe('panel-width');
    expect(component.edit?.value).toBe('760');
    component.edit!.value = '900';
    component.commitEdit();
    const leaf = component.design.root as LeafNode;
    expect(leaf.slide!.panels.map((x) => x.widthMm)).toEqual([900, 620, 760]);
    expect(() => toPayload(component.design)).not.toThrow();

    component.undo();
    expect(serialize(component.design)).toBe(before);
  });

  /* ---------------- doors ---------------- */

  it('door: draws the swing arc, lever and threshold; Out is solid, In is dashed (from outside)', () => {
    create(door({ leaves: 1, openingSide: 'Left', swing: 'Out', threshold: 'Low' }));
    const arc = find('door-swing')[0];
    expect(arc.getAttr('hingeSide')).toBe('left');
    expect(arc.getAttr('dashed')).toBeFalse();
    expect(find('door-lever').length).toBe(1);
    expect(find('handle-glyph')[0].getAttr('edge')).toBe('right');
    expect(find('hinge-mark').length).toBe(3);
    expect(find('door-threshold')[0].getAttr('thresholdType')).toBe('Low');

    fixture.destroy();
    create(door({ leaves: 1, openingSide: 'Left', swing: 'In', threshold: 'None' }));
    expect(find('door-swing')[0].getAttr('dashed')).toBeTrue();
    expect(find('door-threshold')[0].getAttr('thresholdType')).toBe('None');
  });

  it('door: a double door draws one swing arc per leaf; side lights are plain panes', () => {
    const d = addDoorSideLight(
      door({ leaves: 2, swing: 'In', threshold: 'Standard' }),
      'left',
      300
    );
    create(d);
    const arcs = find('door-swing');
    expect(arcs.map((a) => a.getAttr('hingeSide')).sort()).toEqual(['left', 'right']);
    expect(find('glass-pane').length).toBe(3);
    expect(() => toPayload(component.design)).not.toThrow();
  });

  /* ---------------- opening symbols, inside / outside ---------------- */

  it('tilt & turn draws a solid turn chevron and a dashed tilt chevron', () => {
    create(
      setLeafSpec(singleFixed(), 'p1', {
        casementType: 'Openable',
        opening: { direction: 'Tilt & Turn Left', handleId: null, hingesType: null },
      })
    );
    const lines = find('opening-symbol');
    expect(lines.length).toBe(4);
    expect(lines.filter((l) => l.getAttr('dashed')).length).toBe(2);
    expect(lines.filter((l) => l.getAttr('hingeSide') === 'left').length).toBe(2);
    expect(find('handle-glyph')[0].getAttr('edge')).toBe('right');
  });

  it('viewed from inside the elevation is mirrored and the model is untouched', () => {
    const d = setLeafSpec(singleFixed(), 'p1', {
      casementType: 'Openable',
      opening: { direction: 'Left', handleId: null, hingesType: null },
    });
    create(d, { viewFrom: 'inside' });
    expect(find('view-badge').length).toBe(1);
    expect(find('opening-symbol')[0].getAttr('hingeSide')).toBe('right');
    expect(find('handle-glyph')[0].getAttr('edge')).toBe('left');
    expect(component.design).toBe(d);

    // A door that opens out is solid from outside, dashed from inside.
    fixture.destroy();
    create(door({ leaves: 1, openingSide: 'Left', swing: 'Out' }), { viewFrom: 'inside' });
    expect(find('door-swing')[0].getAttr('dashed')).toBeTrue();
    expect(find('door-swing')[0].getAttr('hingeSide')).toBe('right');
  });

  it('inside view: a click still selects the pane under the pointer', () => {
    let d = singleFixed();
    create(d, { viewFrom: 'inside' });
    component.selectPane('p1');
    component.splitSelected('x');
    d = component.design;
    const split = d.root;
    expect(isSplit(split)).toBeTrue();
    const [leftId] = isSplit(split) ? split.children.map((c) => c.id) : [''];
    // Model-left pane (x = 300 mm) is on the screen-right half when mirrored.
    const p = pxFromMm(view(), 300, 600);
    const frameMid = pxFromMm(view(), 750, 600);
    expect(p.x).toBeGreaterThan(frameMid.x);
    fire('pointerdown', p.x, p.y);
    fire('pointerup', p.x, p.y);
    expect(component.selection).toEqual({ type: 'pane', paneId: leftId });
  });

  it('sliding arrows and the fly mesh mirror with the view', () => {
    create(slidingThreeTrackMesh());
    const outside = find('slide-arrow').map((a) => a.getAttr('pointsRight'));
    const meshOutside = find('fly-mesh')[0].getAttr('xPx');
    fixture.destroy();
    create(slidingThreeTrackMesh(), { viewFrom: 'inside' });
    const inside = find('slide-arrow').map((a) => a.getAttr('pointsRight'));
    expect(inside).toEqual(outside.map((v: boolean) => !v));
    expect(find('fly-mesh')[0].getAttr('xPx')).toBeGreaterThan(meshOutside);
  });

  /* ---------------- shaped frames ---------------- */

  it('arch top: outline, clipped pane, rise and radius dimensions', () => {
    const base = singleFixed();
    const d = setFrameShape(
      { ...base, frame: { ...base.frame, widthMm: 2000, heightMm: 1500 } },
      { kind: 'arch-top', riseMm: 500 }
    );
    create(d);
    expect(find('frame-back')[0].getAttr('shapeKind')).toBe('arch-top');
    expect(find('pane-clip').length).toBe(1);
    expect(find<Konva.Text>('dim-rise')[0].text()).toBe('rise 500');
    expect(find<Konva.Text>('dim-radius')[0].text()).toBe('R 1250 mm');
    expect(find<Konva.Text>('dim-width')[0].text()).toBe('2000 mm');
    expect(() => toPayload(component.design)).not.toThrow();
  });

  it('trapezoid shows both jamb heights; typing one is undoable', () => {
    const d = setFrameShape(singleFixed(), {
      kind: 'trapezoid',
      leftHeightMm: 1200,
      rightHeightMm: 800,
    });
    create(d);
    expect(find<Konva.Text>('dim-height')[0].text()).toBe('1200 mm');
    expect(find<Konva.Text>('dim-height-right')[0].text()).toBe('800 mm');

    // Double-click right of the frame: the right jamb height.
    const p = pxFromMm(view(), 1500, 900);
    dblClickPx(p.x + 14, p.y);
    expect(component.edit?.kind).toBe('shape-right-h');
    component.edit!.value = '1000';
    component.commitEdit();
    expect(component.design.frame.shape).toEqual({
      kind: 'trapezoid',
      leftHeightMm: 1200,
      rightHeightMm: 1000,
    });
    component.undo();
    expect(component.design).toBe(d);
  });

  it('circle and triangle render; a split that leaves a pane without glass is refused', () => {
    create(setFrameShape(singleFixed(), { kind: 'triangle', apex: 'left' }));
    expect(find('frame-back')[0].getAttr('shapeKind')).toBe('triangle');
    const before = component.design;
    // Apex on the left: a vertical split far right leaves a sliver pane
    // wholly beyond the slope → refused, model unchanged.
    component.trySplit('p1', 'x', 1320);
    expect(component.design).toBe(before);

    fixture.destroy();
    const base = singleFixed();
    create(
      setFrameShape(
        { ...base, frame: { ...base.frame, widthMm: 1200, heightMm: 1200 } },
        { kind: 'circle' }
      )
    );
    expect(find('frame-back')[0].getAttr('shapeKind')).toBe('circle');
    expect(find<Konva.Text>('dim-width')[0].text()).toBe('Ø 1200 mm');
  });

  /* ---------------- four resize handles ---------------- */

  it('draws four corner handles; dragging the top-left one resizes and undoes', () => {
    create(singleFixed());
    const handles = find('frame-handle');
    expect(handles.map((h) => h.getAttr('corner')).sort()).toEqual(['ne', 'nw', 'se', 'sw']);

    const ppm = view().pxPerMm;
    const start = pxFromMm(view(), 0, 0);
    const se0 = pxFromMm(view(), 1500, 1200);
    fire('pointerdown', start.x, start.y);
    // 200 mm right and 100 mm down: the frame shrinks from the top-left.
    fire('pointermove', start.x + 200 * ppm, start.y + 100 * ppm);
    expect(find('drag-readout').length).toBe(1);
    // The opposite corner stays put on screen while dragging.
    const seDuring = pxFromMm(view(), 1300, 1100);
    expect(seDuring.x).toBeCloseTo(se0.x, 3);
    expect(seDuring.y).toBeCloseTo(se0.y, 3);
    fire('pointerup', start.x + 200 * ppm, start.y + 100 * ppm);

    expect(component.design.frame.widthMm).toBe(1300);
    expect(component.design.frame.heightMm).toBe(1100);
    component.undo();
    expect(component.design.frame.widthMm).toBe(1500);
    expect(component.design.frame.heightMm).toBe(1200);
  });

  it('each corner handle resizes from its own corner', () => {
    const cases: [number, number, number, number, number, number][] = [
      // handle x, y (mm) → drag dx, dy (mm) → expected w, h
      [1500, 0, 100, 100, 1600, 1100], // ne
      [0, 1200, 100, 100, 1400, 1300], // sw
      [1500, 1200, -100, -200, 1400, 1000], // se
    ];
    for (const [hx, hy, dx, dy, w, h] of cases) {
      create(singleFixed());
      const ppm = view().pxPerMm;
      const s = pxFromMm(view(), hx, hy);
      fire('pointerdown', s.x, s.y);
      fire('pointermove', s.x + dx * ppm, s.y + dy * ppm);
      fire('pointerup', s.x + dx * ppm, s.y + dy * ppm);
      expect(component.design.frame.widthMm).toBe(w);
      expect(component.design.frame.heightMm).toBe(h);
      fixture.destroy();
    }
  });

  /* ---------------- glass tint ---------------- */

  it('glass is tinted per glass id from the host map; unknown ids stay clear', () => {
    const tints = { '2': '#c9a27a' };
    create(setGlazing(singleFixed(), { glassId: 2 }), { glassTints: tints });
    expect(find('glass-pane')[0].getAttr('glassTint')).toBe('#c9a27a');
    fixture.destroy();
    create(setGlazing(singleFixed(), { glassId: 9 }), { glassTints: tints });
    expect(find('glass-pane')[0].getAttr('glassTint')).toBe('');
  });

  /* ---------------- apply(): host edits on the undo stack ---------------- */

  it('apply(next) pushes a host edit onto the same undo stack and emits it', () => {
    const start = singleFixed();
    create(start);
    const emitted: WindowDesign[] = [];
    component.modelChange.subscribe((m) => emitted.push(m));

    component.selectPane('p1');
    component.splitSelected('x'); // canvas edit
    const afterSplit = component.design;
    const leafId = isSplit(afterSplit.root) ? afterSplit.root.children[0].id : '';
    const hostEdit = setLeafSpec(afterSplit, leafId, {
      casementType: 'Openable',
      opening: { direction: 'Right', handleId: null, hingesType: null },
    });
    component.apply(hostEdit); // side-panel edit

    expect(component.design).toBe(hostEdit);
    expect(emitted.length).toBe(2);
    expect(find('opening-symbol').length).toBe(2);
    // Selection survives because the pane still exists.
    expect(component.selection).toEqual({ type: 'pane', paneId: leafId });

    ctrl('z');
    expect(component.design).toBe(afterSplit);
    ctrl('z');
    expect(component.design).toBe(start);
    ctrl('y');
    ctrl('y');
    expect(component.design).toBe(hostEdit);
    expect((findNode(component.design.root, leafId) as LeafNode).casementType).toBe('Openable');
  });

  /* ---------------- touch gestures (emulated touch pointers) ---------------- */

  it('pinch with two touch pointers zooms about the fingers; the model is unchanged', () => {
    create(singleFixed());
    const before = component.design;
    const t = (id: number): PointerEventInit => ({ pointerId: id, pointerType: 'touch' });
    fire('pointerdown', 400, 300, t(11));
    fire('pointerdown', 500, 300, t(12));
    fire('pointermove', 350, 300, t(11));
    fire('pointermove', 550, 300, t(12));
    expect(component.zoom).toBeCloseTo(2, 5);
    fire('pointerup', 350, 300, t(11));
    fire('pointerup', 550, 300, t(12));
    expect(component.design).toBe(before);
    expect(component.canUndo).toBeFalse();
  });

  it('two fingers moving together pan the view without zooming', () => {
    create(singleFixed());
    const t = (id: number): PointerEventInit => ({ pointerId: id, pointerType: 'touch' });
    const origin0 = pxFromMm(view(), 0, 0);
    fire('pointerdown', 400, 300, t(21));
    fire('pointerdown', 500, 300, t(22));
    fire('pointermove', 440, 330, t(21));
    fire('pointermove', 540, 330, t(22));
    fire('pointerup', 440, 330, t(21));
    fire('pointerup', 540, 330, t(22));
    const origin1 = pxFromMm(view(), 0, 0);
    expect(component.zoom).toBeCloseTo(1, 5);
    expect(origin1.x - origin0.x).toBeCloseTo(40, 3);
    expect(origin1.y - origin0.y).toBeCloseTo(30, 3);
    // A later single touch is a normal tap again (selects the pane).
    const p = pxFromMm(view(), 700, 600);
    fire('pointerdown', p.x, p.y, t(23));
    fire('pointerup', p.x, p.y, t(23));
    expect(component.selection).toEqual({ type: 'pane', paneId: 'p1' });
  });

  it('a touch tap near a thin divider still grabs it (wider touch band)', () => {
    create(singleFixed());
    component.selectPane('p1');
    component.splitSelected('x');
    const split = component.design.root;
    const id = split.id;
    // 20 px off the mullion edge: outside the 12 px mouse band, inside 24 px touch.
    const centre = pxFromMm(view(), 750, 600);
    const off = centre.x + 30 * view().pxPerMm + 20;
    fire('pointerdown', off, centre.y, { pointerId: 31, pointerType: 'touch' });
    fire('pointerup', off, centre.y, { pointerId: 31, pointerType: 'touch' });
    expect(component.selection).toEqual({ type: 'divider', splitId: id, index: 0 });
  });
});
