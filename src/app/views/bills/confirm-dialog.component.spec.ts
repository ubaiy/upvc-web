import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { ConfirmDialogComponent } from './confirm-dialog.component';

@Component({
  template: `
    <app-confirm-dialog
      *ngIf="open"
      title="Create the bill for Q-0011?"
      text="A tax invoice is issued."
      confirmLabel="Create bill"
      keepLabel="Not now"
      [busy]="busy"
      [error]="error"
      (confirmed)="confirmed = confirmed + 1"
      (closed)="open = false"
    >
      <p class="detail">Total ₹35,456.00</p>
    </app-confirm-dialog>
  `,
})
class HostComponent {
  open = true;
  busy = false;
  error = '';
  confirmed = 0;
}

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const el = (): HTMLElement => fixture.nativeElement;
  const button = (label: string): HTMLButtonElement =>
    (Array.from(el().querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes(label))!;

  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [HostComponent], imports: [ConfirmDialogComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('is a named alert dialog with the question, the detail and two buttons', () => {
    const dialog = el().querySelector('[role="alertdialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(el().querySelector('#' + dialog.getAttribute('aria-labelledby'))?.textContent).toContain('Create the bill for Q-0011?');
    expect(dialog.textContent).toContain('A tax invoice is issued.');
    expect(dialog.textContent).toContain('Total ₹35,456.00');
    expect(button('Create bill').classList).toContain('btn-primary');
  });

  it('puts the focus on the safe button', fakeAsync(() => {
    fixture.destroy();
    fixture = TestBed.createComponent(HostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    tick();
    expect(document.activeElement).toBe(button('Not now'));
    fixture.nativeElement.remove();
  }));

  it('confirms once and closes by its button, the backdrop or Escape', () => {
    button('Create bill').click();
    expect(host.confirmed).toBe(1);
    expect(host.open).toBeTrue();

    button('Not now').click();
    fixture.detectChanges();
    expect(el().querySelector('app-confirm-dialog')).toBeNull();

    host.open = true;
    fixture.detectChanges();
    (el().querySelector('.backdrop') as HTMLElement).click();
    fixture.detectChanges();
    expect(host.open).toBeFalse();

    host.open = true;
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(host.open).toBeFalse();
  });

  it("waits while the request runs and shows the api's refusal", () => {
    host.busy = true;
    host.error = 'Quotation is already billed';
    fixture.detectChanges();
    expect(button('Working…').disabled).toBeTrue();
    expect(button('Not now').disabled).toBeTrue();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    (el().querySelector('.backdrop') as HTMLElement).click();
    fixture.detectChanges();
    expect(host.open).toBeTrue();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Quotation is already billed');
  });
});
