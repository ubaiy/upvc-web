import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { WorkspaceService } from '../../containers/shell/workspace.service';
import { fillKey, formatPlan, Pt, rectanglePlan, serializeStructure } from '../../shared/structure-model';
import { environment } from '../../../environments/environment';
import { PlanEditorComponent } from './plan-editor.component';
import { StructureDesignerComponent } from './structure-designer.component';
import { STRUCTURE_STORE_KEY as STORE_KEY } from './structure-store.service';

const API = environment.API_URL;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// The plan is drawn here through the editor's own steps (a corner placed at a
// point), so the specs do not depend on the size of the test window. The real
// mouse on the grid is in docs/review/phase-63-structure-from-scratch.
describe('StructureDesignerComponent: a structure from nothing (T169)', () => {
  let fixture: ComponentFixture<StructureDesignerComponent>;
  let c: StructureDesignerComponent;
  let el: HTMLElement;
  let kept: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = (): any => fixture.debugElement.query(By.directive(PlanEditorComponent)).componentInstance;
  const corner = (x: number, z: number): void => editor().place({ point: [x, z], kind: 'grid' });
  const http = (): HttpTestingController => TestBed.inject(HttpTestingController);

  async function make(params: Record<string, string> = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [StructureDesignerComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}), paramMap: convertToParamMap(params) } } },
        { provide: WorkspaceService, useValue: { workspace$: new BehaviorSubject({ name: 'Hakimi Enterprise' }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StructureDesignerComponent);
    c = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  /** An L of 4800 × 3600 with a 2400 × 1800 bite out of the back right, drawn corner by corner. */
  function drawL(): void {
    el.querySelector<HTMLElement>('.sd-card[data-kind="free"]')?.click();
    fixture.detectChanges();
    corner(0, 0);
    corner(2400, 0);
    corner(2400, 1800);
    corner(4800, 1800);
    corner(4800, 3600);
    corner(0, 3600);
    editor().close();
    fixture.detectChanges();
  }

  beforeEach(() => {
    kept = localStorage.getItem(STORE_KEY);
    localStorage.removeItem(STORE_KEY);
  });

  afterEach(() => {
    fixture?.destroy();
    if (kept === null) localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, kept);
  });

  it('"Start from scratch" is the first card and opens an empty plot, with no structure yet', async () => {
    await make();
    const first = el.querySelector<HTMLElement>('.sd-card');
    expect(first?.dataset['kind']).toBe('free');
    expect(first?.textContent).toContain('Start from scratch');
    first?.click();
    fixture.detectChanges();
    expect(c.structure).toBeNull();
    expect(el.querySelector('.sd--draw h1')?.textContent).toBe('Start from scratch');
    expect(el.querySelector('app-plan-editor svg')).not.toBeNull();
    expect(el.querySelector<HTMLButtonElement>('[data-plan="close"]')?.disabled).toBeTrue();
    expect(editor().drawHint).toBe('Click where the first corner goes.');
  });

  it('a side that would cross the outline is refused while drawing, and the crossed side is shown', async () => {
    await make();
    el.querySelector<HTMLElement>('.sd-card[data-kind="free"]')?.click();
    fixture.detectChanges();
    corner(0, 0);
    corner(3000, 0);
    corner(3000, 2000);
    corner(1000, 2000);
    // Down through the first side: not added.
    corner(1000, -500);
    fixture.detectChanges();
    expect(editor().draft.length).toBe(4);
    expect(editor().badSide).toBe(0);
    expect(el.querySelector('[data-plan="note"]')?.textContent).toContain('That side would cross side 1, shown in red.');
    expect(el.querySelectorAll('.pe-side.is-bad').length).toBe(1);
    // A side shorter than 300 mm is not a side.
    corner(1000, 1900);
    expect(editor().draft.length).toBe(4);
    // "Undo corner" takes the last one away.
    editor().undoCorner();
    expect(editor().draft).toEqual([[0, 0], [3000, 0], [3000, 2000]]);
    expect(c.structure).toBeNull();
  });

  it('closing an L makes the structure: a wall a side, the plan beside the 3D view, only the roofs an L can carry', async () => {
    await make();
    drawL();
    expect(c.structure?.template?.kind).toBe('free');
    expect(c.isFree).toBeTrue();
    expect(c.planOpen).toBeTrue();
    expect(c.planPts?.length).toBe(6);
    expect(new Set(c.structure!.faces.filter((f) => f.role === 'wall').map((f) => f.group)).size).toBe(6);
    expect(el.querySelector('.sd-plan-dock app-plan-editor')).not.toBeNull();
    const offered = Array.from(el.querySelectorAll<HTMLElement>('[data-param="roof"] [data-option]')).map((b) => b.dataset['option']);
    // No gable: its ridge would lie on the inner edge of this L and one arm would get a single slope (T173).
    expect(offered).toEqual(['none', 'flat', 'leanto']);
    const why = Array.from(el.querySelectorAll('[data-roof="not-offered"]')).map((n) => n.textContent);
    expect(why).toContain('A hipped roof needs a plan with no inward corner.');
    // The plan and the side letters are not fields.
    expect(el.querySelector('[data-param="plan"]')).toBeNull();
    expect(el.querySelector('[data-param="walls"]')).toBeNull();
  });

  it('the roof is chosen and sized; every step can be undone and redone', async () => {
    await make();
    drawL();
    const roof = c.visibleParams.find((p) => p.key === 'roof')!;
    c.setParam(roof, 'gable', false);
    fixture.detectChanges();
    expect(c.structure!.joints.some((j) => j.role === 'ridge')).toBeTrue();
    expect(c.visibleParams.map((p) => p.key)).toEqual(['height', 'module', 'roof', 'roofFill', 'ridge', 'pitch']);
    c.setParam(c.visibleParams.find((p) => p.key === 'pitch')!, '30', false);
    const high = c.summary!.overall.heightMm;
    expect(high).toBeGreaterThan(2400);
    c.undo();
    expect(c.summary!.overall.heightMm).toBeLessThan(high);
    c.undo();
    expect(c.params['roof']).toBe('flat');
    c.redo();
    c.redo();
    expect(c.summary!.overall.heightMm).toBe(high);
    // A roof this plan cannot carry is not taken, whatever is sent.
    c.setParam(roof, 'dome', false);
    expect(c.params['roof']).toBe('flat');
  });

  it('the plan is changed afterwards: a dragged side follows live and is one undo step; a side is typed, opened, put against the house', async () => {
    await make();
    c.startScratch();
    fixture.detectChanges();
    editor().useReady(rectanglePlan(3600, 2400));
    fixture.detectChanges();
    expect(c.summary?.overall).toEqual({ widthMm: 3600, depthMm: 2400, heightMm: 2400 });
    const moved = (depth: number): Pt[] => [[0, 0], [0, depth], [3600, depth], [3600, 0]];
    c.planPreview({ plan: moved(2700), walls: 'wwww' });
    c.planPreview({ plan: moved(3000), walls: 'wwww' });
    expect(c.summary?.overall.depthMm).toBe(3000);
    c.planChanged({ plan: moved(3000), walls: 'wwww' });
    c.undo();
    expect(c.summary?.overall.depthMm).toBe(2400);
    expect(c.history?.canUndo).toBeFalse();
    c.redo();
    fixture.detectChanges();

    // In the editor: wall 2 is selected, its length typed.
    const pe = editor();
    pe.selectedSide = 1;
    pe.typeLength('5000');
    fixture.detectChanges();
    expect(c.summary?.overall.widthMm).toBe(5000);
    expect(formatPlan(c.planPts!)).toBe('0,0;0,3000;5000,3000;5000,0');
    // A length outside the limits is refused with the limits.
    editor().selectedSide = 1;
    editor().typeLength('100');
    fixture.detectChanges();
    expect(el.querySelector('[data-plan="note"]')?.textContent).toBe('A side is 300 to 30000 mm long.');
    expect(c.summary?.overall.widthMm).toBe(5000);

    // Wall 4 against the existing wall: its panels go, a wall plate carries the roof.
    editor().selectedSide = 3;
    editor().setState('h');
    fixture.detectChanges();
    expect(c.params['walls']).toBe('wwwh');
    expect(c.structure!.faces.some((f) => f.group === 'wall-4')).toBeFalse();
    expect(c.structure!.joints.filter((j) => j.role === 'wall_plate').length).toBe(1);
    c.undo();
    fixture.detectChanges();
    expect(c.structure!.faces.some((f) => f.group === 'wall-4')).toBeTrue();

    // A corner added on wall 2 makes five sides; the side letters follow.
    editor().selectedSide = 1;
    editor().addCorner();
    fixture.detectChanges();
    expect(c.planPts?.length).toBe(5);
    expect(c.params['walls']).toBe('wwwww');
  });

  it('a regular plan of the user\'s own number of sides can carry a dome', async () => {
    await make();
    c.startScratch();
    fixture.detectChanges();
    editor().roundSides = 10;
    editor().roundDiameter = 5000;
    editor().useRound();
    fixture.detectChanges();
    expect(c.planPts?.length).toBe(10);
    const offered = Array.from(el.querySelectorAll<HTMLElement>('[data-param="roof"] [data-option]')).map((b) => b.dataset['option']);
    expect(offered).toContain('dome');
    c.setParam(c.visibleParams.find((p) => p.key === 'roof')!, 'dome', false);
    c.setParam(c.visibleParams.find((p) => p.key === 'rings')!, '4', false);
    expect(c.structure!.faces.filter((f) => f.role === 'roof').length).toBe(40);
    expect(c.structure!.hubs.filter((h) => h.role === 'crown').length).toBe(1);
  });

  it('is saved to the quotation, opened again and saved over like a predefined structure', async () => {
    await make({ id: '12' });
    drawL();
    c.rename('Sit-out for Mrs Rao');
    c.commit({ roof: 'gable', pitch: 25, walls: 'wwwwwh' });
    c.selectFaces(['w2-1']);
    c.setFill('door');
    const saved = serializeStructure(c.structure!);
    const summary = c.summary;
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const waitFor = async (done: () => boolean): Promise<void> => {
      for (let i = 0; i < 200 && !done(); i++) await sleep(20);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let add: any[] = [];
    c.save();
    await waitFor(() => (add = [...add, ...http().match(`${API}/quatation/structure/add`)]).length > 0);
    expect(add[0].request.body).toEqual(jasmine.objectContaining({ quatation_id: 12, name: 'Sit-out for Mrs Rao', structure_type: 'free', quantity: 1, unit_price: null, summary }));
    expect(serializeStructure(add[0].request.body.document)).toBe(saved);
    // What the api checks of a summary holds: the counts are the sums of their rows.
    expect(summary!.panelCount).toBe(summary!.panels.reduce((n, r) => n + r.count, 0));
    expect(summary!.barCount).toBe(summary!.bars.reduce((n, r) => n + r.count, 0));
    const line = {
      id: 91,
      kind: 'structure',
      quatation_id: 12,
      quantity: 1,
      label: 'Sit-out for Mrs Rao',
      image: null,
      structure: { type: 'free', name: 'Sit-out for Mrs Rao', overall: summary!.overall, costing: { price_is_manual: false, unit_price: 1 } },
      document: JSON.parse(saved),
    };
    add[0].flush({ success: true, data: line });
    expect(navigate).toHaveBeenCalledWith(['/quotation/detail', 12]);

    // "Edit" on the quotation: the same structure, still one that can be reshaped and whose plan can be changed.
    fixture.destroy();
    TestBed.resetTestingModule();
    await make({ id: '12', lineId: '91' });
    http().expectOne(`${API}/quatation/structure/91`).flush({ success: true, data: line });
    fixture.detectChanges();
    expect(serializeStructure(c.structure!)).toBe(saved);
    expect(c.isFree).toBeTrue();
    expect(c.params['roof']).toBe('gable');
    expect(c.params['walls']).toBe('wwwwwh');
    expect(c.planPts?.length).toBe(6);
    expect(fillKey(c.structure!.faces.find((f) => f.id === 'w2-1')!)).toBe('door');
    c.togglePlan();
    fixture.detectChanges();
    expect(el.querySelector('.sd-plan-dock app-plan-editor')).not.toBeNull();
    c.commit({ height: 2700 });
    expect(fillKey(c.structure!.faces.find((f) => f.id === 'w2-1')!)).withContext('the door is kept').toBe('door');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let update: any[] = [];
    c.save();
    await waitFor(() => (update = [...update, ...http().match(`${API}/quatation/structure/update/91`)]).length > 0);
    expect(update[0].request.body).toEqual(jasmine.objectContaining({ name: 'Sit-out for Mrs Rao', structure_type: 'free' }));
    expect(update[0].request.body.summary.overall.heightMm).toBeGreaterThan(2700);
  });
});
