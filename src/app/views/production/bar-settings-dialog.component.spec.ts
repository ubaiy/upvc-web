import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import { AccessState } from '../../shared/access/access.models';
import { AccessService } from '../../shared/access/access.service';
import { me, subscription } from '../../shared/access/access.spec';
import { BarSettingsDialogComponent } from './bar-settings-dialog.component';
import { BarSettings, BarSettingsAnswer } from './production.model';
import { ProductionService } from './production.service';

const SETTINGS: BarSettings = { bar_mm: 6000, steel_bar_mm: 6100, blade_mm: 5.7, end_trim_mm: 25, min_offcut_mm: 400 };
const DEFAULTS: BarSettings = { bar_mm: 5800, steel_bar_mm: 6000, blade_mm: 6, end_trim_mm: 20, min_offcut_mm: 500 };
const ANSWER: BarSettingsAnswer = { settings: SETTINGS, defaults: DEFAULTS };

describe('BarSettingsDialogComponent', () => {
  let fixture: ComponentFixture<BarSettingsDialogComponent>;
  let component: BarSettingsDialogComponent;
  let service: jasmine.SpyObj<ProductionService>;
  let saved: BarSettingsAnswer[];
  let closed: boolean[];
  const field = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
  const text = (): string => (document.body.textContent || '').replace(/\s+/g, ' ');
  const button = (label: string): HTMLButtonElement =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('.p-dialog button')).find((b) => (b.textContent || '').includes(label))!;
  const type = (id: string, value: string) => {
    field(id).value = value;
    field(id).dispatchEvent(new Event('input'));
  };

  function open(): void {
    component.visible = true;
    component.ngOnChanges({ visible: new SimpleChange(false, true, false) });
    fixture.detectChanges();
  }

  async function create(state?: AccessState): Promise<void> {
    service = jasmine.createSpyObj<ProductionService>('ProductionService', ['getBarSettings', 'saveBarSettings']);
    service.getBarSettings.and.returnValue(of(ANSWER));
    await TestBed.configureTestingModule({
      imports: [BarSettingsDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: ProductionService, useValue: service },
        ...(state ? [{ provide: AccessService, useValue: { state$: new BehaviorSubject(state), get state() { return state; } } }] : []),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BarSettingsDialogComponent);
    component = fixture.componentInstance;
    saved = [];
    closed = [];
    component.saved.subscribe((answer) => saved.push(answer));
    component.visibleChange.subscribe((value) => closed.push(value));
  }

  describe('for someone who may change the settings', () => {
    beforeEach(async () => create());

    it('asks the api for the current values when it opens and shows them in four fields', () => {
      open();
      expect(service.getBarSettings).toHaveBeenCalledTimes(1);
      expect(field('bs-bar').value).toBe('6000');
      expect(field('bs-blade').value).toBe('5.7');
      expect(field('bs-trim').value).toBe('25');
      expect(field('bs-offcut').value).toBe('400');
      expect(document.querySelector('.p-dialog-title')?.textContent).toContain('Bar settings');
    });

    it('says in one line what each number is, the standard value beside it, and when a job takes it up', () => {
      open();
      const lines = Array.from(document.querySelectorAll('.field .hint')).map((hint) => (hint.textContent || '').replace(/\s+/g, ' ').trim());
      expect(lines.length).toBe(5);
      expect(lines[0]).toContain('Used for a profile that has no bar length of its own.');
      expect(lines[0]).toContain('Standard: 5800 mm.');
      expect(lines[1]).toContain('Used for steel reinforcement.');
      expect(lines[1]).toContain('Standard: 6000 mm.');
      expect(lines[2]).toContain('What one cut takes out of the bar. A 4 mm blade at 45° takes about 5.7 mm.');
      expect(lines[2]).toContain('Standard: 6 mm.');
      expect(lines[3]).toContain('Trimmed from each end of a bar.');
      expect(lines[4]).toContain('A leftover this long or longer is kept as an offcut; a shorter one is waste.');
      expect(text()).toContain('New jobs use these. A job already made keeps its numbers until you refresh it.');
    });

    it('leaves the standard values out of the help when the api sent none', () => {
      service.getBarSettings.and.returnValue(of({ settings: SETTINGS, defaults: null }));
      open();
      expect(text()).not.toContain('Standard:');
    });

    it('keeps the fields and Save off while the values load', () => {
      const pending = new Subject<BarSettingsAnswer>();
      service.getBarSettings.and.returnValue(pending);
      open();
      expect(component.loading).toBeTrue();
      expect(field('bs-bar').disabled).toBeTrue();
      expect(button('Save').disabled).toBeTrue();
      expect(document.querySelector('[role="status"]')?.textContent).toContain('Loading the bar settings');
      pending.next(ANSWER);
      fixture.detectChanges();
      expect(component.loading).toBeFalse();
      expect(field('bs-bar').disabled).toBeFalse();
      expect(button('Save').disabled).toBeFalse();
    });

    it('says why the values could not be loaded, and tries again', () => {
      service.getBarSettings.and.returnValue(throwError(() => new Error('We could not reach the server. Check your connection.')));
      open();
      expect(document.querySelector('.p-dialog [role="alert"]')?.textContent).toContain('We could not reach the server. Check your connection.');
      expect(button('Save').disabled).toBeTrue();
      service.getBarSettings.and.returnValue(of(ANSWER));
      button('Try again').click();
      fixture.detectChanges();
      expect(field('bs-bar').value).toBe('6000');
      expect(document.querySelector('.p-dialog [role="alert"]')).toBeNull();
      expect(button('Save').disabled).toBeFalse();
    });

    it('saves the five numbers as typed, tells the page and closes', () => {
      service.saveBarSettings.and.returnValue(of({ settings: { bar_mm: 6100, steel_bar_mm: 6000, blade_mm: 4, end_trim_mm: 0, min_offcut_mm: 300 }, defaults: DEFAULTS }));
      open();
      type('bs-bar', '6100');
      type('bs-steel', '6000');
      type('bs-blade', '4');
      type('bs-trim', '0');
      type('bs-offcut', '300');
      component.submit();
      expect(service.saveBarSettings).toHaveBeenCalledOnceWith({ bar_mm: 6100, steel_bar_mm: 6000, blade_mm: 4, end_trim_mm: 0, min_offcut_mm: 300 });
      expect(saved.length).toBe(1);
      expect(saved[0].settings.bar_mm).toBe(6100);
      expect(component.visible).toBeFalse();
      expect(closed).toEqual([false]);
    });

    it('saves with the Save button', () => {
      service.saveBarSettings.and.returnValue(of(ANSWER));
      open();
      button('Save').click();
      expect(service.saveBarSettings).toHaveBeenCalledOnceWith(SETTINGS);
    });

    it("shows the api's refusal inside the dialog, which stays open with what was typed", () => {
      service.saveBarSettings.and.returnValue(throwError(() => new Error('The bar length must be 500 to 20000 mm.')));
      open();
      type('bs-bar', '9000');
      component.submit();
      fixture.detectChanges();
      expect(document.querySelector('.p-dialog [role="alert"]')?.textContent).toContain('The bar length must be 500 to 20000 mm.');
      expect(component.visible).toBeTrue();
      expect(component.saving).toBeFalse();
      expect(field('bs-bar').value).toBe('9000');
      expect(saved).toEqual([]);
      expect(closed).toEqual([]);
    });

    it('clears the refusal when the next save goes through', () => {
      service.saveBarSettings.and.returnValue(throwError(() => new Error('The blade must be 0 to 20 mm.')));
      open();
      component.submit();
      fixture.detectChanges();
      expect(component.error).toBe('The blade must be 0 to 20 mm.');
      service.saveBarSettings.and.returnValue(of(ANSWER));
      component.submit();
      expect(component.error).toBe('');
    });

    it('sends nothing, and says which number is wrong, for a value outside what the api takes', () => {
      open();
      const said: Record<string, string> = {
        'bs-bar': 'Enter a whole number of mm from 500 to 20000.',
        'bs-blade': 'Enter a number of mm from 0 to 20.',
        'bs-trim': 'Enter a number of mm from 0 to 200.',
        'bs-offcut': 'Enter a whole number of mm from 0 to 6000.',
      };
      for (const [id, value] of [
        ['bs-bar', '100'],
        ['bs-bar', '25000'],
        ['bs-bar', '5800.5'],
        ['bs-bar', ''],
        ['bs-blade', '21'],
        ['bs-blade', 'abc'],
        ['bs-trim', '201'],
        ['bs-offcut', '6001'],
        ['bs-offcut', '1.5'],
      ]) {
        type('bs-bar', '6000');
        type('bs-blade', '5.7');
        type('bs-trim', '25');
        type('bs-offcut', '400');
        type(id, value);
        component.submit();
        fixture.detectChanges();
        expect(service.saveBarSettings).withContext(`${id} = "${value}"`).not.toHaveBeenCalled();
        expect(text()).withContext(`${id} = "${value}"`).toContain(said[id]);
        expect(field(id).getAttribute('aria-invalid')).toBe('true');
      }
      expect(component.visible).toBeTrue();
    });

    it('takes the edges of what the api takes', () => {
      service.saveBarSettings.and.returnValue(of(ANSWER));
      open();
      type('bs-bar', '500');
      type('bs-steel', '20000');
      type('bs-blade', '20');
      type('bs-trim', '200');
      type('bs-offcut', '6000');
      component.submit();
      expect(service.saveBarSettings).toHaveBeenCalledOnceWith({ bar_mm: 500, steel_bar_mm: 20000, blade_mm: 20, end_trim_mm: 200, min_offcut_mm: 6000 });
    });

    it('does not save twice while the first save is on its way, and cannot be closed meanwhile', () => {
      service.saveBarSettings.and.returnValue(new Subject<BarSettingsAnswer>());
      open();
      component.submit();
      component.submit();
      expect(service.saveBarSettings).toHaveBeenCalledTimes(1);
      expect(component.saving).toBeTrue();
      component.close();
      expect(component.visible).toBeTrue();
    });

    it('closes with Cancel and saves nothing', () => {
      open();
      button('Cancel').click();
      expect(component.visible).toBeFalse();
      expect(closed).toEqual([false]);
      expect(service.saveBarSettings).not.toHaveBeenCalled();
    });

    it('starts again from the api when it is opened a second time', () => {
      service.saveBarSettings.and.returnValue(throwError(() => new Error('refused')));
      open();
      type('bs-bar', '9999');
      component.submit();
      component.close();
      component.visible = false;
      component.ngOnChanges({ visible: new SimpleChange(true, false, false) });
      service.getBarSettings.and.returnValue(of({ settings: { ...SETTINGS, bar_mm: 6200 }, defaults: DEFAULTS }));
      open();
      expect(service.getBarSettings).toHaveBeenCalledTimes(2);
      expect(component.error).toBe('');
      expect(field('bs-bar').value).toBe('6200');
    });

    it('names its close button for screen readers', () => {
      open();
      expect(document.querySelector('.p-dialog-header-close')?.getAttribute('aria-label')).toBe('Close');
    });
  });

  it('shows Save only to someone with production.write', async () => {
    const withoutWrite: AccessState = { me: me(['production.view'], 'viewer', 'viewer'), subscription: subscription({}) };
    await create(withoutWrite);
    open();
    expect(button('Save').hasAttribute('hidden')).toBeTrue();
    expect(button('Cancel')).toBeDefined();
  });
});
