import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SharedComponentsModule } from '../shared-components.module';

@Component({
  template: `
    <table class="table" id="list">
      <thead>
        <tr>
          <th scope="col" class="col-check"><input type="checkbox" aria-label="Select all" /></th>
          <th scope="col">Quotation</th>
          <th scope="col">Status</th>
          <th scope="col" class="right">Total <span class="sr-only">, sorted</span></th>
          <th scope="col"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let row of rows">
          <td class="col-check"><input type="checkbox" [attr.aria-label]="'Select ' + row" /></td>
          <td>{{ row }}</td>
          <td data-label="State">Draft</td>
          <td class="right">₹100.00</td>
          <td class="row-actions"><button type="button">More</button></td>
        </tr>
        <tr *ngIf="!rows.length"><td colspan="5">No quotations match.</td></tr>
      </tbody>
    </table>
    <table class="table table-keep" id="kept">
      <thead><tr><th>Name</th><th>Rate</th></tr></thead>
      <tbody><tr><td>Sash</td><td>₹191.90</td></tr></tbody>
    </table>
  `,
})
class HostComponent {
  rows = ['Q-0001', 'Q-0002'];
}

describe('TableLabelsDirective (row cards on a phone)', () => {
  let fixture: ComponentFixture<HostComponent>;
  const labels = (selector: string) =>
    [...fixture.nativeElement.querySelectorAll(selector)].map((cell: Element) => cell.getAttribute('data-label'));
  /** The directive relabels after the DOM changes, one microtask later. */
  const settle = async () => {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [HostComponent], imports: [SharedComponentsModule] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('copies each column heading onto the cells under it', () => {
    // tick box, the row's title, a label the screen wrote itself, the heading without its screen-reader text, the row menu
    expect(labels('#list tbody tr:first-child td')).toEqual([null, null, 'State', 'Total', null]);
  });

  it('labels rows that arrive later and leaves a spanning row alone', async () => {
    fixture.componentInstance.rows = ['Q-0003', 'Q-0004', 'Q-0005'];
    await settle();
    expect(labels('#list tbody tr:last-child td')).toEqual([null, null, 'State', 'Total', null]);

    fixture.componentInstance.rows = [];
    await settle();
    expect(labels('#list tbody td')).toEqual([null]);
  });

  it('does nothing to a table that keeps its columns', () => {
    expect(labels('#kept tbody td')).toEqual([null, null]);
  });
});
