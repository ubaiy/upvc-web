/**
 * Design Lab — saved-template storage behind the api contract of
 * docs/review/phase-6-design-api-log.md §1 (`design-template/*`).
 *
 * Rows always have the api row shape (the design-model functions
 * toTemplateRequest / fromTemplateRow do the mapping), stored in one of
 * two places:
 *  - 'api'   when the browser holds a login token: the company template
 *            library on the server (the TokenInterceptor adds the bearer);
 *  - 'local' otherwise (the lab needs no login): localStorage of this
 *            browser, so the picker still works on a bare demo.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  DesignTemplateRequest,
  DesignTemplateRow,
} from 'src/app/shared/design-model';
import { AuthService } from 'src/app/shared/services/auth.service';
import { environment } from 'src/environments/environment';

interface Envelope<T> {
  success?: boolean;
  status?: number;
  data?: T;
  message?: string;
}

const LOCAL_KEY = 'upvc.design-lab.templates';

@Injectable({ providedIn: 'root' })
export class DesignTemplateStore {
  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService
  ) {}

  /** Where rows are read from and written to right now. */
  get mode(): 'api' | 'local' {
    return this.auth.getToken() ? 'api' : 'local';
  }

  private url(path: string): string {
    return `${environment.API_URL}/design-template/${path}`;
  }

  private unwrap<T>(res: Envelope<T>): T {
    if (res.success === false || res.status === 0 || res.data === undefined) {
      throw new Error(res.message || 'The template request was refused.');
    }
    return res.data;
  }

  private readLocal(): DesignTemplateRow[] {
    try {
      const rows = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  private writeLocal(rows: DesignTemplateRow[]): void {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
  }

  async list(): Promise<DesignTemplateRow[]> {
    if (this.mode === 'local') return this.readLocal();
    const res = await firstValueFrom(
      this.http.get<Envelope<DesignTemplateRow[]>>(this.url('list'))
    );
    return this.unwrap(res);
  }

  async add(request: DesignTemplateRequest): Promise<DesignTemplateRow> {
    if (this.mode === 'local') {
      const rows = this.readLocal();
      const id = rows.reduce((max, r) => Math.max(max, r.id ?? 0), 0) + 1;
      // Through JSON, exactly as the server would store and return it.
      const row = JSON.parse(JSON.stringify({ id, ...request })) as DesignTemplateRow;
      this.writeLocal([row, ...rows]);
      return row;
    }
    const res = await firstValueFrom(
      this.http.post<Envelope<DesignTemplateRow>>(this.url('add'), request)
    );
    return this.unwrap(res);
  }

  async remove(id: number): Promise<void> {
    if (this.mode === 'local') {
      this.writeLocal(this.readLocal().filter((r) => r.id !== id));
      return;
    }
    const res = await firstValueFrom(
      this.http.post<Envelope<unknown>>(this.url(`delete/${id}`), {})
    );
    if (res.success === false || res.status === 0) {
      throw new Error(res.message || 'The template could not be deleted.');
    }
  }
}
