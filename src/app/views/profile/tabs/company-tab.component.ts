import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { WriteDirective } from 'src/app/shared/access/write.directive';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, forkJoin } from 'rxjs';

import { WorkspaceService } from 'src/app/containers/shell/workspace.service';
import { AddressFieldsComponent } from 'src/app/shared/components/address-fields/address-fields.component';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { PIN_PATTERN } from 'src/app/shared/services/location.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { imageProblem } from '../image-rules';
import { ConfirmDialogComponent } from '../../bills/confirm-dialog.component';
import { SettingsAdapter, SettingsRefusal, errorText } from '../settings.adapter';
import {
  CompanySettings,
  GSTIN_PATTERN,
  GstState,
  REGISTRATION_TYPES,
  normaliseGstin,
  stateCodeFromGstin,
} from '../settings.model';

/** Settings → Company: who the fabricator is on every document (gaps G3, G4). */
@Component({
  selector: 'app-settings-company',
  standalone: true,
  imports: [WriteDirective, CommonModule, ReactiveFormsModule, SharedComponentsModule, ConfirmDialogComponent, AddressFieldsComponent],
  templateUrl: './company-tab.component.html',
  styleUrls: ['../settings-tab.scss', './company-tab.component.scss'],
})
export class CompanyTabComponent implements OnInit, OnDestroy {
  readonly registrationTypes = REGISTRATION_TYPES;

  state: 'loading' | 'error' | 'ready' = 'loading';
  states: GstState[] = [];
  form: FormGroup;
  submitted = false;
  saving = false;
  saveError = '';
  logoUrl: string | null = null;
  logoFile: File | null = null;
  logoError = '';
  /** The api's sentence when the saved PIN code belongs to another state than the company's. */
  pincodeWarning = '';
  /** The api's sentence for the GSTIN field, when it refuses one. */
  gstinError = '';
  /**
   * The GSTIN typed belongs to another state than the company's: the state is
   * changed only when the user says so. Holds both states while the question is open.
   */
  stateQuestion: { from: string; to: string; toCode: string; message: string } | null = null;

  private subs = new Subscription();
  /** A state this form filled in from the GSTIN because none was chosen. */
  private filledState = '';

