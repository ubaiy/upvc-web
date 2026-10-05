/**
 * 3D structures — the saved domes, cabins, bays and roofs (card T114). The
 * designer (/structure-designer) opens from here and Save comes back here.
 * This page draws no 3D: the picture of each card was made when it was saved.
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { switchMap } from 'rxjs';
import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { renameStructure, templateOf } from '../../shared/structure-model';
import { StructureStore, StructureSummary } from '../structure-designer/structure-store.service';

type Ask = { kind: 'rename' | 'delete'; row: StructureSummary };

@Component({
  selector: 'app-structures-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SharedComponentsModule],
  templateUrl: './structures-list.component.html',
  styleUrls: ['./structures-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructuresListComponent implements OnInit {
  state: 'loading' | 'ready' | 'error' = 'loading';
  rows: StructureSummary[] = [];
  /** The open dialog: a new name, or the confirmation of a delete. */
  ask: Ask | null = null;
  nameDraft = '';
  problem = '';

  constructor(private readonly store: StructureStore, private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.store.list().subscribe({
      next: (rows) => {
        this.rows = rows;
        this.state = 'ready';
        this.cdr.markForCheck();
      },
      error: () => {
        this.state = 'error';
        this.cdr.markForCheck();
      },
    });
  }

  kindLabel(row: StructureSummary): string {
    return templateOf(row.kind)?.label ?? 'Structure';
  }

  /** The copy is a new structure with the same document and picture. */
  duplicate(row: StructureSummary): void {
    this.store
      .get(row.id)
      .pipe(switchMap((saved) => this.store.save({ id: null, document: renameStructure(saved.document, copyName(row.name, this.rows)), thumbnail: saved.thumbnail })))
      .subscribe(this.done());
  }

  askRename(row: StructureSummary): void {
    this.ask = { kind: 'rename', row };
    this.nameDraft = row.name;
    this.problem = '';
  }

  askDelete(row: StructureSummary): void {
    this.ask = { kind: 'delete', row };
    this.problem = '';
  }

  cancel(): void {
    this.ask = null;
  }

  rename(): void {
    const ask = this.ask;
    const name = this.nameDraft.trim();
    if (!ask || ask.kind !== 'rename') return;
    if (!name) {
      this.problem = 'Give the structure a name.';
      this.cdr.markForCheck();
      return;
    }
    if (name === ask.row.name) return this.cancel();
    this.store
      .get(ask.row.id)
      .pipe(switchMap((saved) => this.store.save({ id: saved.id, document: renameStructure(saved.document, name), thumbnail: saved.thumbnail })))
      .subscribe(this.done());
  }

  remove(): void {
    const ask = this.ask;
    if (!ask || ask.kind !== 'delete') return;
    this.store.delete(ask.row.id).subscribe(this.done());
  }

  private done(): { next: () => void; error: (e: Error) => void } {
    return {
      next: () => {
        this.ask = null;
        this.problem = '';
        this.load();
      },
      error: (e: Error) => {
        this.problem = e.message;
        this.cdr.markForCheck();
      },
    };
  }

  trackRow = (_: number, row: StructureSummary): string => row.id;
}

/** "Dome copy", then "Dome copy 2": never a name the list already has. */
function copyName(name: string, rows: StructureSummary[]): string {
  const taken = new Set(rows.map((r) => r.name));
  const base = `${name.replace(/ copy( \d+)?$/, '')} copy`.slice(0, 76);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}
