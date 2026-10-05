import { Injectable } from '@angular/core';
import { Observable, defer, of, throwError } from 'rxjs';
import { parseStructure, Structure, summarize } from '../../shared/structure-model';

/** One row of the list of saved structures: everything but the document. */
export interface StructureSummary {
  id: string;
  name: string;
  /** The template it was made from: dome, cabin, bay, pyramid, lean-to, gable; "free" for none. */
  kind: string;
  overall: { widthMm: number; depthMm: number; heightMm: number };
  /** ISO 8601, set by the store on every save. */
  savedAt: string;
  /** A small picture of the 3D view as a data URL, or null when the device could not draw one. */
  thumbnail: string | null;
}

export interface SavedStructure extends StructureSummary {
  document: Structure;
}

export interface StructureSave {
  /** null = a new structure; the store gives the id. */
  id: string | null;
  document: Structure;
  thumbnail: string | null;
}

/**
 * Where saved structures live. The screens know only these four calls, which
 * are the four the api will offer (phase-40 log §9): the next card provides
 * this class with an http implementation and nothing else changes. Rename and
 * duplicate are `get` followed by `save`.
 */
@Injectable({ providedIn: 'root', useFactory: () => new BrowserStructureStore() })
export abstract class StructureStore {
  /** Newest first. */
  abstract list(): Observable<StructureSummary[]>;
  /** Fails when there is no such structure or it can no longer be read. */
  abstract get(id: string): Observable<SavedStructure>;
  /** Fails when the store refuses (the browser's storage is full or blocked). */
  abstract save(input: StructureSave): Observable<StructureSummary>;
  abstract delete(id: string): Observable<void>;
}

export const STRUCTURE_STORE_KEY = 'upvc.structures.v1';
const KEEP = 50;

/** What is kept in the browser. Entries saved before card T114 have no overall size and no picture. */
type Row = Pick<SavedStructure, 'id' | 'name' | 'kind' | 'savedAt' | 'document'> & Partial<Pick<SavedStructure, 'overall' | 'thumbnail'>>;

/**
 * Saved structures of this browser. The api has no structure table yet
 * (architecture.md §9, quatation_structures): until it has, the document
 * lives here and leaves the browser only through Export.
 */
export class BrowserStructureStore extends StructureStore {
  list(): Observable<StructureSummary[]> {
    return defer(() => of(this.rows().map(summaryOf)));
  }

  get(id: string): Observable<SavedStructure> {
    return defer(() => {
      const row = this.rows().find((r) => r.id === id);
      if (!row) return throwError(() => new Error('This structure is no longer saved on this device.'));
      try {
        // The saved document is checked again on the way in.
        return of({ ...summaryOf(row), document: parseStructure(JSON.stringify(row.document)) });
      } catch {
        return throwError(() => new Error('This saved structure can no longer be read.'));
      }
    });
  }

  save(input: StructureSave): Observable<StructureSummary> {
    return defer(() => {
      const doc = input.document;
      const row: Row = {
        id: input.id ?? newId(),
        name: doc.name,
        kind: doc.template?.kind ?? 'free',
        overall: overallOf(doc),
        savedAt: new Date().toISOString(),
        thumbnail: input.thumbnail,
        document: doc,
      };
      const next = [row, ...this.rows().filter((r) => r.id !== row.id)].slice(0, KEEP);
      try {
        localStorage.setItem(STRUCTURE_STORE_KEY, JSON.stringify(next));
      } catch {
        return throwError(() => new Error('Could not save: the storage of this browser is full or blocked. Use Export JSON.'));
      }
      return of(summaryOf(row));
    });
  }

  delete(id: string): Observable<void> {
    return defer(() => {
      try {
        localStorage.setItem(STRUCTURE_STORE_KEY, JSON.stringify(this.rows().filter((r) => r.id !== id)));
      } catch {
        return throwError(() => new Error('Could not delete: the storage of this browser is blocked.'));
      }
      return of(undefined);
    });
  }

  private rows(): Row[] {
    try {
      const rows = JSON.parse(localStorage.getItem(STRUCTURE_STORE_KEY) ?? '[]') as Row[];
      return Array.isArray(rows) ? rows.filter((r) => r && r.id && r.document) : [];
    } catch {
      return [];
    }
  }
}

function newId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function overallOf(doc: Structure): StructureSummary['overall'] {
  try {
    const o = summarize(doc).overall;
    return { widthMm: Math.round(o.widthMm), depthMm: Math.round(o.depthMm), heightMm: Math.round(o.heightMm) };
  } catch {
    return { widthMm: 0, depthMm: 0, heightMm: 0 };
  }
}

function summaryOf(row: Row): StructureSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    overall: row.overall ?? overallOf(row.document),
    savedAt: row.savedAt,
    thumbnail: row.thumbnail ?? null,
  };
}
