/** Helpers for the specs of the structure designer: a catalogue that is already loaded. */

import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { WorkspaceService } from '../../containers/shell/workspace.service';
import { StructureDesignerComponent } from './structure-designer.component';
import { DesignerCatalog } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog';
import { DesignerCatalogService } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog.service';
import { demoCatalog } from '../quotation/sub-quotation/sub-quotation-design/testing/demo-catalog';

/** The demo catalogue with a second colour, a bronze glass and a second mullion. */
export function structureCatalog(): DesignerCatalog {
  const base = demoCatalog();
  const oak = { id: 7, color_name: 'Oak', color_code: '#6b4a32', is_default: 0 };
  return {
    ...base,
    glass: [...base.glass, { id: 16, label: '6mm bronze glass', isDefault: false }],
    colours: [...base.colours, { id: 7, label: 'Oak', hex: '#6b4a32', isDefault: false, row: oak }],
    mullions: [...base.mullions, { id: 30, label: 'P60-T · Transom' }],
  };
}

/**
 * The catalogue service as the designer uses it, with every list of profiles and handles already at hand
 * (nothing is fetched). Its fromRouteData is the real one, so the shape of the resolvers answers is checked too.
 */
export function fakeCatalogs(): DesignerCatalogService {
  const real = new DesignerCatalogService({} as never, {} as never);
  const fromRouteData = real.fromRouteData.bind(real);
  real.fromRouteData = (dropdowns, mullions) => {
    const catalog = fromRouteData(dropdowns, mullions);
    Object.assign(catalog.systems, demoCatalog().systems);
    Object.assign(catalog.handles, demoCatalog().handles);
    return catalog;
  };
  real.ensure = () => Promise.resolve();
  real.hardware = () => Promise.resolve([{ id: 71, label: 'Crown hub' }, { id: 72, label: 'Node connector' }]);
  return real;
}

/** What the routes' resolvers give: the rows of the catalogue in the shape of the api. */
export function routeData(): { dropdowns: unknown; mullionList: unknown[] } {
  return {
    dropdowns: {
      costhead: [
        { id: 1, name: '5mm plain glass', default: 1 },
        { id: 2, name: '4mm Plain glass', default: 0 },
        { id: 16, name: '6mm bronze glass', default: 0 },
      ],
      profile_color: [
        { id: 1, color_name: 'Default', color_code: '#ffffff', is_default: 1 },
        { id: 7, color_name: 'Oak', color_code: '#6b4a32', is_default: 0 },
      ],
      hinges_type: ['Flate Hinges', 'Friction'],
      slidding_type: ['2 Track', '3 Track'],
    },
    mullionList: [
      { id: 29, profile_code: 'P60-Z', profile_name: 'Mullion' },
      { id: 30, profile_code: 'P60-T', profile_name: 'Transom' },
    ],
  };
}

/** The designer on the route of a quotation, with the catalogue of the resolvers and no profile list to fetch. */
export async function openDesigner(
  query: Record<string, string> = {},
  params: Record<string, string> = {}
): Promise<ComponentFixture<StructureDesignerComponent>> {
  await TestBed.configureTestingModule({
    imports: [StructureDesignerComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query), paramMap: convertToParamMap(params), data: routeData() } } },
      { provide: WorkspaceService, useValue: { workspace$: new BehaviorSubject({ name: 'Hakimi Enterprise' }) } },
      { provide: DesignerCatalogService, useValue: fakeCatalogs() },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(StructureDesignerComponent);
  fixture.detectChanges();
  return fixture;
}
