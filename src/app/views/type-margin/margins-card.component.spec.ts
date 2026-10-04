import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { ToastService } from 'src/app/shared/services/toast.service';
import { MarginsCardComponent } from './margins-card.component';
import { TypeMarginService } from './type-margin.service';

const MARGINS = [
  { id: 1, name: 'Retail', pricing: 'MRP', mark_up: '20' },
  { id: 2, name: 'Dealer', pricing: 'Cost', mark_up: '10' },
];

describe('MarginsCardComponent', () => {
  let fixture: ComponentFixture<MarginsCardComponent>;
  let component: MarginsCardComponent;
  let service: jasmine.SpyObj<TypeMarginService>;
  let toast: jasmine.SpyObj<ToastService>;
  let el: HTMLElement;

  function create(list: any = { success: true, data: MARGINS }) {
    service = jasmine.createSpyObj('TypeMarginService', ['getTypeMarginList', 'addTypeMargin', 'editTypeMargin', 'deleteTypeMarginDetail']);
    service.getTypeMarginList.and.returnValue(list.subscribe ? list : of(list));
    service.addTypeMargin.and.returnValue(of({ success: true } as any));
    service.editTypeMargin.and.returnValue(of({ success: true } as any));
    service.deleteTypeMarginDetail.and.returnValue(of({ success: true } as any));
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    TestBed.configureTestingModule({
      imports: [MarginsCardComponent, NoopAnimationsModule],
      providers: [
        { provide: TypeMarginService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(MarginsCardComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  it('lists each margin as a name and a percentage', () => {
    create();
    const rows = Array.from(el.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td'))
        .slice(0, 2)
        .map((td) => (td.textContent ?? '').trim())
    );
    expect(rows).toEqual([
      ['Retail', '20%'],
      ['Dealer', '10%'],
    ]);
  });

  it('names every row button for screen readers', () => {
    create();
    const labels = Array.from(el.querySelectorAll('tbody button')).map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['Edit Retail', 'Delete Retail', 'Edit Dealer', 'Delete Dealer']);
  });

  it('shows an empty state with the add button when there are none', () => {
    create({ success: true, data: [] });
    expect(el.textContent).toContain('No margins yet');
    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelectorAll('button').length).toBe(1);
  });

  it('shows an inline error with "Try again" when the list fails', () => {
    create(throwError(() => new Error('offline')));
    expect(el.querySelector('.callout')?.textContent).toContain('We could not load your margins');
    service.getTypeMarginList.and.returnValue(of({ success: true, data: MARGINS } as any));
    (el.querySelector('.callout button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('adds a margin from two fields and sends no pricing note', () => {
    create();
    component.open();
    component.form.setValue({ name: ' Builder ', mark_up: '15.5' });
    component.save();
    expect(service.addTypeMargin).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'Builder', mark_up: '15.5' }));
    expect('pricing' in service.addTypeMargin.calls.mostRecent().args[0]).toBeFalse();
    expect(component.dialogOpen).toBeFalse();
    expect(toast.showSuccess).toHaveBeenCalledWith('Margin added');
    expect(service.getTypeMarginList).toHaveBeenCalledTimes(2);
  });

  it('leaves the stored pricing note to the api when a margin is edited', () => {
    create();
    component.open(MARGINS[1] as any);
    component.form.patchValue({ mark_up: '12' });
    component.save();
    expect(service.editTypeMargin).toHaveBeenCalledWith(jasmine.objectContaining({ id: 2, mark_up: '12' }));
    expect('pricing' in service.editTypeMargin.calls.mostRecent().args[0]).toBeFalse();
  });

  it('does not send an empty name or a margin outside 0 to 1000', () => {
    create();
    component.open();
    component.form.setValue({ name: '', mark_up: '1001' });
    component.save();
    expect(service.addTypeMargin).not.toHaveBeenCalled();
    expect(component.invalid('name') && component.invalid('mark_up')).toBeTrue();
  });

  it('keeps the dialog open and shows the reason when the API refuses', () => {
    create();
    service.addTypeMargin.and.returnValue(of({ status: 0, message: 'name field is required' } as any));
    component.open();
    component.form.setValue({ name: 'X', mark_up: '5' });
    component.save();
    expect(component.dialogOpen).toBeTrue();
    expect(component.saveError).toBe('name field is required');
  });

  it('deletes after a confirmation', () => {
    create();
    component.remove(MARGINS[0] as any);
    fixture.detectChanges();
    const dialog = el.querySelector('app-confirm-dialog')!;
    expect(dialog.textContent).toContain('Delete "Retail"?');
    const buttons = Array.from(dialog.querySelectorAll('button')).map((b) => b.textContent!.trim());
    expect(buttons).toEqual(['Keep it', 'Delete margin']);
    expect(service.deleteTypeMarginDetail).not.toHaveBeenCalled();
    (dialog.querySelector('.btn-danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(service.deleteTypeMarginDetail).toHaveBeenCalledWith(1);
    expect(toast.showSuccess).toHaveBeenCalledWith('Margin deleted');
    expect(el.querySelector('app-confirm-dialog')).toBeNull();
  });

  it('keeps the margin on "Keep it", and shows a refusal in the dialog', () => {
    create();
    component.remove(MARGINS[0] as any);
    fixture.detectChanges();
    (el.querySelector('app-confirm-dialog .btn-secondary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('app-confirm-dialog')).toBeNull();
    expect(service.deleteTypeMarginDetail).not.toHaveBeenCalled();

    service.deleteTypeMarginDetail.and.returnValue(of({ success: false, message: 'Margin is used by 3 quotations' } as any));
    component.remove(MARGINS[0] as any);
    component.confirmRemove();
    fixture.detectChanges();
    expect(el.querySelector('app-confirm-dialog [role="alert"]')?.textContent).toContain('Margin is used by 3 quotations');
  });

  it('names the close button of its dialog and puts the focus in the first field', () => {
    create();
    expect(el.querySelector('#margin-name') ?? document.querySelector('#margin-name')).toBeDefined();
    component.dialogOpen = true;
    fixture.detectChanges();
    expect(document.querySelector('#margin-name')?.hasAttribute('autofocus')).toBeTrue();
    expect(document.querySelector('.p-dialog-header-close')?.getAttribute('aria-label')).toBe('Close');
    component.dialogOpen = false;
    fixture.detectChanges();
  });
});
