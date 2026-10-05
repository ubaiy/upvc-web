import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SubQuotationDesignComponent } from './sub-quotation-design.component';

let made: string[] = [];
let destroyed: string[] = [];

/** Stands in for the designer: like it, it reads the route once, as it opens. */
@Component({ standalone: true, template: '<p class="window">{{ window }}</p>' })
class DesignerStubComponent {
  readonly window: string;
  constructor(route: ActivatedRoute) {
    const params = route.snapshot.paramMap;
    this.window = `${params.get('id')}/${params.get('subId')}`;
    made.push(this.window);
  }
  ngOnDestroy(): void {
    destroyed.push(this.window);
  }
}

describe('SubQuotationDesignComponent (the route of the window designer, T91)', () => {
  let fixture: ComponentFixture<SubQuotationDesignComponent>;
  let params: BehaviorSubject<any>;
  const route: any = { snapshot: {} };
  const shown = (): string[] => Array.from(fixture.nativeElement.querySelectorAll('.window')).map((p: any) => p.textContent);

  /** The router sets the snapshot, then tells the page. */
  function goTo(values: Record<string, string>): void {
    route.snapshot.paramMap = convertToParamMap(values);
    params.next(route.snapshot.paramMap);
    fixture.detectChanges();
  }

  beforeEach(() => {
    made = [];
    destroyed = [];
    route.snapshot.paramMap = convertToParamMap({ id: '14', subId: '20', index: '1' });
    route.paramMap = params = new BehaviorSubject(route.snapshot.paramMap);
    TestBed.configureTestingModule({
      declarations: [SubQuotationDesignComponent],
      providers: [{ provide: ActivatedRoute, useValue: route }],
    });
    fixture = TestBed.createComponent(SubQuotationDesignComponent);
    (fixture.componentInstance as any).designer = DesignerStubComponent;
    fixture.detectChanges();
  });

  it('opens one designer for the window in the address', () => {
    expect(shown()).toEqual(['14/20']);
  });

  it('from one window straight to another: the first designer goes and a new one opens the second', () => {
    goTo({ id: '14', subId: '21', index: '2' });
    expect(destroyed).toEqual(['14/20']);
    expect(shown()).toEqual(['14/21']);
  });

  it('opens a new designer for the same window number of another quotation', () => {
    goTo({ id: '15', subId: '20', index: '1' });
    expect(shown()).toEqual(['15/20']);
  });

  it('keeps the designer, and what is drawn in it, when only the place in the list changes', () => {
    goTo({ id: '14', subId: '20', index: '3' });
    expect(made).toEqual(['14/20']);
    expect(destroyed).toEqual([]);
  });
});
