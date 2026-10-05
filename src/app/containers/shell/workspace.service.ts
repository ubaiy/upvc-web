import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { ApiHttpService } from '../../shared/services/api-http.service';
import { LocalStoreService } from '../../shared/services/local-storage.service';
import { quiet } from '../../shared/interceptors/request-options';

export interface Workspace {
  /** The fabricator's company name, shown at the top of the sidebar. */
  name: string;
}

const CACHE_KEY = 'Workspace';

/**
 * The company the signed-in user works for.
 *
 * Today the name comes from `get-company-branding`, which returns the one
 * company of the installation. When the API becomes multi-tenant (SaaS plan
 * M1) the company should arrive with the signed-in user; only `load()` changes.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  readonly workspace$ = new BehaviorSubject<Workspace>({ name: this.cachedName() });

  private loaded = false;

  constructor(private api: ApiHttpService, private store: LocalStoreService) {}

  /** Fetches the company once per session. The last known name shows meanwhile, so the sidebar does not flash. */
  load(): void {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    this.api.get('get-company-branding', quiet('loader')).subscribe({
      next: (res: any) => {
        const name = typeof res?.data?.name === 'string' ? res.data.name.trim() : '';
        if (name) {
          this.workspace$.next({ name });
          this.store.setItem(CACHE_KEY, { name });
        }
      },
      // The sidebar keeps the cached name, or the product name if there is none.
      error: () => (this.loaded = false),
    });
  }

  private cachedName(): string {
    const cached = this.store.getItem(CACHE_KEY);
    return typeof cached?.name === 'string' ? cached.name : '';
  }
}
