import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { WorkspaceService } from 'src/app/containers/shell/workspace.service';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { PaymentTermsService } from '../../payment-terms/payment-terms.service';
import { TypeMarginService } from '../../type-margin/type-margin.service';
import { ProfileService } from '../profile.service';
import { SettingsAdapter, SettingsRefusal, toSnapshot } from '../settings.adapter';
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

  it('fills an empty state from a well-formed GSTIN, and takes it back when the GSTIN is cleared', () => {
    const { fixture } = setUp(CompanyTabComponent);
    const c = fixture.componentInstance;
    c.f['gstin'].setValue('27abcde1234f1z5');
    expect(c.f['stateCode'].value).toBe('27');
    expect(c.f['stateCode'].enabled).toBeTrue();
    expect(c.stateFromGstin).toBeTrue();
    c.f['gstin'].setValue('27ABC');
    expect(c.f['gstin'].errors).toEqual({ gstin: true });
    // m18: the state that came from the GSTIN goes when the GSTIN does.
    expect(c.f['stateCode'].value).toBe('');
    c.f['gstin'].setValue('');
    expect(c.f['stateCode'].value).toBe('');
  });

  it('never changes a chosen state by itself: it says whose state the GSTIN is and asks on save', () => {
    const { fixture, adapter, el } = setUp(CompanyTabComponent, { ...ROW, gstin: '24ABCDE1234F1Z5', state_code: '24' });
    const c = fixture.componentInstance;
    c.f['gstin'].setValue('27ABCDE1234F1Z5');
    fixture.detectChanges();
    expect(c.f['stateCode'].value).toBe('24');
    expect(el.querySelector('#co-state-hint')?.textContent).toContain('This GSTIN belongs to Maharashtra (27)');

    c.save();
    fixture.detectChanges();
    expect(adapter.saveCompany).not.toHaveBeenCalled();
    const dialog = el.querySelector('app-confirm-dialog')!;
    expect(dialog.textContent).toContain('Change the company state to Maharashtra (27)?');
    const buttons = Array.from(dialog.querySelectorAll('button')).map((b) => b.textContent!.trim());
    expect(buttons).toEqual(['Keep Gujarat (24)', 'Change the state to Maharashtra (27)']);

    (dialog.querySelector('.btn-secondary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('app-confirm-dialog')).toBeNull();
    expect(adapter.saveCompany).not.toHaveBeenCalled();
    expect(c.f['stateCode'].value).toBe('24');

    c.save();
    fixture.detectChanges();
    (el.querySelector('app-confirm-dialog .btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    const args = adapter.saveCompany.calls.mostRecent().args;
    expect(args[0].gstin).toBe('27ABCDE1234F1Z5');
    expect(args[2]).toBeTrue();
    expect(el.querySelector('app-confirm-dialog')).toBeNull();
  });

  it("asks with the api's own sentence when the api reports the change of state", () => {
    const { fixture, adapter, el } = setUp(CompanyTabComponent, { ...ROW, gstin: '24ABCDE1234F1Z5', state_code: '24' });
    const c = fixture.componentInstance;
    adapter.saveCompany.and.returnValue(
      throwError(
        () =>
          new SettingsRefusal('The GSTIN belongs to Maharashtra (27) and the company state is Gujarat (24). Confirm to change the state to Maharashtra.', {
            needs_confirmation: 'state_change',
            gstin_state: { code: '27', name: 'Maharashtra' },
            current_state: { code: '24', name: 'Gujarat' },
          })
      )
    );
    c.f['name'].setValue('Hakimi Windows');
    c.save();
    fixture.detectChanges();
    expect(el.querySelector('app-confirm-dialog')?.textContent).toContain('Confirm to change the state to Maharashtra.');
    expect(el.querySelector('app-callout .danger')).toBeNull();
  });

  it('does not save a Regular registration without a GSTIN, and says what to do', () => {
    const { fixture, adapter, el } = setUp(CompanyTabComponent, { ...ROW, state_code: '24' });
    fixture.componentInstance.save();
    fixture.detectChanges();
    expect(adapter.saveCompany).not.toHaveBeenCalled();
    expect(el.querySelector('#co-gstin-err')?.textContent).toContain('A Regular GST registration needs its GSTIN.');
    fixture.componentInstance.f['registrationType'].setValue('composition');
    fixture.componentInstance.save();
    expect(adapter.saveCompany).toHaveBeenCalled();
  });

  it("shows the api's refusal of a GSTIN under the GSTIN field", () => {
    const { fixture, adapter, el } = setUp(CompanyTabComponent, { ...ROW, gstin: '24ABCDE1234F1Z5', state_code: '24' });
    adapter.saveCompany.and.returnValue(
      throwError(() => new SettingsRefusal('Gstin is not a valid GSTIN', { errors: { gstin: 'gstin is not a valid GSTIN: 15 characters, for example 24ABCDE1234F1Z5' } }))
    );
    fixture.componentInstance.save();
    fixture.detectChanges();
    expect(el.querySelector('#co-gstin-err')?.textContent).toContain('GSTIN is not a valid GSTIN: 15 characters');
  });

  it('asks a registered company for its state and does not save without it', () => {
    const { fixture, adapter, el } = setUp(CompanyTabComponent, { ...ROW, gst_registration_type: 'composition' });
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
    fixture.componentInstance.f['gstin'].setValue('24ABCDE1234F1Z5');
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

  const SERIES = {
    quotation: { label: 'Quotation', prefix: 'Q-', next: 17, last_used: 16, min_next: 17, example: 'Q-0017', yearly: false, financial_year: null },
    invoice: { label: 'Invoice', prefix: 'INV', next: 4, last_used: 3, min_next: 4, example: 'INV/26-27/0004', yearly: true, financial_year: '26-27' },
    order: { label: 'Order', prefix: 'ORD', next: 6, last_used: 5, min_next: 6, example: 'ORD/26-27/0006', yearly: true, financial_year: '26-27' },
    challan: { label: 'Delivery challan', prefix: 'DC', next: 6, last_used: 5, min_next: 6, example: 'DC/26-27/0006', yearly: true, financial_year: '26-27' },
    receipt: { label: 'Receipt', prefix: 'RCT', next: 13, last_used: 12, min_next: 13, example: 'RCT/26-27/0013', yearly: true, financial_year: '26-27' },
  };
  const WITH_SERIES = { ...ROW, number_series: SERIES };

  it('lists the five number series with prefix, next number and how the next one prints', () => {
    const { el } = setUp(DocumentsTabComponent, WITH_SERIES);
    const rows = Array.from(el.querySelectorAll('.series-row'));
    expect(rows.map((r) => r.querySelector('.series-name')!.textContent!.trim())).toEqual(['Quotation', 'Invoice', 'Order', 'Delivery challan', 'Receipt']);
    expect(rows[1].querySelector('.series-example')!.textContent).toContain('INV/26-27/0004');
    expect((rows[1].querySelector('input[aria-label="Invoice next number"]') as HTMLInputElement).value).toBe('4');
    expect(rows[1].textContent).toContain('Last used: 3 in 26-27.');
    // The old single prefix box is not shown beside the series.
    expect(el.querySelector('#doc-prefix')).toBeNull();
  });

  it('shows the new number as it is typed and sends only the series that changed', () => {
    const { fixture, adapter, el } = setUp(DocumentsTabComponent, WITH_SERIES);
    const c = fixture.componentInstance;
    c.seriesGroup('invoice').patchValue({ prefix: 'HK', next: '251' });
    fixture.detectChanges();
    expect(el.querySelectorAll('.series-row')[1].querySelector('.series-example')!.textContent).toContain('HK/26-27/0251');
    c.save();
    const [sent, , series] = adapter.saveDocuments.calls.mostRecent().args;
    expect(series).toEqual({ invoice: { prefix: 'HK', next: 251 } });
    expect(sent.numberPrefix).toBe('Q-');
  });

  it('refuses a next number that is already used, in plain words, before the api is asked', () => {
    const { fixture, adapter, el } = setUp(DocumentsTabComponent, WITH_SERIES);
    const c = fixture.componentInstance;
    c.seriesGroup('order').patchValue({ next: '2' });
    c.seriesGroup('order').markAsDirty();
    fixture.detectChanges();
    expect(el.querySelectorAll('.series-row')[2].textContent).toContain('Use 6 or more: numbers up to 5 are already used this year.');
    c.save();
    expect(adapter.saveDocuments).not.toHaveBeenCalled();
  });

  it('puts a refusal of one series by the api under that series', () => {
    const { fixture, adapter, el } = setUp(DocumentsTabComponent, WITH_SERIES);
    const c = fixture.componentInstance;
    adapter.saveDocuments.and.returnValue(
      throwError(
        () =>
          new SettingsRefusal('Prefix INV is used by two series', {
            errors: { 'number_series.receipt.prefix': 'Receipt and Invoice cannot share the prefix INV' },
          })
      )
    );
    c.seriesGroup('receipt').patchValue({ prefix: 'INV' });
    c.save();
    fixture.detectChanges();
    expect(el.querySelectorAll('.series-row')[4].querySelector('[role="alert"]')?.textContent).toContain('cannot share the prefix INV');
    expect(el.querySelector('app-callout .danger')).toBeNull();
  });

  it('takes digits only for a bank account number', () => {
    const { fixture, adapter } = setUp(DocumentsTabComponent);
    const c = fixture.componentInstance;
    for (const bad of ['12ab', '1234', '1234567890123456789']) {
      c.form.patchValue({ bankAccount: bad });
      expect(c.f['bankAccount'].invalid).withContext(bad).toBeTrue();
    }
    c.save();
    expect(adapter.saveDocuments).not.toHaveBeenCalled();
    for (const good of ['', '123456789', '1234 5678 9012', '50100-1234-5678']) {
      c.form.patchValue({ bankAccount: good });
      expect(c.f['bankAccount'].valid).withContext(good).toBeTrue();
    }
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
