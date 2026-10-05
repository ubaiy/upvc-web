import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { BulkPriceUpdateService, toPriceUpload } from './bulk-price-update.service';
import { BulkPriceUploadComponent } from './bulk-price-upload.component';

const answer = (overrides: any = {}, message = 'Rates previewed, nothing saved.') => ({
  success: true,
  message,
  data: {
    saved: false,
    dry_run: true,
    summary: { rows_read: 9, rates_changed: 2, profiles_changed: 1, items_changed: 1, errors: 0 },
    changes: [
      { sheet: 'Profiles', row: 6, id: 1, code: 'CAS-F', name: 'Casement Frame', field: 'rate_meter', column: 'Rate per metre', from: 100, to: 112.5 },
      { sheet: 'Glass and hardware', row: 4, id: 7, code: '', name: '5mm plain glass', field: 'cost', column: 'Rate', from: 480, to: 510 },
    ],
    errors: [],
    ...overrides,
  },
});

describe('BulkPriceUploadComponent (price file)', () => {
  let fixture: ComponentFixture<BulkPriceUploadComponent>;
  let component: BulkPriceUploadComponent;
  let service: jasmine.SpyObj<BulkPriceUpdateService>;
  let toast: jasmine.SpyObj<ToastService>;

  const el = (): HTMLElement => fixture.nativeElement;
  const text = (): string => (el().textContent || '').replace(/\s+/g, ' ');
  const button = (label: string): HTMLButtonElement =>
    (Array.from(el().querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes(label))!;
  const xlsx = (name = 'Price-list-2026-10-05.xlsx', size = 1000) => ({ name, size } as File);

  beforeEach(() => {
    service = jasmine.createSpyObj('BulkPriceUpdateService', ['downloadSheet', 'uploadSheet']);
    service.uploadSheet.and.returnValue(of(toPriceUpload(answer())));
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    TestBed.configureTestingModule({
      declarations: [BulkPriceUploadComponent],
      imports: [RouterTestingModule, SharedComponentsModule],
      providers: [
        { provide: BulkPriceUpdateService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(BulkPriceUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts with the two steps and one primary button', () => {
    expect(el().querySelector('h1')?.textContent).toContain('Price file');
    expect(text()).toContain('1. Download your rates');
    expect(text()).toContain('2. Upload the file to see what changes');
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
    expect(text()).not.toContain('3. Apply');
  });

  it('downloads the rates under the name the api gives', () => {
    service.downloadSheet.and.returnValue(of({ blob: new Blob(['x']), fileName: 'Price-list-2026-10-05.xlsx' }));
    button('Download rates').click();
    expect(service.downloadSheet).toHaveBeenCalled();
    expect(toast.showSuccess).toHaveBeenCalledWith('Price-list-2026-10-05.xlsx downloaded');
  });

  it('previews a chosen file without saving, with the old and the new rate of each change', () => {
    const file = xlsx();
    component.choose(file);
    fixture.detectChanges();
    expect(service.uploadSheet).toHaveBeenCalledOnceWith(file, false);
    const rows = Array.from(el().querySelectorAll('table.changes tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' '));
    expect(rows.length).toBe(2);
    expect(rows[0]).toContain('Casement Frame');
    expect(rows[0]).toContain('Rate per metre');
    expect(rows[0]).toContain('₹100.00');
    expect(rows[0]).toContain('₹112.50');
    expect(text()).toContain('Rates that change2');
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
    expect(button('Apply 2 rates').disabled).toBeFalse();
  });

  it('applies the same file on "Apply" and says what was updated', () => {
    const file = xlsx();
    component.choose(file);
    fixture.detectChanges();
    service.uploadSheet.and.returnValue(of(toPriceUpload(answer({ saved: true, dry_run: false }, 'Rates updated.'))));
    button('Apply 2 rates').click();
    fixture.detectChanges();
    expect(service.uploadSheet.calls.mostRecent().args).toEqual([file, true]);
    expect(toast.showSuccess).toHaveBeenCalledWith('2 rates updated');
    expect(text()).toContain('2 rates were updated: 1 profile and 1 glass or hardware item.');
    expect(text()).not.toContain('3. Apply');
  });

  it('lists the rows to correct and does not let the file be applied', () => {
    service.uploadSheet.and.returnValue(
      of(
        toPriceUpload(
          answer(
            { errors: [{ sheet: 'Profiles', row: 7, message: 'Rate per metre "abc" must be a number from 0 to 1000000' }] },
            'The file has rows to correct. Nothing was saved.'
          )
        )
      )
    );
    component.choose(xlsx());
    fixture.detectChanges();
    expect(text()).toContain('Profiles, row 7');
    expect(text()).toContain('Rate per metre "abc" must be a number');
    expect(button('Apply 2 rates').disabled).toBeTrue();
    component.apply();
    expect(service.uploadSheet).toHaveBeenCalledTimes(1);
  });

  it('says so when no rate differs', () => {
    service.uploadSheet.and.returnValue(
      of(toPriceUpload(answer({ changes: [], summary: { rows_read: 9, rates_changed: 0, profiles_changed: 0, items_changed: 0, errors: 0 } })))
    );
    component.choose(xlsx());
    fixture.detectChanges();
    expect(text()).toContain('No rate in the file differs from the catalogue.');
    expect(button('Apply 0 rates').disabled).toBeTrue();
  });

  it('refuses a file that is not .xlsx or is too large before sending it, and shows the reason of the api for a bad workbook', () => {
    component.choose(xlsx('rates.csv'));
    fixture.detectChanges();
    expect(text()).toContain('"rates.csv" is not an Excel file.');
    component.choose(xlsx('big.xlsx', 3 * 1024 * 1024));
    fixture.detectChanges();
    expect(text()).toContain('larger than 2 MB');
    expect(service.uploadSheet).not.toHaveBeenCalled();

    service.uploadSheet.and.returnValue(throwError(() => new Error('Choose the .xlsx price list.')));
    component.choose(xlsx());
    fixture.detectChanges();
    expect(el().querySelector('app-callout')?.textContent).toContain('Choose the .xlsx price list.');
    expect(component.busy).toBeNull();
  });
});
