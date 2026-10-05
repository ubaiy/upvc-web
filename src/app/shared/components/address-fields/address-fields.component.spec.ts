import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Observable, Subject, of, throwError } from 'rxjs';

import { CityOption, LocationService, PinLookup } from '../../services/location.service';
import { AddressFieldsComponent } from './address-fields.component';

const STATES = [
  { code: '24', name: 'Gujarat' },
  { code: '27', name: 'Maharashtra' },
];

const SURAT_PIN: PinLookup = {
  pincode: '395007',
  city: 'Surat',
  district: 'Surat',
  stateCode: '24',
  stateName: 'Gujarat',
  localities: ['Adajan', 'Athwalines', 'Bhatar', 'Piplod', 'Umra', 'Vesu', 'City Light', 'Ghod Dod Road'],
};

const MUMBAI_PIN: PinLookup = {
  pincode: '400050',
  city: 'Mumbai',
  district: 'Mumbai Suburban',
  stateCode: '27',
  stateName: 'Maharashtra',
  localities: ['Bandra West'],
};

const SURAT: CityOption = { city: 'Surat', district: 'Surat', stateCode: '24', pincodes: ['395001', '395007', '395009'] };
const DAHOD: CityOption = { city: 'Dahod', district: 'Dahod', stateCode: '24', pincodes: ['389151'] };

@Component({
  template: `
    <form class="form-grid" [formGroup]="group">
      <app-address-fields
        [group]="group"
        [states]="states"
        idSuffix="-0"
        [submitted]="submitted"
        [stateWarning]="warning"
        [showState]="showState"
        [keepState]="keepState"
      >
        <div class="field span-2"><input id="line" formControlName="address" /></div>
        <div class="field span-2"><input id="area" formControlName="address_line2" /></div>
      </app-address-fields>
    </form>
  `,
})
class HostComponent {
  states = STATES;
  submitted = false;
  warning = '';
  showState = true;
  keepState = false;
  group: FormGroup = new FormBuilder().group({
    address: [''],
    address_line2: [''],
    city: [''],
    district: [''],
    state_code: ['24'],
    zip_code: [''],
  });
}

