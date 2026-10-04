import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { WorkspaceService } from 'src/app/containers/shell/workspace.service';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { PaymentTermsService } from '../../payment-terms/payment-terms.service';
import { TypeMarginService } from '../../type-margin/type-margin.service';
import { ProfileService } from '../profile.service';
import { SettingsAdapter, toSnapshot } from '../settings.adapter';
import { CompanyTabComponent } from './company-tab.component';
import { DocumentsTabComponent } from './documents-tab.component';
import { PricingTaxTabComponent } from './pricing-tax-tab.component';
import { TeamTabComponent } from './team-tab.component';

const ROW = {
  name: 'Hakimi Enterprise',
  address: 'Ukardi Road, Dahod',
  email: 'sales@example.in',
  phone: '9510957900',
  phone_no2: '9879852980',
  gstin: null,
  state_code: null,
  gst_registration_type: 'regular',
  default_gst_rate: 18,
  default_hsn_code: null,
  prices_include_gst: false,
  terms_text: null,
  bank_account_name: null,
  bank_name: null,
  bank_account_number: null,
  bank_ifsc: null,
  upi_id: null,
  signatory_name: null,
  quotation_number_prefix: 'Q-',
  quotation_validity_days: 30,
};
const STATES = [
  { code: '24', name: 'Gujarat' },
  { code: '27', name: 'Maharashtra' },
];

