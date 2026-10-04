import { Component } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';

import { RowSelection } from '../components/bulk-bar/row-selection';
import { SharedComponentsModule } from '../components/shared-components.module';
import { UndoService } from './undo.service';

@Component({
  template: `
    <app-undo-toast></app-undo-toast>
    <input id="field" />
    <app-bulk-bar *ngIf="count" [count]="count" noun="quotation" (cleared)="count = 0">
      <button actions type="button">Mark as sent</button>
    </app-bulk-bar>
  `,
})
class HostComponent {
  count = 0;
}

describe('undo instead of confirm', () => {
  let fixture: ComponentFixture<HostComponent>;
  let undo: UndoService;
  let rows: string[];
  let sent: string[];

  const toast = (): HTMLElement | null => fixture.nativeElement.querySelector('.undo-toast');

  /** The screen's side: the row leaves the list at once; the request waits for the toast. */
  const remove = (row: string) => {
    rows = rows.filter((r) => r !== row);
    undo.offer({ message: `${row} deleted`, commit: () => sent.push(row), undo: () => rows.push(row), life: 1000 });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [HostComponent], imports: [SharedComponentsModule] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    undo = TestBed.inject(UndoService);
    rows = ['Q-0001', 'Q-0002'];
    sent = [];
    fixture.detectChanges();
  });

  afterEach(() => undo.flush());

  it('shows what happened with an Undo button, in a live region that was there before', () => {
    const live = fixture.nativeElement.querySelector('[role="status"][aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(toast()).toBeNull();

    remove('Q-0001');
    expect(rows).toEqual(['Q-0002']);
    expect(live.contains(toast())).toBeTrue();
    expect(toast()?.textContent).toContain('Q-0001 deleted');
    expect(toast()?.querySelector('.toast-action')?.textContent?.trim()).toBe('Undo');
    expect(toast()?.querySelector('.toast-close')?.getAttribute('aria-label')).toBe('Dismiss');
    expect(sent).withContext('nothing is sent while Undo is on offer').toEqual([]);
  });

  it('Undo puts the row back and sends nothing', fakeAsync(() => {
    remove('Q-0001');
    (toast()?.querySelector('.toast-action') as HTMLElement).click();
    fixture.detectChanges();
    expect(rows).toEqual(['Q-0002', 'Q-0001']);
    expect(toast()).toBeNull();
    tick(2000);
    expect(sent).toEqual([]);
  }));

  it('commits when the toast runs out, once', fakeAsync(() => {
    remove('Q-0001');
    tick(999);
    expect(sent).toEqual([]);
    tick(1);
    fixture.detectChanges();
    expect(sent).toEqual(['Q-0001']);
    expect(toast()).toBeNull();
    undo.undo();
    undo.flush();
    expect(sent).toEqual(['Q-0001']);
    expect(rows).toEqual(['Q-0002']);
  }));

  it('a second action commits the first; closing the toast commits at once', fakeAsync(() => {
    remove('Q-0001');
    remove('Q-0002');
    expect(sent).toEqual(['Q-0001']);
    expect(toast()?.textContent).toContain('Q-0002 deleted');

    (toast()?.querySelector('.toast-close') as HTMLElement).click();
    expect(sent).toEqual(['Q-0001', 'Q-0002']);
    tick(2000);
  }));

  it('the clock stops while the pointer is on the toast', fakeAsync(() => {
    remove('Q-0001');
    toast()?.dispatchEvent(new Event('mouseenter'));
    tick(5000);
    expect(sent).toEqual([]);
    toast()?.dispatchEvent(new Event('mouseleave'));
    tick(1000);
    expect(sent).toEqual(['Q-0001']);
  }));

  it('Ctrl Z undoes, but not while typing in a field', fakeAsync(() => {
    remove('Q-0001');
    const key = () => new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true });
    fixture.nativeElement.querySelector('#field').dispatchEvent(key());
    expect(rows).toEqual(['Q-0002']);
    document.body.dispatchEvent(key());
    expect(rows).toEqual(['Q-0002', 'Q-0001']);
    tick(2000);
    expect(sent).toEqual([]);
  }));

  it('leaving the page commits what is pending', () => {
    remove('Q-0001');
    window.dispatchEvent(new Event('pagehide'));
    expect(sent).toEqual(['Q-0001']);
  });
});

describe('bulk selection', () => {
  interface Row {
    id: number;
    name: string;
  }
  const rows: Row[] = [1, 2, 3].map((id) => ({ id, name: `Q-000${id}` }));

  it('RowSelection ticks rows by key, all at once, and forgets rows that have gone', () => {
    const selection = new RowSelection<Row>((row) => row.id);
    expect(selection.isEmpty).toBeTrue();
    expect(selection.allSelected([])).toBeFalse();

    selection.toggle(rows[0]);
    expect(selection.isSelected({ id: 1, name: 'reloaded copy' })).toBeTrue();
    expect(selection.someSelected(rows)).toBeTrue();
    expect(selection.allSelected(rows)).toBeFalse();

    selection.toggleAll(rows);
    expect(selection.count).toBe(3);
    expect(selection.allSelected(rows)).toBeTrue();
    expect(selection.someSelected(rows)).toBeFalse();
    expect(selection.selected(rows).map((row) => row.name)).toEqual(['Q-0001', 'Q-0002', 'Q-0003']);

    selection.keep(rows.slice(1));
    expect(selection.count).toBe(2);

    selection.toggleAll(rows.slice(1));
    expect(selection.isEmpty).toBeTrue();
  });

  it('the bar says how many are ticked, holds the actions and clears', async () => {
    await TestBed.configureTestingModule({ declarations: [HostComponent], imports: [SharedComponentsModule] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.bulk-bar')).toBeNull();

    fixture.componentInstance.count = 1;
    fixture.detectChanges();
    const bar: HTMLElement = fixture.nativeElement.querySelector('.bulk-bar');
    expect(bar.querySelector('.bulk-count')?.textContent?.trim()).toBe('1 quotation selected');
    expect(bar.querySelector('.bulk-actions button')?.textContent).toBe('Mark as sent');

    fixture.componentInstance.count = 3;
    fixture.detectChanges();
    expect(bar.querySelector('.bulk-count')?.textContent?.trim()).toBe('3 quotations selected');

    (bar.querySelector('.btn-ghost') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.bulk-bar')).toBeNull();
  });
});