describe('AddressFieldsComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let location: { lookupPin: jasmine.Spy; cities: jasmine.Spy };

  const el = <T extends HTMLElement>(selector: string): T => fixture.nativeElement.querySelector(selector);
  const all = (selector: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(selector));
  const value = () => host.group.getRawValue();

  /** Types into a field the way a keyboard does: the value, then the input event. */
  function type(selector: string, text: string, wait = 400): void {
    const input = el<HTMLInputElement>(selector);
    input.value = text;
    input.dispatchEvent(new Event('input'));
    tick(wait);
    fixture.detectChanges();
  }

  function key(selector: string, name: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: name, cancelable: true, bubbles: true });
    el(selector).dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  beforeEach(async () => {
    location = {
      lookupPin: jasmine.createSpy('lookupPin').and.callFake((pin: string): Observable<PinLookup | null> => {
        if (pin === '395007') return of(SURAT_PIN);
        if (pin === '400050') return of(MUMBAI_PIN);
        if (pin === '389151') return of({ ...SURAT_PIN, pincode: '389151', city: 'Dahod', district: 'Dahod', localities: [] });
        if (pin === '395001') return of({ ...SURAT_PIN, pincode: '395001', localities: ['Nanpura', 'Station Road', 'Chowk', 'Gopipura'] });
        return of(null);
      }),
      cities: jasmine.createSpy('cities').and.returnValue(of([SURAT, DAHOD])),
    };
    await TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [ReactiveFormsModule, AddressFieldsComponent],
      providers: [{ provide: LocationService, useValue: location }],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('puts the PIN code first, with a numeric keypad, then the address lines, then city and state', () => {
    const order = all('input, select').map((field) => field.id);
    expect(order).toEqual(['addr-pin-0', 'line', 'area', 'addr-city-0', 'addr-state-0']);
    const pin = el<HTMLInputElement>('#addr-pin-0');
    expect(pin.getAttribute('inputmode')).toBe('numeric');
    expect(pin.maxLength).toBe(6);
    expect(fixture.nativeElement.querySelector('label[for="addr-pin-0"]').textContent).toContain('PIN code');
    expect(el('#addr-city-0').getAttribute('role')).toBe('combobox');
    expect(location.lookupPin).not.toHaveBeenCalled();
  });

  describe('PIN code', () => {
    it('looks the PIN up on the sixth digit and fills city, district and state', fakeAsync(() => {
      host.group.patchValue({ state_code: '27' });
      type('#addr-pin-0', '39500');
      expect(location.lookupPin).not.toHaveBeenCalled();

      type('#addr-pin-0', '395007');
      expect(location.lookupPin).toHaveBeenCalledOnceWith('395007');
      expect(value()).toEqual(jasmine.objectContaining({ zip_code: '395007', city: 'Surat', district: 'Surat', state_code: '24' }));
      expect(el('[data-af="found"]').textContent).toContain('Surat, Gujarat');
      expect(el('[role="status"].sr-only').textContent).toContain('PIN code 395007: Surat, Gujarat filled.');
      // The form must know the address changed, or it is not saved.
      expect(host.group.dirty).toBeTrue();
    }));

    it('keeps digits only', fakeAsync(() => {
      type('#addr-pin-0', '39 50-07x');
      expect(value().zip_code).toBe('395007');
      expect(location.lookupPin).toHaveBeenCalledOnceWith('395007');
    }));

    it('offers the areas under the PIN for the area line, six first', fakeAsync(() => {
      type('#addr-pin-0', '395007');
      const chips = all('.af-areas .af-chip');
      expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
        'Adajan',
        'Athwalines',
        'Bhatar',
        'Piplod',
        'Umra',
        'Vesu',
        'Show 2 more',
      ]);
      expect(value().address_line2).withContext('a suggestion, not a fill').toBe('');

      chips[0].click();
      fixture.detectChanges();
      expect(value().address_line2).toBe('Adajan');
      expect(all('.af-areas .af-chip')[0].getAttribute('aria-pressed')).toBe('true');

      chips[6].click();
      fixture.detectChanges();
      expect(all('.af-areas .af-chip').length).toBe(8);
    }));

    it('says plainly when the PIN is not in the directory, and leaves what was typed', fakeAsync(() => {
      host.group.patchValue({ city: 'Navagam', state_code: '24' });
      type('#addr-pin-0', '999999');
      expect(el('[data-af="unknown"]').textContent).toContain('This PIN is not in our list. Type the city and choose the state.');
      expect(value()).toEqual(jasmine.objectContaining({ zip_code: '999999', city: 'Navagam', state_code: '24' }));
      expect(host.group.valid).toBeTrue();
    }));

    it('does not block when the lookup fails, and tries again on the next edit', fakeAsync(() => {
      location.lookupPin.and.returnValue(throwError(() => ({ status: 0 })));
      type('#addr-pin-0', '395007');
      expect(el('[data-af="failed"]').textContent).toContain('We could not look up this PIN just now.');
      expect(value().zip_code).toBe('395007');
      expect(host.group.valid).toBeTrue();

      location.lookupPin.and.returnValue(of(SURAT_PIN));
      type('#addr-pin-0', '39500');
      type('#addr-pin-0', '395007');
      expect(value().city).toBe('Surat');
    }));

    it('drops the answer of a PIN that was changed while it was looked up', fakeAsync(() => {
      const slow = new Subject<PinLookup | null>();
      location.lookupPin.and.callFake((pin: string) => (pin === '395007' ? slow : of(MUMBAI_PIN)));
      type('#addr-pin-0', '395007');
      type('#addr-pin-0', '400050');
      expect(slow.observed).withContext('the stale lookup is cancelled').toBeFalse();
      slow.next(SURAT_PIN);
      fixture.detectChanges();
      expect(value()).toEqual(jasmine.objectContaining({ city: 'Mumbai', state_code: '27', district: 'Mumbai Suburban' }));
      expect(el('[data-af="found"]').textContent).toContain('Mumbai, Mumbai Suburban district, Maharashtra');
    }));

    it('does not look up an address that is only opened', () => {
      host.group.patchValue({ zip_code: '395007', city: '', state_code: '24' });
      fixture.detectChanges();
      expect(location.lookupPin).not.toHaveBeenCalled();
      expect(value().city).toBe('');
    });
  });

  describe('State', () => {
    it('follows the PIN; changed afterwards it asks nothing and says the two disagree', fakeAsync(() => {
      type('#addr-pin-0', '395007');
      expect(el('[data-af="mismatch"]')).toBeNull();

      const select = el<HTMLSelectElement>('#addr-state-0');
      select.value = '27';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(value()).toEqual(jasmine.objectContaining({ state_code: '27', city: 'Surat', zip_code: '395007' }));
      expect(el('[data-af="mismatch"]').textContent).toContain('PIN 395007 is in Gujarat, not Maharashtra.');

      select.value = '24';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(el('[data-af="mismatch"]')).toBeNull();
    }));

    it('shows the sentence of the api about the saved address, until the PIN or the state is changed', () => {
      host.group.patchValue({ zip_code: '400050', state_code: '24' });
      host.warning = 'PIN code 400050 is in Maharashtra (Mumbai) in the PIN code directory; the state given is Gujarat.';
      fixture.detectChanges();
      expect(el('[data-af="mismatch"]').textContent).toContain('PIN code 400050 is in Maharashtra (Mumbai)');

      const select = el<HTMLSelectElement>('#addr-state-0');
      select.value = '27';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(el('[data-af="mismatch"]')).withContext('it was about what was saved').toBeNull();
    });
  });

  describe('City', () => {
    it('suggests cities of the chosen state after two letters, debounced', fakeAsync(() => {
      type('#addr-city-0', 's', 400);
      expect(location.cities).not.toHaveBeenCalled();

      type('#addr-city-0', 'su', 100);
      type('#addr-city-0', 'sur', 400);
      expect(location.cities).toHaveBeenCalledOnceWith('24', 'sur');
      const options = all('[role="option"]');
      expect(options.length).toBe(2);
      expect(options[0].textContent).toContain('Surat');
      expect(options[0].textContent).toContain('3 PIN codes');
      expect(options[1].textContent).toContain('PIN 389151');
      expect(el('#addr-city-0').getAttribute('aria-expanded')).toBe('true');
      expect(el('#addr-city-0').getAttribute('aria-controls')).toBe('addr-city-0-list');
    }));

    it('picks with the keyboard: arrows move, Enter chooses, Escape closes', fakeAsync(() => {
      type('#addr-city-0', 'da');
      key('#addr-city-0', 'ArrowDown');
      key('#addr-city-0', 'ArrowDown');
      expect(el('#addr-city-0').getAttribute('aria-activedescendant')).toBe('addr-city-0-opt-1');
      expect(el('#addr-city-0-opt-1').getAttribute('aria-selected')).toBe('true');
      const enter = key('#addr-city-0', 'Enter');
      tick(400);
      fixture.detectChanges();
      expect(enter.defaultPrevented).withContext('Enter on a suggestion does not submit the form').toBeTrue();
      expect(value()).toEqual(jasmine.objectContaining({ city: 'Dahod', district: 'Dahod', zip_code: '389151' }));
      expect(all('[role="option"]').length).toBe(0);

      type('#addr-city-0', 'su');
      expect(all('[role="option"]').length).toBe(2);
      const escape = key('#addr-city-0', 'Escape');
      expect(all('[role="option"]').length).toBe(0);
      expect(escape.defaultPrevented).toBeTrue();
      expect(key('#addr-city-0', 'Enter').defaultPrevented).withContext('closed: Enter is the form’s').toBeFalse();
      tick(400);
    }));

    it('fills the PIN of a city that has one', fakeAsync(() => {
      type('#addr-city-0', 'da');
      all('[role="option"]')[1].click();
      tick(400);
      fixture.detectChanges();
      expect(value()).toEqual(jasmine.objectContaining({ city: 'Dahod', zip_code: '389151', state_code: '24' }));
      expect(el('.af-choices')).toBeNull();
    }));

    it('lists the PIN codes of a city that has several, with area names, and never picks one itself', fakeAsync(() => {
      type('#addr-city-0', 'su');
      all('[role="option"]')[0].click();
      tick(400);
      fixture.detectChanges();
      expect(value()).toEqual(jasmine.objectContaining({ city: 'Surat', district: 'Surat', zip_code: '' }));
      expect(el('.af-choices').textContent).toContain('Surat has 3 PIN codes. Choose one, or type it in PIN code.');
      const choices = all('.af-pin-choice');
      expect(choices.map((choice) => choice.querySelector('.num')?.textContent)).toEqual(['395001', '395007', '395009']);
      expect(choices[0].textContent).toContain('Nanpura, Station Road, Chowk');
      expect(choices[1].textContent).toContain('Adajan, Athwalines, Bhatar');

      choices[1].click();
      tick(400);
      fixture.detectChanges();
      expect(value().zip_code).toBe('395007');
      expect(el('.af-choices')).toBeNull();
      expect(all('.af-areas .af-chip').length).withContext('the areas of the chosen PIN').toBeGreaterThan(0);
    }));

    it('keeps a PIN already typed when it is one of the city’s', fakeAsync(() => {
      host.group.patchValue({ zip_code: '395009' });
      type('#addr-city-0', 'su');
      all('[role="option"]')[0].click();
      tick(400);
      fixture.detectChanges();
      expect(value().zip_code).toBe('395009');
      expect(el('.af-choices')).toBeNull();
    }));

    it('narrows the waiting PIN codes by the digits typed in PIN code', fakeAsync(() => {
      location.cities.and.returnValue(of([{ ...SURAT, pincodes: ['395001', '395007', '394210'] }]));
      type('#addr-city-0', 'su');
      all('[role="option"]')[0].click();
      tick(400);
      fixture.detectChanges();
      expect(all('.af-pin-choice').length).toBe(3);
      type('#addr-pin-0', '3950');
      expect(all('.af-pin-choice .num').map((pin) => pin.textContent)).toEqual(['395001', '395007']);
      expect(value().city).withContext('the city picked stays').toBe('Surat');
    }));

    it('accepts a city the directory does not have, as typed', fakeAsync(() => {
      location.cities.and.returnValue(of([]));
      host.group.patchValue({ district: 'Surat' });
      type('#addr-city-0', 'Navagam');
      expect(all('[role="option"]').length).toBe(0);
      expect(el('[data-af="no-city"]').textContent).toContain('No city in our list matches “Navagam”. It is kept as typed.');
      expect(value()).toEqual(jasmine.objectContaining({ city: 'Navagam', district: '' }));
      expect(host.group.valid).toBeTrue();
    }));

    it('stays quiet when the suggestions cannot be loaded', fakeAsync(() => {
      location.cities.and.returnValue(throwError(() => ({ status: 500 })));
      type('#addr-city-0', 'Surat');
      expect(all('[role="option"]').length).toBe(0);
      expect(el('[data-af="no-city"]')).toBeNull();
      expect(value().city).toBe('Surat');

      // The next letters ask again: one failure does not end the suggestions.
      location.cities.and.returnValue(of([SURAT]));
      type('#addr-city-0', 'Sura');
      expect(all('[role="option"]').length).toBe(1);
    }));

    it('asks across all states while no state is chosen, and takes the state of the city picked', fakeAsync(() => {
      host.group.patchValue({ state_code: '' });
      location.cities.and.returnValue(of([{ city: 'Pune', district: 'Pune', stateCode: '27', pincodes: ['411001'] }]));
      type('#addr-city-0', 'pu');
      expect(location.cities).toHaveBeenCalledOnceWith('', 'pu');
      expect(all('[role="option"]')[0].textContent).toContain('Maharashtra');
      all('[role="option"]')[0].click();
      tick(400);
      fixture.detectChanges();
      expect(value().state_code).toBe('27');
    }));
  });

  describe('where the state is a decision of its own (company settings)', () => {
    beforeEach(() => {
      host.showState = false;
      host.keepState = true;
      fixture.detectChanges();
    });

    it('leaves State to the form, keeps a chosen state and says when the PIN belongs to another', fakeAsync(() => {
      expect(el('#addr-state-0')).toBeNull();
      type('#addr-pin-0', '400050');
      expect(value()).toEqual(jasmine.objectContaining({ city: 'Mumbai', district: 'Mumbai Suburban', state_code: '24' }));
      expect(el('[data-af="mismatch"]').textContent).toContain('PIN 400050 is in Maharashtra, not Gujarat.');
    }));

    it('fills the state while none is chosen', fakeAsync(() => {
      host.group.patchValue({ state_code: '' });
      type('#addr-pin-0', '400050');
      expect(value().state_code).toBe('27');
      expect(el('[data-af="mismatch"]')).toBeNull();
    }));
  });

  it('shows the rules of the form beside its fields once submitted', () => {
    host.group.setValidators(() => ({ city: true, zip_code: true, state_code: true }));
    host.group.updateValueAndValidity();
    fixture.detectChanges();
    expect(all('.error').length).toBe(0);

    host.submitted = true;
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Enter a 6-digit PIN code.');
    expect(text).toContain('Enter the city.');
    expect(text).toContain('Choose the state.');
    expect(el('#addr-pin-0').getAttribute('aria-invalid')).toBe('true');
    expect(el('#addr-pin-0').getAttribute('aria-describedby')).toBe('addr-pin-0-note');
  });
});
