// Inspector: glass for the selected pane(s), "Whole window" as the shortcut (card T104).
import 'zone.js/testing';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WindowDesign, toPayload, walkLeaves } from '../design-model';
import { mixedExampleB, singleFixed } from '../design-model/testing/fixtures';
import { CanvasSelection } from './canvas-view';
import { DesignInspectorComponent } from './design-inspector.component';

const GLASS = [
  { id: 1, label: '5mm plain glass' },
  { id: 2, label: '4mm Plain glass' },
  { id: 15, label: '6+6 DGU glass reflactive' },
];

describe('DesignInspectorComponent: glass per pane', () => {
  let fixture: ComponentFixture<DesignInspectorComponent>;
  let component: DesignInspectorComponent;
  let design: WindowDesign;

  function create(d: WindowDesign, selection: CanvasSelection | null): void {
    design = d;
    fixture = TestBed.createComponent(DesignInspectorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('design', d);
    fixture.componentRef.setInput('selection', selection);
    fixture.componentRef.setInput('glassOptions', GLASS);
    component.designChange.subscribe((next) => {
      design = next;
      fixture.componentRef.setInput('design', next);
      fixture.detectChanges();
    });
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(sel: string): T | null => el().querySelector<T>(sel);
  const glassOf = (): unknown[] => walkLeaves(design.root).map((l) => l.glassId);

  function choose(sel: string, value: string): void {
    const select = q<HTMLSelectElement>(sel) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function select(selection: CanvasSelection | null): void {
    fixture.componentRef.setInput('selection', selection);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DesignInspectorComponent] }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  it('glazes the selected pane only; the price payload follows that pane', async () => {
    const [a, b, c] = walkLeaves(mixedExampleB().root).map((l) => l.id);
    create(mixedExampleB(), { type: 'pane', paneId: b });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(q('[data-di="pane-glass-label"]')?.textContent?.trim()).toBe('Glass');
    expect(q<HTMLSelectElement>('[data-di="pane-glass"]')?.value).toBe('1');

    choose('[data-di="pane-glass"]', '15');
    expect(glassOf()).toEqual([undefined, 15, undefined]);
    expect(toPayload(design).parts.map((p) => p.glazz_id)).toEqual([1, 15, 1]);
    expect(design.glazing.glassId).toBe(1);
    expect(q('[data-di="glass-note"]')?.textContent).toContain('1 of 3 panes has its own glass');
    expect(a && c).toBeTruthy();
  });

  it('several panes selected: one choice glazes them all, and a mixed selection says so', async () => {
    const [a, b, c] = walkLeaves(mixedExampleB().root).map((l) => l.id);
    create(mixedExampleB(), { type: 'pane', paneId: b });
    choose('[data-di="pane-glass"]', '15');

    select({ type: 'pane', paneId: c, paneIds: [b, c] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(q('[data-di="pane-glass-label"]')?.textContent?.trim()).toBe('Glass: mixed');
    expect(q('[data-di="multi-note"]')?.textContent).toContain('2 panes selected');
    expect(component.paneGlass).toEqual({ glassId: null, mixed: true });

    choose('[data-di="pane-glass"]', '2');
    expect(glassOf()).toEqual([undefined, 2, 2]);
    expect(q('[data-di="pane-glass-label"]')?.textContent?.trim()).toBe('Glass');
    expect(toPayload(design).parts.map((p) => p.glazz_id)).toEqual([1, 2, 2]);
    expect(a).toBeTruthy();
  });

  it('"Whole window" sets every pane, whatever each one had', async () => {
    const [, b] = walkLeaves(mixedExampleB().root).map((l) => l.id);
    create(mixedExampleB(), { type: 'pane', paneId: b });
    choose('[data-di="pane-glass"]', '15');
    select({ type: 'frame' });
    choose('[data-di="glass"]', '2');
    expect(design.glazing.glassId).toBe(2);
    expect(glassOf()).toEqual([undefined, undefined, undefined]);
    expect(toPayload(design).parts.every((p) => p.glazz_id === 2)).toBeTrue();
    expect(q('[data-di="glass-note"]')?.textContent).toContain('For every pane');
  });

  it('choosing the window glass for a pane takes its own glass away; read-only changes nothing', () => {
    create(singleFixed(), { type: 'pane', paneId: 'p1' });
    choose('[data-di="pane-glass"]', '15');
    expect(glassOf()).toEqual([15]);
    choose('[data-di="pane-glass"]', '1');
    expect('glassId' in walkLeaves(design.root)[0]).toBeFalse();

    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();
    component.onPaneGlass('15');
    expect(glassOf()).toEqual([undefined]);
  });
});
