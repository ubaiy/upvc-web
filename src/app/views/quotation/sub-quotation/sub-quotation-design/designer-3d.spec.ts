/**
 * The 2D | 3D switch of the window designer (card T113): what 3D shows,
 * that it follows the document, and that a device without WebGL or a chunk
 * that cannot be fetched leaves the designer on 2D with a reason.
 */
import 'zone.js/testing';

import { Component, Input, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WindowDesign, createDesign } from 'src/app/shared/design-model';
import { Designer3dView, NO_CHUNK_NOTE, NO_WEBGL_NOTE, View3dChunk, View3dInputs } from './designer-3d';

/** Stands in for Design3dComponent: the same inputs, no three.js. */
@Component({ selector: 'app-fake-3d', standalone: true, template: '<i data-fake="3d"></i>' })
class Fake3dComponent {
  static refuses = false;
  @Input() design: WindowDesign | null = null;
  @Input() glassTint: string | null = null;
  @Input() glassTints: Record<string, string> | null = null;
  @Input() frameFaceMm: number | undefined;
  @Input() product = false;
  unavailable = Fake3dComponent.refuses;
}

@Component({ standalone: true, template: '<div class="slot"><ng-container #slot></ng-container></div>' })
class SlotComponent {
  @ViewChild('slot', { read: ViewContainerRef, static: true }) slot!: ViewContainerRef;
}

const chunk = (webgl: boolean): View3dChunk =>
  ({ Design3dComponent: Fake3dComponent, webglAvailable: () => webgl }) as unknown as View3dChunk;

describe('Designer3dView (the 2D | 3D switch of the window designer)', () => {
  let fixture: ComponentFixture<SlotComponent>;
  const design = createDesign();
  const inputs = (d: WindowDesign = design): View3dInputs => ({
    design: d,
    glassTint: '#8fb8e0',
    glassTints: { '7': '#c9a27a' },
    frameFaceMm: 60,
  });
  const shown = (): Fake3dComponent | null => {
    const de = fixture.debugElement.children[0]?.children.find((c) => c.componentInstance instanceof Fake3dComponent);
    return (de?.componentInstance as Fake3dComponent) ?? null;
  };

  beforeEach(() => {
    Fake3dComponent.refuses = false;
    TestBed.configureTestingModule({ imports: [SlotComponent] });
    fixture = TestBed.createComponent(SlotComponent);
    fixture.detectChanges();
  });

  it('starts on 2D with nothing to say', () => {
    const view = new Designer3dView(() => Promise.resolve(chunk(true)));
    expect(view.on).toBeFalse();
    expect(view.loading).toBeFalse();
    expect(view.note).toBe('');
  });

  it('3D shows the current document, in the product look, and follows every change', async () => {
    const view = new Designer3dView(() => Promise.resolve(chunk(true)));
    const opening = view.open(fixture.componentInstance.slot, inputs);
    expect(view.loading).toBeTrue();
    await opening;
    expect(view.loading).toBeFalse();
    expect(view.on).toBeTrue();
    expect(view.note).toBe('');
    const first = shown();
    expect(first?.design).toBe(design);
    expect(first?.product).toBeTrue();
    expect(first?.glassTint).toBe('#8fb8e0');
    expect(first?.glassTints).toEqual({ '7': '#c9a27a' });
    expect(first?.frameFaceMm).toBe(60);

    const edited = createDesign({ frame: { widthMm: 1800, heightMm: 1500 } });
    view.sync(inputs(edited));
    expect(shown()?.design).toBe(edited);
    expect(shown()).withContext('the same view, not a new one').toBe(first);
  });

  it('back to 2D removes the view; 3D again shows the document as it is then', async () => {
    const view = new Designer3dView(() => Promise.resolve(chunk(true)));
    await view.open(fixture.componentInstance.slot, inputs);
    view.close();
    expect(view.on).toBeFalse();
    expect(shown()).toBeNull();
    view.sync(inputs()); // a change made in 2D: nothing to update, nothing breaks

    const later = createDesign({ frame: { widthMm: 900, heightMm: 2100 } });
    await view.open(fixture.componentInstance.slot, () => inputs(later));
    expect(shown()?.design).toBe(later);
  });

  it('a device without WebGL stays on 2D and says why', async () => {
    const view = new Designer3dView(() => Promise.resolve(chunk(false)));
    await view.open(fixture.componentInstance.slot, inputs);
    expect(view.on).toBeFalse();
    expect(view.loading).toBeFalse();
    expect(view.note).toBe(NO_WEBGL_NOTE);
    expect(shown()).withContext('no empty view is left behind').toBeNull();
  });

  it('a renderer that cannot start stays on 2D and says why', async () => {
    Fake3dComponent.refuses = true;
    const view = new Designer3dView(() => Promise.resolve(chunk(true)));
    await view.open(fixture.componentInstance.slot, inputs);
    expect(view.on).toBeFalse();
    expect(view.note).toBe(NO_WEBGL_NOTE);
    expect(shown()).toBeNull();
  });

  it('a chunk that cannot be fetched stays on 2D, says why, and can be tried again', async () => {
    let fail = true;
    const view = new Designer3dView(() => (fail ? Promise.reject(new Error('ChunkLoadError')) : Promise.resolve(chunk(true))));
    await view.open(fixture.componentInstance.slot, inputs);
    expect(view.on).toBeFalse();
    expect(view.loading).toBeFalse();
    expect(view.note).toBe(NO_CHUNK_NOTE);
    expect(shown()).toBeNull();

    fail = false;
    await view.open(fixture.componentInstance.slot, inputs);
    expect(view.on).toBeTrue();
    expect(view.note).withContext('the reason goes once 3D is on').toBe('');
  });

  it('does nothing while it is loading or already on', async () => {
    let loads = 0;
    const view = new Designer3dView(() => {
      loads++;
      return Promise.resolve(chunk(true));
    });
    const a = view.open(fixture.componentInstance.slot, inputs);
    const b = view.open(fixture.componentInstance.slot, inputs);
    await Promise.all([a, b]);
    await view.open(fixture.componentInstance.slot, inputs);
    expect(loads).toBe(1);
  });
});
