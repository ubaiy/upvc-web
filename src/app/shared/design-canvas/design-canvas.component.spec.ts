// The project's karma entry does not load zone.js/testing itself (see the
// design-model specs); load it here so Angular's global beforeEach works.
import 'zone.js/testing';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SplitNode,
  WindowDesign,
  findNode,
  isSplit,
  layout,
  serialize,
  walkLeaves,
} from '../design-model';
import {
  mixedExampleB,
  singleFixed,
  slidingThreeTrackMesh,
  twoSashOpenable,
} from '../design-model/testing/fixtures';
import { DesignCanvasComponent } from './design-canvas.component';
import { CanvasSelection, ViewTransform, pxFromMm } from './canvas-view';
import type Konva from 'konva';

describe('DesignCanvasComponent', () => {
  let fixture: ComponentFixture<DesignCanvasComponent>;
  let component: DesignCanvasComponent;

  function create(model: WindowDesign, readOnly = false): void {
    fixture = TestBed.createComponent(DesignCanvasComponent);
    component = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    el.style.display = 'block';
    el.style.width = '900px';
    el.style.height = '640px';
    fixture.componentRef.setInput('model', model);
    fixture.componentRef.setInput('readOnly', readOnly);
    fixture.detectChanges();
  }

  function host(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector(
      '.dc-canvas-host'
    ) as HTMLElement;
  }

  function layerFind(name: string): Konva.Node[] {
    const stage = component.getStage();
    if (!stage) return [];
    return stage.getLayers()[0].find(`.${name}`);
  }

  /** Canvas-host px for a model mm point (via the component's live view). */
  function pxOf(xMm: number, yMm: number): { x: number; y: number } {
    const view = (
      component as unknown as { currentView(): ViewTransform }
    ).currentView();
    return pxFromMm(view, xMm, yMm);
  }

  function pointerEvent(
    type: string,
    target: Element,
    x: number,
    y: number,
    init?: PointerEventInit
  ): void {
    const rect = host().getBoundingClientRect();
    target.dispatchEvent(
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

  function pointerAtMm(type: string, xMm: number, yMm: number): void {
    const p = pxOf(xMm, yMm);
    pointerEvent(type, host(), p.x, p.y);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DesignCanvasComponent],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  /* ------------------------------------------------------------------ */
  /* Render = f(model)                                                   */
  /* ------------------------------------------------------------------ */

  it('renders a single fixed pane with overall dimension labels', () => {
    create(singleFixed());
    expect(layerFind('glass-pane').length).toBe(1);
    expect(layerFind('divider-bar').length).toBe(0);
    const dimW = layerFind('dim-width')[0] as Konva.Text;
    const dimH = layerFind('dim-height')[0] as Konva.Text;
    expect(dimW.text()).toBe('1500 mm');
    expect(dimH.text()).toBe('1200 mm');
  });

  it('renders the mixed mullion + transom design; pane mm labels sum to the daylight (acceptance 3)', () => {
    create(mixedExampleB());
    expect(layerFind('glass-pane').length).toBe(3);
    expect(layerFind('divider-bar').length).toBe(2);

    const labels = layerFind('pane-label') as Konva.Text[];
    expect(labels.length).toBe(3);
    const byPane = new Map<string, { wMm: number; hMm: number }>();
    for (const l of labels) {
      byPane.set(l.getAttr('paneId'), {
        wMm: l.getAttr('wMm'),
        hMm: l.getAttr('hMm'),
      });
    }
    // Horizontal sum law: left pane + mullion face + right column = daylight.
    const left = byPane.get('p2') as { wMm: number };
    const topRight = byPane.get('p4') as { wMm: number; hMm: number };
    const bottomRight = byPane.get('p5') as { wMm: number; hMm: number };
    expect(left.wMm + 60 + topRight.wMm).toBe(2400 - 2 * 60);
    // Vertical sum law inside the right column.
    expect(topRight.hMm + 60 + bottomRight.hMm).toBe(1380 - 2 * 60);
    // Openable top-right pane draws its opening symbol + hardware.
    expect(layerFind('opening-symbol').length).toBeGreaterThan(0);
    expect(layerFind('hinge-mark').length).toBeGreaterThan(0);
    expect(layerFind('handle-glyph').length).toBe(1);
  });

  it('renders a 3-track sliding leaf: panels, tracks, arrows and fly mesh', () => {
    create(slidingThreeTrackMesh());
    expect(layerFind('slide-panel').length).toBe(3);
    expect(layerFind('track-line').length).toBe(3);
    expect(layerFind('slide-arrow').length).toBe(3);
    expect(layerFind('fly-mesh').length).toBe(1);
    const panelLabels = layerFind('slide-panel-label') as Konva.Text[];
    expect(panelLabels.map((t) => t.text())).toEqual(['760', '760', '760']);
  });

  it('renders a 2-sash casement with sash bands and two opening symbols', () => {
    create(twoSashOpenable());
    expect(layerFind('glass-pane').length).toBe(2);
    expect(layerFind('sash-band').length).toBeGreaterThan(0);
    // Two openable sashes → two egress chevrons (2 lines each).
    expect(layerFind('opening-symbol').length).toBe(4);
    expect(layerFind('divider-bar').length).toBe(0); // sash split, no mullion
  });

  /* ------------------------------------------------------------------ */
  /* Selection                                                           */
  /* ------------------------------------------------------------------ */

  it('click selects a pane, highlights it and emits selectionChange', () => {
    create(mixedExampleB());
    const emitted: (CanvasSelection | null)[] = [];
    component.selectionChange.subscribe((s) => emitted.push(s));

    pointerAtMm('pointerdown', 400, 700); // inside left pane p2
    pointerAtMm('pointerup', 400, 700);

    expect(component.selection).toEqual({ type: 'pane', paneId: 'p2' });
    expect(emitted.pop()).toEqual({ type: 'pane', paneId: 'p2' });
    expect(layerFind('selection-highlight').length).toBe(1);
  });

  /* ------------------------------------------------------------------ */
  /* Palette drag-to-split                                               */
  /* ------------------------------------------------------------------ */

  it('dragging the vertical-divider tool onto a pane splits it at the drop point', () => {
    create(singleFixed());
    const changes: WindowDesign[] = [];
    component.modelChange.subscribe((m) => changes.push(m));

    const btn = (fixture.nativeElement as HTMLElement).querySelector(
      'button[aria-label^="Add vertical divider"]'
    ) as HTMLElement;
    const btnRect = btn.getBoundingClientRect();
    btn.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 2,
        clientX: btnRect.left + 5,
        clientY: btnRect.top + 5,
      })
    );
    // Drop point: 500 mm into the daylight (absolute mm 560, mid height).
    const drop = pxOf(560, 600);
    pointerEvent('pointermove', btn, drop.x, drop.y, { pointerId: 2 });
    expect(layerFind('ghost-line').length).toBe(1); // live ghost follows
    pointerEvent('pointerup', btn, drop.x, drop.y, { pointerId: 2 });

    const root = component.design.root;
    expect(isSplit(root)).toBeTrue();
    const split = root as SplitNode;
    expect(split.axis).toBe('x');
    expect(split.children.length).toBe(2);
    expect(split.positionsMm[0]).toBeCloseTo(500, 0);
    expect(changes.length).toBe(1);
  });

  /* ------------------------------------------------------------------ */
  /* Divider drag with snapping                                          */
  /* ------------------------------------------------------------------ */

  it('dragging a mullion moves it with 50 mm grid snapping and commits once', () => {
    create(mixedExampleB());
    const changes: WindowDesign[] = [];
    component.modelChange.subscribe((m) => changes.push(m));

    // Mullion centreline at absolute 960 mm (daylight 60 + position 900).
    pointerAtMm('pointerdown', 960, 700);
    // Drag to raw 997 relative (abs 1057): grid-snaps to 1000.
    pointerAtMm('pointermove', 1057, 700);
    expect(layerFind('drag-readout').length).toBe(1); // live mm readout
    pointerAtMm('pointerup', 1057, 700);

    const split = findNode(component.design.root, 'p1') as SplitNode;
    expect(split.positionsMm[0]).toBe(1000);
    expect(changes.length).toBe(1);
  });

  /* ------------------------------------------------------------------ */
  /* Typed exact mm (locks the divider)                                  */
  /* ------------------------------------------------------------------ */

  it('double-click a pane, type exact mm: adjacent divider moves and locks', () => {
    create(mixedExampleB());
    const p = pxOf(400, 700); // left pane p2
    host().dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        clientX: host().getBoundingClientRect().left + p.x,
        clientY: host().getBoundingClientRect().top + p.y,
      })
    );
    fixture.detectChanges();
    expect(component.edit?.kind).toBe('pane-size');
    expect(component.edit?.value).toBe('870');

    component.edit!.value = '900';
    component.commitEdit();

    const split = findNode(component.design.root, 'p1') as SplitNode;
    // 900 mm pane daylight → centreline at 900 + face/2 = 930, locked.
    expect(split.positionsMm[0]).toBe(930);
    expect(split.lockedMm[0]).toBeTrue();
  });

  it('typing the frame width resizes the frame', () => {
    create(singleFixed());
    component.onFrameSizeInput('w', '2000');
    expect(component.design.frame.widthMm).toBe(2000);
    const dimW = layerFind('dim-width')[0] as Konva.Text;
    expect(dimW.text()).toBe('2000 mm');
  });

  /* ------------------------------------------------------------------ */
  /* Undo / redo (acceptance 1, UI level)                                */
  /* ------------------------------------------------------------------ */

  it('undo×n then redo×n restores byte-identical models', () => {
    create(singleFixed());
    const s0 = serialize(component.design);

    component.selectPane('p1');
    component.splitSelected('x');
    component.onFrameSizeInput('w', '1800');
    const s2 = serialize(component.design);
    expect(s2).not.toBe(s0);

    component.onKeydown(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true })
    );
    component.onKeydown(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true })
    );
    expect(serialize(component.design)).toBe(s0);

    component.onKeydown(
      new KeyboardEvent('keydown', { key: 'y', ctrlKey: true })
    );
    component.onKeydown(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true })
    );
    expect(serialize(component.design)).toBe(s2);
  });

  /* ------------------------------------------------------------------ */
  /* Zoom / pan never touch the model (acceptance 5)                     */
  /* ------------------------------------------------------------------ */

  it('wheel zoom, button zoom, pan and fit never change the model', () => {
    create(mixedExampleB());
    const before = serialize(component.design);

    const rect = host().getBoundingClientRect();
    host().dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -120,
        clientX: rect.left + 300,
        clientY: rect.top + 200,
      })
    );
    expect(component.zoomPercent).toBeGreaterThan(100);

    component.zoomIn();
    component.zoomOut();

    // Space-drag pan.
    component.onKeydown(new KeyboardEvent('keydown', { key: ' ' }));
    pointerEvent('pointerdown', host(), 200, 200);
    pointerEvent('pointermove', host(), 260, 240);
    pointerEvent('pointerup', host(), 260, 240);
    component.onKeyup(new KeyboardEvent('keyup', { key: ' ' }));
    expect(component.panX).not.toBe(0);

    component.fitToScreen();
    expect(component.zoomPercent).toBe(100);
    expect(serialize(component.design)).toBe(before);
  });

  /* ------------------------------------------------------------------ */
  /* Keyboard-only path (acceptance 6)                                   */
  /* ------------------------------------------------------------------ */

  it('keyboard only: Tab selects, V splits, arrows nudge the divider 1 mm / 10 mm', () => {
    create(singleFixed());

    component.onKeydown(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(component.selection).toEqual({ type: 'pane', paneId: 'p1' });

    component.onKeydown(new KeyboardEvent('keydown', { key: 'V' }));
    const split = findNode(component.design.root, 'p1') as SplitNode;
    expect(isSplit(split)).toBeTrue();
    const mid = split.positionsMm[0];

    // Select the new divider by clicking it, then nudge with arrows.
    pointerAtMm('pointerdown', 60 + mid, 600);
    pointerAtMm('pointerup', 60 + mid, 600);
    expect(component.selection?.type).toBe('divider');

    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    let pos = (findNode(component.design.root, 'p1') as SplitNode)
      .positionsMm[0];
    expect(pos).toBeCloseTo(mid + 1, 6);

    component.onKeydown(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true })
    );
    pos = (findNode(component.design.root, 'p1') as SplitNode).positionsMm[0];
    expect(pos).toBeCloseTo(mid + 1 - 10, 6);

    // Tab cycles across both panes.
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(component.selection?.type).toBe('pane');
    const leaves = walkLeaves(component.design.root);
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(
      leaves.some(
        (l) =>
          component.selection?.type === 'pane' &&
          component.selection.paneId === l.id
      )
    ).toBeTrue();
  });

  it('Equalize (E) evens the panes of the selected split', () => {
    create(mixedExampleB());
    component.selectPane('p2');
    component.onKeydown(new KeyboardEvent('keydown', { key: 'e' }));
    const split = findNode(component.design.root, 'p1') as SplitNode;
    // Equal panes of the 2280 daylight with a 60 face → centre at 1140.
    expect(split.positionsMm[0]).toBeCloseTo(1140, 6);
  });

  it('Delete removes the selected divider and merges the panes', () => {
    create(mixedExampleB());
    pointerAtMm('pointerdown', 960, 700); // select the mullion
    pointerAtMm('pointerup', 960, 700);
    expect(component.selection?.type).toBe('divider');
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Delete' }));
    // Merging keeps the left pane's spec: the right column (and its transom)
    // folds into one pane — no divider bars remain.
    expect(layerFind('divider-bar').length).toBe(0);
    expect(layerFind('glass-pane').length).toBe(1);
  });

  /* ------------------------------------------------------------------ */
  /* Read-only                                                           */
  /* ------------------------------------------------------------------ */

  it('read-only: selection works but nothing mutates and the palette is hidden', () => {
    create(mixedExampleB(), true);
    const before = serialize(component.design);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.dc-palette')
    ).toBeNull();

    // Divider drag attempt.
    pointerAtMm('pointerdown', 960, 700);
    pointerAtMm('pointermove', 1100, 700);
    pointerAtMm('pointerup', 1100, 700);
    expect(serialize(component.design)).toBe(before);
    expect(component.selection?.type).toBe('divider'); // selectable

    // Keyboard mutations are ignored.
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Delete' }));
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(serialize(component.design)).toBe(before);
  });

  /* ------------------------------------------------------------------ */
  /* Model input swap                                                    */
  /* ------------------------------------------------------------------ */

  it('swapping the model input resets history and selection', () => {
    create(singleFixed());
    component.selectPane('p1');
    component.splitSelected('x');
    expect(component.canUndo).toBeTrue();

    fixture.componentRef.setInput('model', slidingThreeTrackMesh());
    fixture.detectChanges();
    expect(component.canUndo).toBeFalse();
    expect(component.selection).toBeNull();
    expect(layerFind('slide-panel').length).toBe(3);
  });
});
