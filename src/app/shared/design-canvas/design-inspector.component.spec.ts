// Inspector panel + the edit helpers it is built on (card T40).
import 'zone.js/testing';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  LeafNode,
  SplitNode,
  WindowDesign,
  checkInvariants,
  isSplit,
  setFrameShape,
  toPayload,
} from '../design-model';
import {
  singleFixed,
  slidingTwoTrack,
} from '../design-model/testing/fixtures';
import {
  defaultShape,
  paneKindOf,
  setArchRise,
  setPaneKind,
  setShapeKind,
  setTrapezoidHeights,
  shapeRemovesAPane,
} from './design-edit-ops';
import { DesignInspectorComponent } from './design-inspector.component';

describe('design-edit-ops', () => {
  it('setShapeKind gives every shape valid starting parameters', () => {
    for (const kind of ['arch-top', 'circle', 'triangle', 'trapezoid', 'rect'] as const) {
      const d = setShapeKind(singleFixed(), kind);
      expect(d.frame.shape.kind).toBe(kind);
      expect(checkInvariants(d)).toEqual([]);
      expect(() => toPayload(d)).not.toThrow();
    }
    expect(defaultShape('arch-top', 2000, 1500)).toEqual({ kind: 'arch-top', riseMm: 500 });
  });

  it('setArchRise clamps to min(height, width / 2)', () => {
    const d = setShapeKind(singleFixed(), 'arch-top'); // 1500 × 1200
    expect(setArchRise(d, 5000).frame.shape).toEqual({ kind: 'arch-top', riseMm: 750 });
    expect(setArchRise(d, 240).frame.shape).toEqual({ kind: 'arch-top', riseMm: 240 });
  });

  it('setTrapezoidHeights moves the frame height to the taller jamb', () => {
    const d = setFrameShape(singleFixed(), {
      kind: 'trapezoid',
      leftHeightMm: 1200,
      rightHeightMm: 800,
    });
    const taller = setTrapezoidHeights(d, 1200, 1600);
    expect(taller.frame.heightMm).toBe(1600);
    expect(taller.frame.shape).toEqual({
      kind: 'trapezoid',
      leftHeightMm: 1200,
      rightHeightMm: 1600,
    });
    expect(checkInvariants(taller)).toEqual([]);
    expect(() => setTrapezoidHeights(d, 1000, 1000)).toThrow();
  });

  it('setPaneKind switches fixed ↔ openable ↔ sliding with a valid slide', () => {
    let d = setPaneKind(singleFixed(), 'p1', 'sliding');
    const leaf = d.root as LeafNode;
    expect(paneKindOf(leaf)).toBe('sliding');
    // Two panels tiling the 1380 mm daylight.
    expect(leaf.slide!.panels.map((p) => p.widthMm)).toEqual([690, 690]);
    expect(checkInvariants(d)).toEqual([]);
    d = setPaneKind(d, 'p1', 'openable');
    expect((d.root as LeafNode).opening?.direction).toBe('Left');
    expect((d.root as LeafNode).slide).toBeUndefined();
    d = setPaneKind(d, 'p1', 'fixed');
    expect(paneKindOf(d.root as LeafNode)).toBe('fixed');
  });

  it('shapeRemovesAPane is false for rect frames and whole shaped panes', () => {
    expect(shapeRemovesAPane(singleFixed())).toBeFalse();
    expect(shapeRemovesAPane(setShapeKind(singleFixed(), 'triangle'))).toBeFalse();
  });
});

