import { NgModule } from '@angular/core';
import { RouterModule, Routes, UrlMatchResult, UrlSegment } from '@angular/router';

import { CatalogueComponent } from './catalogue.component';
import { CATALOGUE_TABS } from './catalogue.model';

/**
 * Matches `/masters/<tab>` for the four tabs with one route, so moving between
 * tabs keeps the page (and the lists it has loaded) instead of rebuilding it.
 */
export function catalogueTabMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  return segments.length === 1 && CATALOGUE_TABS.some((tab) => tab.id === segments[0].path)
    ? { consumed: segments, posParams: { tab: segments[0] } }
    : null;
}

const routes: Routes = [
  { path: '', redirectTo: 'profile', pathMatch: 'full' },
  { matcher: catalogueTabMatcher, component: CatalogueComponent, title: 'Catalogue' },

  // Addresses of the old separate add and edit screens. Each now opens its tab;
  // adding and editing happen in a dialog there.
  { path: 'profile/add', redirectTo: 'profile' },
  { path: 'profile/edit/:id', redirectTo: 'profile' },
  { path: 'profile-color/add', redirectTo: 'profile-color' },
  { path: 'profile-color/edit/:id', redirectTo: 'profile-color' },
  { path: 'Glazzing', redirectTo: 'glass' },
  { path: 'Glazzing/:id', redirectTo: 'glass' },
  { path: 'Hardware', redirectTo: 'hardware' },
  { path: 'Hardware/:id', redirectTo: 'hardware' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MastersRoutingModule {}
