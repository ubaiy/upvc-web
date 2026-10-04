import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TrackType, WindowDesign } from 'src/app/shared/design-model';
import { DropdownService } from 'src/app/shared/services/dropdown.service';
import { ProfileService } from '../../../masters/profile/profile.service';
import {
  CatalogOption,
  DesignerCatalog,
  HandleChoice,
  SystemQuery,
  missingSystems,
  needsCasementHandles,
  systemKey,
} from './designer-catalog';

const KNOWN_TRACKS: TrackType[] = ['2 Track', '2.5 Track', '3 Track', '4 Track'];

/**
 * Loads the designer's master data. The fixed lists (glass, colours, hinge
 * types, tracks, mullion profiles) come from the route's resolvers; the
 * frame, sash and handle lists depend on the system each pane uses and are
 * fetched the first time a design needs them, then kept for the session
 * (the api allows 60 requests a minute per user).
 */
@Injectable({ providedIn: 'root' })
export class DesignerCatalogService {
  private readonly systems: DesignerCatalog['systems'] = {};
  private readonly handles: DesignerCatalog['handles'] = {};
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly profiles: ProfileService,
    private readonly dropdowns: DropdownService
  ) {}

  /** Build the catalogue from the resolver data; the lazy lists are shared. */
  fromRouteData(dropdowns: any, mullionList: any[]): DesignerCatalog {
    const glass = ((dropdowns?.costhead ?? []) as any[]).map((g) => ({
      id: g.id,
      label: g.name,
      isDefault: !!g.default,
    }));
    const colours = ((dropdowns?.profile_color ?? []) as any[]).map((c) => ({
      id: c.id,
      label: c.color_name,
      hex: c.color_code,
      isDefault: !!c.is_default,
      row: c,
    }));
    const offered = (dropdowns?.slidding_type ?? []) as string[];
    const tracks = KNOWN_TRACKS.filter((t) => offered.includes(t));
    return {
      glass,
      colours,
      hinges: [...((dropdowns?.hinges_type ?? []) as string[])],
      tracks: tracks.length ? tracks : ['2 Track'],
      mullions: this.options(mullionList),
      systems: this.systems,
      handles: this.handles,
    };
  }

  /** Fetch whatever lists `design` needs and the catalogue does not hold yet. */
  async ensure(design: WindowDesign, catalog: DesignerCatalog): Promise<void> {
    const jobs = missingSystems(design, catalog).map((q) => this.loadSystem(q));
    if (needsCasementHandles(design) && !catalog.handles['Casement']) {
      jobs.push(this.loadHandles('Casement'));
    }
    await Promise.all(jobs);
  }

  private options(rows: any[] | null | undefined): CatalogOption[] {
    return (rows ?? []).map((r) => ({
      id: r.id,
      label: r.profile_code ? `${r.profile_code} · ${r.profile_name}` : r.profile_name ?? r.name,
    }));
  }

  private once(key: string, job: () => Promise<void>): Promise<void> {
    let p = this.pending.get(key);
    if (!p) {
      p = job().finally(() => this.pending.delete(key));
      this.pending.set(key, p);
    }
    return p;
  }

  private products(q: SystemQuery, subCategory: 'Frame' | 'Sash'): Promise<CatalogOption[]> {
    // The same query the old screen sent, so the same profiles come back.
    const query = {
      category_name: q.category,
      track: q.track === null ? 'null' : q.track,
      sub_category_name: subCategory,
      casement_type: q.casementType,
      product_type: q.productType,
    };
    return firstValueFrom(this.profiles.productDropdown(query)).then((res) => {
      if (!res?.success) throw new Error(res?.message || 'The profile list could not be loaded.');
      return this.options(res.data as any[]);
    });
  }

  private loadSystem(q: SystemQuery): Promise<void> {
    const key = systemKey(q);
    return this.once(`system:${key}`, async () => {
      const fixed = q.category === 'Casement' && q.casementType !== 'Openable';
      const [frames, sashes] = await Promise.all([
        this.products(q, 'Frame'),
        fixed ? Promise.resolve([]) : this.products(q, 'Sash'),
      ]);
      this.systems[key] = { frames, sashes };
    });
  }

  private loadHandles(category: 'Casement' | 'Slidding'): Promise<void> {
    return this.once(`handles:${category}`, async () => {
      const res = await firstValueFrom(
        this.dropdowns.getCostHeadDataDropdown({ costhead: 'Handle', type: '', category, search: '' })
      );
      if (!res?.success) throw new Error(res?.message || 'The handle list could not be loaded.');
      this.handles[category] = (res.data as any[]).map(
        (h): HandleChoice => ({ id: h.id, label: h.name, door: !!h.door, window: !!h.window })
      );
    });
  }
}
