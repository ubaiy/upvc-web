import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, OnDestroy, OnInit } from '@angular/core';
import { AbstractControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { EMPTY, Subject, Subscription, concat, of, timer } from 'rxjs';
import { catchError, debounceTime, map, switchMap } from 'rxjs/operators';

import { CityOption, LocationService, PIN_PATTERN, PinLookup } from '../../services/location.service';

export interface AddressState {
  code: string;
  name: string;
}

interface PinChoice {
  pincode: string;
  /** "Adajan, Rander": the first areas under the PIN, once the directory has answered. */
  areas: string;
}

/** Areas and PIN codes shown before "Show all". */
const SHORT_LIST = 6;

/**
 * PIN code, city and state of an Indian address, the way billing and shopping
 * apps take them: the PIN goes first and fills the rest.
 *
 *   <div class="form-grid" [formGroup]="address">
 *     <app-address-fields [group]="address" [states]="states" idSuffix="-0" [submitted]="submitted">
 *       <div class="field span-2">…house and street…</div>
 *       <div class="field span-2">…area or landmark…</div>
 *     </app-address-fields>
 *   </div>
 *
 * It draws the PIN code field, then whatever is placed inside it (the address
 * lines), then City and State, as cells of the form grid around it. The group
 * owns the values and the rules; this component only fills controls:
 *
 * - the sixth digit of a PIN looks it up and fills city, district and state,
 *   and offers the areas under that PIN for the area line;
 * - City suggests cities of the chosen state; a city with one PIN fills the
 *   PIN, a city with several lists them and waits for a choice;
 * - nothing here blocks: a PIN or city the directory does not have, or a
 *   lookup that fails, leaves the fields as typed.
 */
@Component({
  selector: 'app-address-fields',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './address-fields.component.html',
  styleUrls: ['./address-fields.component.scss'],
})
export class AddressFieldsComponent implements OnInit, OnDestroy {
  /** The address form group. It needs the PIN, city and state controls; district and area are used when present. */
  @Input() group!: FormGroup;
  @Input() states: AddressState[] = [];

  /** Control names in the group. */
  @Input() pinName = 'zip_code';
  @Input() cityName = 'city';
  @Input() districtName = 'district';
  @Input() stateName = 'state_code';
  @Input() areaName = 'address_line2';

  /** Field ids are `${idPrefix}-pin${idSuffix}`, `-city`, `-state`. */
  @Input() idPrefix = 'addr';
  @Input() idSuffix = '';

  /** True once the form was submitted: errors then show on untouched fields too. */
  @Input() submitted = false;
  /** Marks State as required with an asterisk. The rule itself is the group's. */
  @Input() stateRequired = false;
  /** Shows the GST code beside each state name: "Gujarat (24)". */
  @Input() stateCodes = false;
  /** A plain hint under State. */
  @Input() stateHint = '';
  /** The api's own sentence when the PIN and the state disagree; replaces the one worked out here. */
  @Input() stateWarning = '';

  pinStatus: 'idle' | 'looking' | 'found' | 'unknown' | 'failed' = 'idle';
  /** The directory's answer for the PIN last looked up. */
  found: PinLookup | null = null;
  allAreas = false;

  cityOptions: CityOption[] = [];
  cityOpen = false;
  activeIndex = -1;
  /** The text no city matched, for the line under the field. */
  cityNoMatch = '';

  /** The city just picked has several PIN codes: they wait here for a choice. */
  choiceCity: CityOption | null = null;
  allChoices = false;
  private choiceAreas = new Map<string, string>();

  /** Read out by a screen reader when a lookup fills fields or a list arrives. */
  announcement = '';

  private pin$ = new Subject<string>();
  private city$ = new Subject<string>();
  private subs = new Subscription();
  private areasSub?: Subscription;

  constructor(private location: LocationService, private host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.subs.add(
      this.pin$
        .pipe(
          // A newer PIN, or an edit, drops the lookup still on its way.
          switchMap((pin) =>
            pin
              ? timer(150).pipe(
                  switchMap(() => this.location.lookupPin(pin)),
                  map((result) => ({ pin, result, failed: false })),
                  catchError(() => of({ pin, result: null as PinLookup | null, failed: true }))
                )
              : EMPTY
          )
        )
        .subscribe(({ pin, result, failed }) => this.applyLookup(pin, result, failed))
    );
    this.subs.add(
      this.city$
        .pipe(
          debounceTime(250),
          switchMap((text) =>
            text.length < 2
              ? of({ text, options: null as CityOption[] | null })
              : this.location.cities(this.value(this.stateName), text).pipe(
                  map((options) => ({ text, options: options as CityOption[] | null })),
                  // No suggestions is not an error the user has to see.
                  catchError(() => of({ text, options: null as CityOption[] | null }))
                )
          )
        )
        .subscribe(({ text, options }) => this.showCities(text, options))
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.areasSub?.unsubscribe();
  }

  id(field: string): string {
    return `${this.idPrefix}-${field}${this.idSuffix}`;
  }

  control(name: string): AbstractControl | null {
    return this.group?.get(name) ?? null;
  }

  /** A field is wrong when its own rule or the group's rule for it fails, once it was touched or the form submitted. */
  invalid(name: string): boolean {
    const control = this.control(name);
    return !!control && (control.invalid || !!this.group.errors?.[name]) && (control.touched || this.submitted);
  }

  get hasArea(): boolean {
    return !!this.control(this.areaName);
  }

  get areas(): string[] {
    const all = this.found?.localities ?? [];
    return this.allAreas ? all : all.slice(0, SHORT_LIST);
  }

  get moreAreas(): number {
    return this.allAreas ? 0 : Math.max(0, (this.found?.localities.length ?? 0) - SHORT_LIST);
  }

  /** "Surat, Gujarat", with the district when it is not the city itself. */
  get foundText(): string {
    const f = this.found;
    if (!f) {
      return '';
    }
    const district = f.district && f.district.toLowerCase() !== f.city.toLowerCase() ? `${f.district} district` : '';
    return [f.city, district, f.stateName || this.nameOf(f.stateCode)].filter(Boolean).join(', ');
  }

  /** The PIN looked up belongs to another state than the one chosen. Said, never asked. */
  get mismatch(): string {
    if (this.stateWarning) {
      return this.stateWarning;
    }
    const f = this.found;
    const chosen = this.value(this.stateName);
    if (!f || f.pincode !== this.value(this.pinName) || !f.stateCode || !chosen || f.stateCode === chosen) {
      return '';
    }
    return `PIN ${f.pincode} is in ${f.stateName || this.nameOf(f.stateCode)}, not ${this.nameOf(chosen)}.`;
  }

  /** The waiting PIN codes, narrowed by the digits typed in PIN code so far. */
  get choices(): PinChoice[] {
    const typed = this.value(this.pinName);
    const all = (this.choiceCity?.pincodes ?? []).filter((pin) => !typed || typed.length === 6 || pin.startsWith(typed));
    return (this.allChoices ? all : all.slice(0, SHORT_LIST)).map((pincode) => ({
      pincode,
      areas: this.choiceAreas.get(pincode) ?? '',
    }));
  }

  get moreChoices(): number {
    return this.allChoices ? 0 : Math.max(0, (this.choiceCity?.pincodes.length ?? 0) - SHORT_LIST);
  }

  onPinInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    if (digits !== input.value) {
      this.set(this.pinName, digits);
    }
    this.found = null;
    this.allAreas = false;
    if (PIN_PATTERN.test(digits)) {
      this.pinStatus = 'looking';
      this.pin$.next(digits);
    } else {
      this.pinStatus = 'idle';
      this.pin$.next('');
    }
  }

  onCityInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value.trim();
    // A city typed by hand is no longer the directory's: its district goes with it.
    if (this.value(this.districtName)) {
      this.set(this.districtName, '');
    }
    this.closeChoices();
    this.cityNoMatch = '';
    this.city$.next(text);
  }

  onCityKeydown(event: KeyboardEvent): void {
    if (!this.cityOpen) {
      if (event.key === 'ArrowDown' && this.cityOptions.length) {
        this.cityOpen = true;
        this.activeIndex = 0;
        event.preventDefault();
      }
      return;
    }
    const last = this.cityOptions.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        this.activeIndex = this.activeIndex >= last ? 0 : this.activeIndex + 1;
        break;
      case 'ArrowUp':
        this.activeIndex = this.activeIndex <= 0 ? last : this.activeIndex - 1;
        break;
      case 'Enter':
        if (this.activeIndex < 0) {
          // Nothing highlighted: Enter keeps the typed city and does what it does in the form.
          this.cityOpen = false;
          return;
        }
        this.pickCity(this.cityOptions[this.activeIndex]);
        break;
      case 'Escape':
        this.cityOpen = false;
        // The dialog around the form must not close on this Escape.
        event.stopPropagation();
        break;
      default:
        return;
    }
    event.preventDefault();
    setTimeout(() => this.host.nativeElement.querySelector('.af-option.is-active')?.scrollIntoView?.({ block: 'nearest' }));
  }

  closeCities(): void {
    this.cityOpen = false;
    this.activeIndex = -1;
  }

  pickCity(option: CityOption): void {
    this.set(this.cityName, option.city);
    this.set(this.districtName, option.district);
    if (option.stateCode && this.knows(option.stateCode)) {
      this.set(this.stateName, option.stateCode);
    }
    this.closeCities();
    this.cityOptions = [];
    this.cityNoMatch = '';

    const pins = option.pincodes;
    const typed = this.value(this.pinName);
    if (pins.length === 1) {
      if (typed !== pins[0]) {
        this.usePin(pins[0]);
      }
      this.announcement = `${option.city} chosen. PIN code ${pins[0]} filled.`;
    } else if (pins.length > 1 && !pins.includes(typed)) {
      // Several PIN codes: the user chooses, the form never guesses.
      this.choiceCity = option;
      this.allChoices = false;
      this.loadChoiceAreas(pins.slice(0, SHORT_LIST));
      this.announcement = `${option.city} has ${pins.length} PIN codes. Choose one below, or type it.`;
    } else {
      this.announcement = `${option.city} chosen.`;
    }
  }

  pickPin(choice: PinChoice): void {
    this.usePin(choice.pincode);
    this.closeChoices();
    document.getElementById(this.id('pin'))?.focus();
  }

  showAllChoices(): void {
    this.allChoices = true;
  }

  pickArea(area: string): void {
    this.set(this.areaName, area);
  }

  isArea(area: string): boolean {
    return this.value(this.areaName).trim().toLowerCase() === area.toLowerCase();
  }

  onStateChange(): void {
    // The suggestions were for the other state.
    this.cityOptions = [];
    this.closeCities();
    this.cityNoMatch = '';
  }

  optionId(index: number): string {
    return `${this.id('city')}-opt-${index}`;
  }

  /** "Surat district · 24 PIN codes", leaving out a district named like the city. */
  optionDetail(option: CityOption): string {
    const district = option.district && option.district.toLowerCase() !== option.city.toLowerCase() ? `${option.district} district` : '';
    const state = this.value(this.stateName) ? '' : this.nameOf(option.stateCode);
    const pins =
      option.pincodes.length === 1 ? `PIN ${option.pincodes[0]}` : option.pincodes.length ? `${option.pincodes.length} PIN codes` : '';
    return [district, state, pins].filter(Boolean).join(' · ');
  }

  trackByIndex(index: number): number {
    return index;
  }

  private applyLookup(pin: string, result: PinLookup | null, failed: boolean): void {
    if (this.value(this.pinName) !== pin) {
      return;
    }
    if (failed) {
      this.pinStatus = 'failed';
      return;
    }
    if (!result) {
      this.pinStatus = 'unknown';
      return;
    }
    this.found = result;
    this.pinStatus = 'found';
    this.closeChoices();
    this.closeCities();
    this.cityNoMatch = '';
    if (result.city) {
      this.set(this.cityName, result.city);
    }
    this.set(this.districtName, result.district);
    if (result.stateCode && this.knows(result.stateCode)) {
      this.set(this.stateName, result.stateCode);
    }
    this.announcement = `PIN code ${pin}: ${this.foundText} filled.`;
  }

  private showCities(text: string, options: CityOption[] | null): void {
    // An answer for text that was since changed, or picked, is dropped.
    if (options === null || this.value(this.cityName).trim() !== text) {
      this.cityOptions = [];
      this.closeCities();
      return;
    }
    this.cityOptions = options;
    this.activeIndex = -1;
    this.cityOpen = options.length > 0;
    this.cityNoMatch = options.length ? '' : text;
    this.announcement = options.length
      ? `${options.length} ${options.length === 1 ? 'city' : 'cities'}. Use the arrow keys to choose.`
      : '';
  }

  /** Puts a PIN in the field and looks it up, for its areas. */
  private usePin(pin: string): void {
    this.set(this.pinName, pin);
    this.found = null;
    this.allAreas = false;
    this.pinStatus = 'looking';
    this.pin$.next(pin);
  }

  private closeChoices(): void {
    this.choiceCity = null;
    this.allChoices = false;
    this.areasSub?.unsubscribe();
  }

  /** The area names beside the first PIN codes offered, one call after another; the list works without them. */
  private loadChoiceAreas(pins: string[]): void {
    this.areasSub?.unsubscribe();
    this.areasSub = concat(
      ...pins
        .filter((pin) => !this.choiceAreas.has(pin))
        .map((pin) =>
          this.location.lookupPin(pin).pipe(
            map((result) => ({ pin, result })),
            catchError(() => EMPTY)
          )
        )
    ).subscribe(({ pin, result }) => {
      if (result?.localities.length) {
        this.choiceAreas.set(pin, result.localities.slice(0, 3).join(', '));
      }
    });
  }

  private value(name: string): string {
    const value = this.control(name)?.value;
    return value == null ? '' : String(value);
  }

  /** Fills a control as if the user had typed it, so the form knows the address changed. */
  private set(name: string, value: string): void {
    const control = this.control(name);
    if (!control || control.value === value) {
      return;
    }
    control.setValue(value);
    control.markAsDirty();
  }

  private knows(code: string): boolean {
    return !this.states.length || this.states.some((state) => state.code === code);
  }

  private nameOf(code: string): string {
    return this.states.find((state) => state.code === code)?.name || code;
  }
}