  constructor(
    private fb: FormBuilder,
    private adapter: SettingsAdapter,
    private toast: ToastService,
    private workspace: WorkspaceService
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(191)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9+ -]{8,15}$/)]],
      phone2: ['', [Validators.pattern(/^[0-9+ -]{8,15}$/)]],
      address: ['', [Validators.required]],
      // Optional, and free text is accepted: the PIN code directory only helps (T90).
      pincode: ['', [Validators.pattern(PIN_PATTERN)]],
      city: ['', [Validators.maxLength(191)]],
      district: [''],
      registrationType: ['regular', [Validators.required]],
      gstin: ['', [gstinValidator]],
      stateCode: [''],
    });
    this.subs.add(
      this.form.controls['gstin'].valueChanges.subscribe(() => {
        this.gstinError = '';
        this.syncState();
      })
    );
    this.subs.add(this.form.controls['registrationType'].valueChanges.subscribe(() => this.syncState()));
  }

  get f() {
    return this.form.controls;
  }

  get registered(): boolean {
    return this.f['registrationType'].value !== 'unregistered';
  }

  get registrationHint(): string {
    return this.registrationTypes.find((t) => t.value === this.f['registrationType'].value)?.hint ?? '';
  }

  /** The state shown is the one this form took from the GSTIN, because none was chosen before. */
  get stateFromGstin(): boolean {
    return this.registered && !!this.filledState && this.f['stateCode'].value === this.filledState;
  }

  /** A Regular GST registration cannot be saved without its GSTIN: the bill is a tax invoice. */
  get gstinMissing(): boolean {
    return this.f['registrationType'].value === 'regular' && !normaliseGstin(this.f['gstin'].value);
  }

  /** The state the GSTIN names when it is another one than the state chosen, else null. */
  get otherState(): { code: string; name: string } | null {
    const code = this.registered ? stateCodeFromGstin(this.f['gstin'].value) : null;
    const chosen = this.f['stateCode'].value;
    return code && chosen && code !== chosen ? { code, name: this.stateName(code) } : null;
  }

  stateName(code: string): string {
    const state = this.states.find((s) => s.code === code);
    return state ? `${state.name} (${state.code})` : code;
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  load(): void {
    this.state = 'loading';
    forkJoin([this.adapter.load(), this.adapter.states()]).subscribe({
      next: ([snapshot, states]) => {
        this.states = states;
        this.patch(snapshot.company);
        this.state = 'ready';
      },
      error: () => (this.state = 'error'),
    });
  }

  invalid(name: string): boolean {
    const control = this.f[name];
    return control.invalid && (control.touched || this.submitted);
  }

  onLogoChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.logoError = imageProblem(file) ?? '';
    if (this.logoError) {
      return;
    }
    this.logoFile = file;
    const reader = new FileReader();
    reader.onload = () => (this.logoUrl = reader.result as string);
    reader.readAsDataURL(file);
    this.form.markAsDirty();
  }

  save(confirmStateChange = false): void {
    this.submitted = true;
    this.saveError = '';
    this.gstinError = '';
    if (this.form.invalid || this.saving || this.gstinMissing) {
      return;
    }
    const other = this.otherState;
    if (other && !confirmStateChange) {
      // Nothing is sent yet: the state changes only when the user says so.
      this.askStateChange(this.stateName(this.f['stateCode'].value), other.name, other.code, '');
      return;
    }
    const value = this.form.getRawValue();
    const company: CompanySettings = {
      name: value.name,
      address: value.address,
      city: value.city ?? '',
      district: value.district ?? '',
      pincode: value.pincode ?? '',
      email: value.email,
      phone: value.phone,
      phone2: value.phone2 ?? '',
      logoUrl: this.logoUrl,
      gstin: normaliseGstin(value.gstin),
      stateCode: value.stateCode || null,
      stateName: null,
      registrationType: value.registrationType,
    };
    this.saving = true;
    this.adapter.saveCompany(company, this.logoFile, confirmStateChange).subscribe({
      next: (snapshot) => {
        this.saving = false;
        this.submitted = false;
        this.logoFile = null;
        this.stateQuestion = null;
        this.patch(snapshot.company);
        this.workspace.workspace$.next({ name: snapshot.company.name });
        this.toast.showSuccess('Company details saved');
      },
      error: (err) => {
        this.saving = false;
        this.stateQuestion = null;
        if (err instanceof SettingsRefusal) {
          const data = err.data;
          if (data?.needs_confirmation === 'state_change' && data.gstin_state?.code) {
            // The api saw a change of state this form did not: ask, with its own sentence.
            const label = (s: any) => (s?.name ? `${s.name} (${s.code})` : this.stateName(String(s?.code ?? '')));
            this.askStateChange(label(data.current_state), label(data.gstin_state), String(data.gstin_state.code), err.message);
            return;
          }
          this.gstinError = err.fieldError('gstin');
          if (this.gstinError) {
            return;
          }
        }
        this.saveError = errorText(err);
      },
    });
  }

  /** "Change the state to Maharashtra" in the question. */
  confirmStateChange(): void {
    const question = this.stateQuestion;
    if (!question || this.saving) {
      return;
    }
    this.f['stateCode'].setValue(question.toCode, { emitEvent: false });
    this.save(true);
  }

  private askStateChange(from: string, to: string, toCode: string, message: string): void {
    this.stateQuestion = {
      from,
      to,
      toCode,
      message:
        message ||
        `The GSTIN belongs to ${to} and the company state is ${from}. Bills to a customer in ${to} would then carry CGST and SGST, and bills to ${from} would carry IGST.`,
    };
  }

  private patch(company: CompanySettings): void {
    this.filledState = '';
    this.pincodeWarning = company.pincodeWarning ?? '';
    this.logoUrl = company.logoUrl;
    this.form.reset(
      {
        name: company.name,
        email: company.email,
        phone: company.phone,
        phone2: company.phone2,
        address: company.address,
        pincode: company.pincode ?? '',
        city: company.city ?? '',
        district: company.district ?? '',
        registrationType: company.registrationType,
        gstin: company.gstin ?? '',
        stateCode: company.stateCode ?? '',
      },
      { emitEvent: false }
    );
    this.syncState();
  }

  private syncState(): void {
    const state = this.f['stateCode'];
    const fromGstin = this.registered ? stateCodeFromGstin(this.f['gstin'].value) : null;
    if (fromGstin && (!state.value || state.value === this.filledState)) {
      // No state was chosen: the GSTIN's is filled in. A state already chosen is never changed here.
      this.filledState = fromGstin;
      state.setValue(fromGstin, { emitEvent: false });
    } else if (!fromGstin && this.filledState && state.value === this.filledState) {
      // The GSTIN it came from was cleared: the state goes with it.
      this.filledState = '';
      state.setValue('', { emitEvent: false });
    }
    // The tax rule compares this state with the customer's; a registered seller must have one.
    state.setValidators(this.registered ? [Validators.required] : []);
    state.updateValueAndValidity({ emitEvent: false });
  }
}

function gstinValidator(control: { value: unknown }) {
  const gstin = normaliseGstin(control.value as string);
  return !gstin || GSTIN_PATTERN.test(gstin) ? null : { gstin: true };
}
