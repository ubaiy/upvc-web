import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, forkJoin } from 'rxjs';

import { WorkspaceService } from 'src/app/containers/shell/workspace.service';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { imageProblem } from '../image-rules';
import { SettingsAdapter, errorText } from '../settings.adapter';
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
  imports: [CommonModule, ReactiveFormsModule, SharedComponentsModule],
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

  private subs = new Subscription();

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
      registrationType: ['regular', [Validators.required]],
      gstin: ['', [gstinValidator]],
      stateCode: [''],
    });
    this.subs.add(this.form.controls['gstin'].valueChanges.subscribe(() => this.syncState()));
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

  /** The state is read from a well-formed GSTIN, so the two cannot disagree. */
  get stateFromGstin(): boolean {
    return this.registered && !!stateCodeFromGstin(this.f['gstin'].value);
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

  save(): void {
    this.submitted = true;
    this.saveError = '';
    if (this.form.invalid || this.saving) {
      return;
    }
    const value = this.form.getRawValue();
    const company: CompanySettings = {
      name: value.name,
      address: value.address,
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
    this.adapter.saveCompany(company, this.logoFile).subscribe({
      next: (snapshot) => {
        this.saving = false;
        this.submitted = false;
        this.logoFile = null;
        this.patch(snapshot.company);
        this.workspace.workspace$.next({ name: snapshot.company.name });
        this.toast.showSuccess('Company details saved');
      },
      error: (err) => {
        this.saving = false;
        this.saveError = errorText(err);
      },
    });
  }

  private patch(company: CompanySettings): void {
    this.logoUrl = company.logoUrl;
    this.form.reset(
      {
        name: company.name,
        email: company.email,
        phone: company.phone,
        phone2: company.phone2,
        address: company.address,
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
    if (fromGstin) {
      state.setValue(fromGstin, { emitEvent: false });
      state.disable({ emitEvent: false });
    } else {
      state.enable({ emitEvent: false });
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
