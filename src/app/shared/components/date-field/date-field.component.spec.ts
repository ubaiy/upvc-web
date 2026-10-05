import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { SharedComponentsModule } from '../shared-components.module';
import { displayToIso, isoToDisplay } from './date-field.component';

@Component({
  template: `<app-date-field inputId="d" name="d" [(ngModel)]="value" min="2026-01-01"></app-date-field>
    <app-date-field inputId="plain" [date]="plain" (dateChange)="plain = $event"></app-date-field>`,
})
class HostComponent {
  value = '2026-10-05';
  plain = '';
}

describe('date field', () => {
  let fixture: ComponentFixture<HostComponent>;
  const box = (id = 'd'): HTMLInputElement => fixture.nativeElement.querySelector('#' + id);

  function type(text: string, id = 'd'): void {
    box(id).value = text;
    box(id).dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ declarations: [HostComponent], imports: [FormsModule, SharedComponentsModule] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('turns a date both ways and refuses a day that does not exist', () => {
    expect(isoToDisplay('2026-10-05')).toBe('05/10/2026');
    expect(isoToDisplay('2026-10-05T00:00:00Z')).toBe('05/10/2026');
    expect(isoToDisplay('')).toBe('');
    expect(displayToIso('05/10/2026')).toBe('2026-10-05');
    expect(displayToIso('5-1-2026')).toBe('2026-01-05');
    expect(displayToIso('31/02/2026')).toBe('');
    expect(displayToIso('05/10/26')).toBe('');
  });

  it('shows the value as dd/mm/yyyy in a text box, never a native date box', () => {
    expect(box().value).toBe('05/10/2026');
    expect(box().type).toBe('text');
    expect(box().placeholder).toBe('dd/mm/yyyy');
    expect(fixture.nativeElement.querySelector('input[type="date"]').getAttribute('tabindex')).toBe('-1');
  });

  it('gives the form yyyy-mm-dd once the date is complete, and puts the slashes in', () => {
    type('2511');
    expect(box().value).toBe('25/11');
    expect(fixture.componentInstance.value).toBe('2026-10-05');
    type('25112026');
    expect(box().value).toBe('25/11/2026');
    expect(fixture.componentInstance.value).toBe('2026-11-25');
  });

  it('keeps the old value when the user leaves a half-typed date, and empties it when the box is cleared', () => {
    type('25/1');
    box().dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(box().value).toBe('05/10/2026');
    expect(fixture.componentInstance.value).toBe('2026-10-05');
    type('');
    expect(fixture.componentInstance.value).toBe('');
  });

  it('works without a form, and takes a day picked from the calendar', () => {
    type('01/02/2026', 'plain');
    expect(fixture.componentInstance.plain).toBe('2026-02-01');
    const native = fixture.nativeElement.querySelectorAll('input[type="date"]')[1] as HTMLInputElement;
    native.value = '2026-03-09';
    native.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.plain).toBe('2026-03-09');
    expect(box('plain').value).toBe('09/03/2026');
  });
});