describe('DesignInspectorComponent', () => {
  let fixture: ComponentFixture<DesignInspectorComponent>;
  let component: DesignInspectorComponent;
  let emitted: WindowDesign[];

  function create(design: WindowDesign, paneId: string | null = null): void {
    fixture = TestBed.createComponent(DesignInspectorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('design', design);
    fixture.componentRef.setInput(
      'selection',
      paneId ? { type: 'pane', paneId } : null
    );
    emitted = [];
    component.designChange.subscribe((d) => emitted.push(d));
    fixture.detectChanges();
  }

  /** Feed the emitted design back in, as a host does after canvas.apply(). */
  function latest(): WindowDesign {
    const d = emitted[emitted.length - 1];
    fixture.componentRef.setInput('design', d);
    fixture.detectChanges();
    return d;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DesignInspectorComponent],
    }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  it('never mutates its input and emits a new valid design per edit', () => {
    const start = singleFixed();
    const frozen = JSON.stringify(start);
    create(start, 'p1');
    component.onShapeKind('arch-top');
    component.onGlass('2');
    expect(emitted.length).toBe(2);
    expect(JSON.stringify(start)).toBe(frozen);
    expect(emitted[0].frame.shape.kind).toBe('arch-top');
    expect(emitted.every((d) => checkInvariants(d).length === 0)).toBeTrue();
  });

  it('sliding: tracks, panel count, mesh and per-panel edits', () => {
    create(slidingTwoTrack(), 'p1');
    component.glassOptions = [{ id: 1, label: 'Clear' }];
    component.onTracks('3 Track');
    let d = latest();
    expect((d.root as LeafNode).slide!.tracks).toBe('3 Track');
    expect((d.root as LeafNode).slide!.panels.length).toBe(3);
    expect(component.panelCounts).toEqual([3, 4, 5, 6]);

    component.onPanelCount('4');
    component.onMesh(true);
    d = latest();
    component.onMeshPosition('Right');
    d = latest();
    component.onPanelFixed(0, true);
    d = latest();
    component.onPanelDirection(1, 'Right');
    d = latest();
    const slide = (d.root as LeafNode).slide!;
    expect(slide.mesh).toBeTrue();
    expect(slide.meshPosition).toBe('Right');
    expect(slide.panels[0].fixed).toBeTrue();
    expect(slide.panels[1].direction).toBe('Right');
    expect(() => toPayload(d)).not.toThrow();
  });

  it('refuses an edit that breaks a rule and says why', () => {
    create(slidingTwoTrack(), 'p1');
    // Fly mesh is not offered on a 2 Track.
    expect(component.meshAllowed).toBeFalse();
    component.onMesh(true);
    expect(emitted.length).toBe(0);
    expect(component.problem).toContain('mesh');
    // Every panel fixed leaves nothing to slide.
    component.onPanelFixed(0, true);
    latest();
    component.onPanelFixed(1, true);
    expect(emitted.length).toBe(1);
    expect(component.problem).not.toBe('');
  });

  it('door: make a double door, set swing and threshold, add lights, back to a window', () => {
    const base = singleFixed();
    create({ ...base, frame: { ...base.frame, widthMm: 1800, heightMm: 2100 } }, 'p1');
    component.onMakeDoor(2);
    let d = latest();
    expect(d.productType).toBe('Door');
    expect(d.door?.leaves).toBe(2);
    component.onDoorSwing('Out');
    d = latest();
    component.onThreshold('Low');
    d = latest();
    component.onTopLight();
    d = latest();
    component.onSideLight('left');
    d = latest();
    expect(d.door).toEqual(
      jasmine.objectContaining({ swing: 'Out', threshold: 'Low', leaves: 2 })
    );
    expect(isSplit(d.root)).toBeTrue();
    expect(checkInvariants(d)).toEqual([]);
    expect(toPayload(d).parts.every((p: { product_type: string }) => p.product_type === 'Door')).toBeTrue();

    component.onRemoveDoor();
    d = latest();
    expect(d.productType).toBe('Window');
    expect(d.door).toBeUndefined();
    expect(checkInvariants(d)).toEqual([]);
  });

  it('opening direction and pane type follow the selected pane', () => {
    create(singleFixed(), 'p1');
    expect(component.paneKind).toBe('fixed');
    component.onPaneKind('openable');
    latest();
    component.onDirection('Tilt & Turn Right');
    const d = latest();
    expect((d.root as LeafNode).opening?.direction).toBe('Tilt & Turn Right');
    expect(component.paneKind).toBe('openable');
  });

  it('read-only: nothing is emitted', () => {
    create(singleFixed(), 'p1');
    fixture.componentRef.setInput('readOnly', true);
    component.onShapeKind('circle');
    component.onPaneKind('sliding');
    expect(emitted.length).toBe(0);
  });

  it('a single door keeps its hinge side in step with the leaf', () => {
    const base = singleFixed();
    create({ ...base, frame: { ...base.frame, widthMm: 950, heightMm: 2100 } }, 'p1');
    component.onMakeDoor(1);
    latest();
    component.onDoorSide('Right');
    const d = latest();
    expect(d.door?.openingSide).toBe('Right');
    const leaf = (isSplit(d.root) ? (d.root as SplitNode).children[0] : d.root) as LeafNode;
    expect(leaf.opening?.direction).toBe('Right');
  });
});
