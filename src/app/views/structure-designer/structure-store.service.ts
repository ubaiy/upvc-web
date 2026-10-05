import { inject, Injectable } from '@angular/core';
import { Observable, defer, of, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { parseStructure, Structure, summarize } from '../../shared/structure-model';
import { StructureLine, StructureLineService } from './structure-line.service';

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
  /** Of a quotation line: how many, and the typed price for one (null = the api's computed price). */
  quantity?: number;
  manualPrice?: number | null;
}

export interface SavedStructure extends StructureSummary {
  document: Structure;
}

export interface StructureSave {
  /** null = a new structure; the store gives the id. */
  id: string | null;
  document: Structure;
  thumbnail: string | null;
  /** The quotation the structure is a line of; the api store needs it for a new line. */
  quotationId?: number;
  quantity?: number;
  /** A typed price for one; null = the api's computed price. */
  unitPrice?: number | null;
}

/**
 * Where saved structures live. The screens know only these four calls. Since
 * card T123 a structure is a line of a quotation: the id is the id of that
 * line and the api keeps the document (`ApiStructureStore`). What was saved
 * in the browser before (`BrowserStructureStore`) is only read, to bring it
 * into a quotation.
 */
@Injectable({ providedIn: 'root', useFactory: () => new ApiStructureStore(inject(StructureLineService)) })
export abstract class StructureStore {
  /** Newest first. */
  abstract list(): Observable<StructureSummary[]>;
  /** Fails when there is no such structure or it can no longer be read. */
  abstract get(id: string): Observable<SavedStructure>;
  /** Fails when the store refuses (the browser's storage is full or blocked). */
  abstract save(input: StructureSave): Observable<StructureSummary>;
  abstract delete(id: string): Observable<void>;
}

/**
 * The structures of quotations, at the api: the id is the id of the quotation
 * line (`quatation/structure/*`). The api prices the line on every save.
 */
export class ApiStructureStore extends StructureStore {
  constructor(private readonly lines: StructureLineService) {
    super();
  }

  /** The api lists a quotation's structures with its other lines (`quatation/show`); there is no list of their own. */
  list(): Observable<StructureSummary[]> {
    return of([]);
  }

  get(id: string): Observable<SavedStructure> {
    return this.lines.get(Number(id)).pipe(
      map((line) => {
        if (!line.document) throw new Error('This structure has no drawing saved with it.');
        // The stored document is checked again on the way in.
        return { ...summaryOfLine(line), document: parseStructure(JSON.stringify(line.document)) };
      })
    );
  }

  save(input: StructureSave): Observable<StructureSummary> {
    const doc = input.document;
    const body = {
      name: doc.name,
      structure_type: doc.template?.kind ?? 'free',
      quantity: input.quantity ?? 1,
      unit_price: input.unitPrice ?? null,
      image: input.thumbnail,
      document: doc,
      summary: summarize(doc),
    };
    if (input.id) return this.lines.update(Number(input.id), body).pipe(map(summaryOfLine));
    if (!input.quotationId) return throwError(() => new Error('A structure is saved as a line of a quotation: open it from a quotation.'));
    return this.lines.add({ ...body, quatation_id: input.quotationId }).pipe(map(summaryOfLine));
  }

  delete(id: string): Observable<void> {
    return this.lines.remove(Number(id)).pipe(map(() => undefined));
  }
}

function summaryOfLine(line: StructureLine): StructureSummary {
  const s = line.structure;
  return {
    id: String(line.id),
    name: s?.name || line.label || 'Structure',
    kind: s?.type || 'free',
    overall: s?.overall ?? { widthMm: Number(line.width) || 0, depthMm: 0, heightMm: Number(line.height) || 0 },
    savedAt: '',
    thumbnail: line.image ?? null,
    quantity: Number(line.quantity) || 1,
    manualPrice: s?.costing?.price_is_manual ? Number(s.costing.unit_price) : null,
  };
}

export const STRUCTURE_STORE_KEY = 'upvc.structures.v1';
const KEEP = 50;

/** What is kept in the browser. Entries saved before card T114 have no overall size and no picture. */
type Row = Pick<SavedStructure, 'id' | 'name' | 'kind' | 'savedAt' | 'document'> & Partial<Pick<SavedStructure, 'overall' | 'thumbnail'>>;

/**
 * Structures saved in this browser before card T123, when the designer stood
 * apart from the quotation. Nothing new is saved here: the designer reads
 * them so each can be brought into a quotation.
 */
@Injectable({ providedIn: 'root' })
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