function setUp<T>(component: new (...args: any[]) => T, row: any = ROW) {
  const adapter = jasmine.createSpyObj<SettingsAdapter>('SettingsAdapter', ['load', 'states', 'saveCompany', 'saveTax', 'saveDocuments']);
  adapter.load.and.returnValue(of(toSnapshot(row)));
  adapter.states.and.returnValue(of(STATES));
  adapter.saveCompany.and.callFake((company) => of(toSnapshot({ ...row, name: company.name, gstin: company.gstin, state_code: company.stateCode })));
  adapter.saveTax.and.returnValue(of(toSnapshot(row)));
  adapter.saveDocuments.and.returnValue(of(toSnapshot(row)));
  const toast = jasmine.createSpyObj<ToastService>('ToastService', ['showSuccess', 'showError']);
  const workspace = { workspace$: new BehaviorSubject({ name: '' }) };
  const lists = { success: true, data: [] };
  TestBed.configureTestingModule({
    imports: [component as any, RouterTestingModule],
    providers: [
      { provide: SettingsAdapter, useValue: adapter },
      { provide: ToastService, useValue: toast },
      { provide: WorkspaceService, useValue: workspace },
      { provide: ConfirmationDialogService, useValue: { confirm: () => undefined } },
      { provide: TypeMarginService, useValue: { getTypeMarginList: () => of(lists) } },
      { provide: PaymentTermsService, useValue: { getPaymentTypeList: () => of(lists) } },
      {
        provide: ProfileService,
        useValue: { getProfile: () => of({ success: true, data: { name: 'Demo', last_name: 'User', email: 'demo@upvc.local' } }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(component as any) as ComponentFixture<T>;
  fixture.detectChanges();
  return { fixture, adapter, toast, workspace, el: fixture.nativeElement as HTMLElement };
}

const primaryButtons = (el: HTMLElement) => el.querySelectorAll('.btn-primary').length;

describe('CompanyTabComponent', () => {
  it('shows the company with exactly one primary button', () => {
    const { el } = setUp(CompanyTabComponent);
    expect((el.querySelector('#co-name') as HTMLInputElement).value).toBe('Hakimi Enterprise');
    expect(primaryButtons(el)).toBe(1);
  });

  it('reads the state from a well-formed GSTIN and locks it', () => {
    const { fixture } = setUp(CompanyTabComponent);
    const c = fixture.componentInstance;
    c.f['gstin'].setValue('27abcde1234f1z5');
    expect(c.f['stateCode'].value).toBe('27');
    expect(c.f['stateCode'].disabled).toBeTrue();
    c.f['gstin'].setValue('27ABC');
    expect(c.f['stateCode'].enabled).toBeTrue();
    expect(c.f['gstin'].errors).toEqual({ gstin: true });
  });

  it('asks a registered company for its state and does not save without it', () => {
    const { fixture, adapter, el } = setUp(CompanyTabComponent);
    fixture.componentInstance.save();
    fixture.detectChanges();
    expect(adapter.saveCompany).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Choose your state.');
  });

  it('hides the GSTIN for a company that is not registered and frees the state', () => {
    const { fixture, el } = setUp(CompanyTabComponent);
    fixture.componentInstance.f['registrationType'].setValue('unregistered');
    fixture.detectChanges();
    expect(el.querySelector('#co-gstin')).toBeNull();
    expect(fixture.componentInstance.f['stateCode'].valid).toBeTrue();
  });

  it('saves, tells the shell the new name and confirms with a toast', () => {
    const { fixture, adapter, toast, workspace } = setUp(CompanyTabComponent);
    const c = fixture.componentInstance;
    c.f['name'].setValue('Hakimi Windows');
    c.f['gstin'].setValue('24ABCDE1234F1Z5');
    c.save();
    const sent = adapter.saveCompany.calls.mostRecent().args[0];
    expect(sent.name).toBe('Hakimi Windows');
    expect(sent.stateCode).toBe('24');
    expect(workspace.workspace$.value.name).toBe('Hakimi Windows');
    expect(toast.showSuccess).toHaveBeenCalledWith('Company details saved');
  });

  it('keeps the form and shows the reason when the save is refused', () => {
    const { fixture, adapter, el } = setUp(CompanyTabComponent);
    adapter.saveCompany.and.returnValue(throwError(() => new Error('State does not match the state in the GSTIN')));
    fixture.componentInstance.f['stateCode'].setValue('24');
    fixture.componentInstance.save();
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('State does not match');
  });

  it('shows an inline error with "Try again" when loading fails, and recovers', () => {
    const { fixture, adapter, el } = setUp(CompanyTabComponent);
    adapter.load.and.returnValue(throwError(() => new Error('offline')));
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(el.querySelector('form')).toBeNull();
    const retry = el.querySelector('.callout button') as HTMLButtonElement;
    expect(retry.textContent).toContain('Try again');
    adapter.load.and.returnValue(of(toSnapshot(ROW)));
    retry.click();
    fixture.detectChanges();
    expect(el.querySelector('form')).not.toBeNull();
  });

  it('refuses a logo that is not a small raster image', () => {
    const { fixture } = setUp(CompanyTabComponent);
    const c = fixture.componentInstance;
    c.onLogoChosen({ target: { files: [{ type: 'image/svg+xml', size: 10, name: 'x.svg' }], value: 'x' } } as any);
    expect(c.logoError).toContain('JPEG, PNG or WebP');
    expect(c.logoFile).toBeNull();
  });
});

describe('PricingTaxTabComponent', () => {
  it('has one primary button; the list buttons are secondary', () => {
    const { el } = setUp(PricingTaxTabComponent);
    expect(primaryButtons(el)).toBe(1);
    expect(el.textContent).toContain('No margins yet');
    expect(el.textContent).toContain('No payment terms yet');
  });

  it('illustrates tax on top of the price, or inside it', () => {
    const { fixture, el } = setUp(PricingTaxTabComponent);
    const c = fixture.componentInstance;
    expect(c.sample).toEqual({ taxable: 10000, tax: 1800, total: 11800 });
    expect(el.textContent).toContain('₹1,800.00');
    c.f['pricesIncludeGst'].setValue(true);
    expect(c.sample.total).toBe(10000);
    expect(c.sample.tax).toBeCloseTo(1525.42, 2);
  });

  it('saves rate, HSN and the inclusive flag', () => {
    const { fixture, adapter, toast } = setUp(PricingTaxTabComponent);
    const c = fixture.componentInstance;
    c.form.setValue({ gstRate: 12, hsnCode: '3925 20 00', pricesIncludeGst: true });
    c.save();
    expect(adapter.saveTax).toHaveBeenCalledWith({ gstRate: 12, hsnCode: '3925 20 00', pricesIncludeGst: true });
    expect(toast.showSuccess).toHaveBeenCalled();
  });

  it('refuses a rate above 100', () => {
    const { fixture, adapter } = setUp(PricingTaxTabComponent);
    fixture.componentInstance.f['gstRate'].setValue(180);
    fixture.componentInstance.save();
    expect(adapter.saveTax).not.toHaveBeenCalled();
  });

  it('says why there are no tax lines for a composition dealer', () => {
    const { el } = setUp(PricingTaxTabComponent, { ...ROW, gst_registration_type: 'composition' });
    expect(el.textContent).toContain('composition dealer');
  });
});

describe('DocumentsTabComponent', () => {
  it('previews the letterhead, the number and the validity date as the form changes', () => {
    const { fixture, el } = setUp(DocumentsTabComponent);
    const c = fixture.componentInstance;
    c.form.patchValue({ numberPrefix: 'HE/', validityDays: 10, terms: 'Delivery in 21 days\n\n Warranty 10 years ', signatory: 'Mustafa' });
    fixture.detectChanges();
    const sheet = el.querySelector('.sheet') as HTMLElement;
    expect(sheet.textContent).toContain('Hakimi Enterprise');
    expect(sheet.textContent).toContain('HE/0014');
    expect(sheet.textContent).toContain('Mustafa');
    expect(c.termLines).toEqual(['Delivery in 21 days', 'Warranty 10 years']);
    const days = Math.round((c.validUntil.getTime() - c.today.getTime()) / 86400000);
    expect(days).toBe(10);
  });

  it('saves with the IFSC in capitals', () => {
    const { fixture, adapter } = setUp(DocumentsTabComponent);
    const c = fixture.componentInstance;
    c.form.patchValue({ bankIfsc: 'sbin0001234', upiId: 'hakimi@upi' });
    c.save();
    const [sent, stored] = adapter.saveDocuments.calls.mostRecent().args;
    expect(sent.bankIfsc).toBe('SBIN0001234');
    expect(stored).toBeTrue();
  });

  it('refuses a malformed IFSC, UPI ID or prefix', () => {
    const { fixture, adapter } = setUp(DocumentsTabComponent);
    const c = fixture.componentInstance;
    c.form.patchValue({ bankIfsc: 'SBIN', upiId: 'not-a-upi', numberPrefix: 'Q #' });
    c.save();
    expect(c.f['bankIfsc'].invalid && c.f['upiId'].invalid && c.f['numberPrefix'].invalid).toBeTrue();
    expect(adapter.saveDocuments).not.toHaveBeenCalled();
  });

  it('turns saving off, and says so, when the API cannot keep the fields', () => {
    const { fixture, adapter, el } = setUp(DocumentsTabComponent, { name: 'Old API Co' });
    expect((el.querySelector('.btn-primary') as HTMLButtonElement).disabled).toBeTrue();
    expect(el.textContent).toContain('cannot be saved on this server yet');
    fixture.componentInstance.save();
    expect(adapter.saveDocuments).not.toHaveBeenCalled();
  });
});

describe('TeamTabComponent', () => {
  it('shows the one sign-in and what is coming, with no primary button', () => {
    const { el } = setUp(TeamTabComponent);
    expect(el.textContent).toContain('Demo User');
    expect(el.textContent).toContain('Owner');
    expect(el.textContent).toContain('Invite your team soon');
    expect(primaryButtons(el)).toBe(0);
  });
});
