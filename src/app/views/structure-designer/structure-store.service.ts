import { Injectable } from '@angular/core';
import { parseStructure, Structure } from '../../shared/structure-model';

export interface SavedStructure {
  id: string;
  name: string;
  kind: string;
  savedAt: string;
  document: Structure;
}

const KEY = 'upvc.structures.v1';

/**
 * Saved structures of this browser. The api has no structure table yet
 * (architecture.md §9, quatation_structures): until it has, the document
 * lives here and leaves the browser only through Export.
 */
@Injectable({ providedIn: 'root' })
export class StructureStoreService {
  list(): SavedStructure[] {
    try {
      const rows = JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedStructure[];
      return Array.isArray(rows) ? rows.filter((r) => r && r.id && r.document) : [];
    } catch {
      return [];
    }
  }

  /** Save as a new entry, or over the entry with this id. Returns the id, or null when the browser refused. */
  save(structure: Structure, id: string | null): string | null {
    const rows = this.list();
    const row: SavedStructure = {
      id: id ?? `s${Date.now().toString(36)}`,
      name: structure.name,
      kind: structure.template?.kind ?? 'free',
      savedAt: new Date().toISOString(),
      document: structure,
    };
    const next = [row, ...rows.filter((r) => r.id !== row.id)].slice(0, 50);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      return row.id;
    } catch {
      return null;
    }
  }

  /** The saved document, checked again on the way in. */
  load(id: string): Structure | null {
    const row = this.list().find((r) => r.id === id);
    if (!row) return null;
    try {
      return parseStructure(JSON.stringify(row.document));
    } catch {
      return null;
    }
  }

  remove(id: string): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.list().filter((r) => r.id !== id)));
    } catch {
      /* nothing to do: the entry stays */
    }
  }
}
