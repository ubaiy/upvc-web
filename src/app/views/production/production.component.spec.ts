import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { ToastService } from '../../shared/services/toast.service';
import { JOB } from './production.adapter.spec';
import { ProductionComponent } from './production.component';
import { JobResult, ProductionJob } from './production.model';
import { ProductionModule } from './production.module';
import { ProductionService } from './production.service';

const job = (over: Partial<ProductionJob> = {}): Observable<JobResult> => of({ kind: 'job', job: { ...JOB, ...over } });
const pdf = () => of({ blob: new Blob(['%PDF'], { type: 'application/pdf' }), fileName: null });

describe('ProductionComponent', () => {
  let fixture: ComponentFixture<ProductionComponent>;
  let service: jasmine.SpyObj<ProductionService>;
  let toast: jasmine.SpyObj<ToastService>;
  let saved: { blob: Blob; name: string }[];
  const el = (): HTMLElement => fixture.nativeElement;
  const text = (): string => (el().textContent || '').replace(/\s+/g, ' ');
  const button = (label: string): HTMLButtonElement =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => (b.textContent || '').includes(label))!;
  const labelled = (label: string): HTMLButtonElement => el().querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;

  beforeEach(() => {
    service = jasmine.createSpyObj('ProductionService', ['getJob', 'freeze', 'getDocument']);
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError', 'showInfo']);
    saved = [];
    TestBed.configureTestingModule({
      declarations: [ProductionComponent],
      imports: [RouterTestingModule, SharedComponentsModule],
      providers: [
        { provide: ProductionService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ quotationId: '14' })) } },
      ],
    });
  });

  function create(result: Observable<JobResult>): void {
    service.getJob.and.returnValue(result);
    fixture = TestBed.createComponent(ProductionComponent);
    spyOn<any>(fixture.componentInstance, 'save').and.callFake((blob: Blob, name: string) => saved.push({ blob, name }));
    fixture.detectChanges();
  }

  it('shows a skeleton while the job loads, and no primary button yet', () => {
    create(new Subject<JobResult>());
    expect(service.getJob).toHaveBeenCalledWith('14', undefined);
    expect(el().querySelector('[role="status"]')?.textContent).toContain('Loading the production job');
    expect(el().querySelectorAll('.sk-doc').length).toBe(4);
    expect(el().querySelector('.btn-primary')).toBeNull();
  });

  it('shows the job, when it was frozen, its revision and the four documents', () => {
    create(job());
    expect(text()).toContain('Job Q-0003/P1');
    expect(text()).toContain('Frozen');
    expect(text()).toContain('by Tester');
    expect(text()).toContain('Revision 1');
    expect(text()).toContain('3 windows, 3 units');
    expect(text()).toContain('Al-Rashid Villa Windows · Ahmed Al-Rashid');
    const titles = Array.from(el().querySelectorAll('.doc h2')).map((h) => h.textContent);
    expect(titles).toEqual(['Cutting list', 'Glass order', 'Hardware order', 'Production sheets']);
    for (const doc of Array.from(el().querySelectorAll('.doc'))) {
      const labels = Array.from(doc.querySelectorAll('button')).map((b) => (b.textContent || '').trim());
      expect(labels).toEqual(['Preview', 'Download PDF', 'Download Excel', 'Share']);
    }
  });

  it('has exactly one primary button: Download production pack', () => {
    create(job());
    const primary = el().querySelectorAll('.btn-primary');
    expect(primary.length).toBe(1);
    expect(primary[0].textContent).toContain('Download production pack');
  });

  it('downloads the pack as one PDF of the shown revision', () => {
    create(job());
    service.getDocument.and.returnValue(pdf());
    button('Download production pack').click();
    expect(service.getDocument).toHaveBeenCalledWith('14', 'pack', 'pdf', 1, true);
    expect(saved[0].name).toBe('Production-pack-Q-0003-P1.pdf');
  });

  it('shows the banner the api sent, and none when it sends null', () => {
    create(job());
    expect(el().querySelector('.banner')?.textContent).toContain('Sizes not verified against the supplier manual');
    create(job({ banner: null, verified: true }));
    expect(el().querySelector('.banner')).toBeNull();
  });

  it('lists the engine warnings in plain language with their windows', () => {
    create(
      job({
        warnings: [
          { message: "Rule 'bead_deduction' missing from profile-system rules; falling back to default 10 mm.", windows: ['W1', 'W2', 'W3'] },
          { message: "No profile with role 'bead' in the system; bead pieces carry profile_id 0.", windows: ['W1'] },
        ],
      })
    );
    const items = Array.from(el().querySelectorAll('.warning-list li')).map((li) => (li.textContent || '').replace(/\s+/g, ' '));
    expect(items.length).toBe(2);
    expect(items[0]).toContain('No glazing bead profile is in the catalogue');
    expect(items[0]).toContain('W1');
    expect(items[1]).toContain('bead deduction 10 mm');
    expect(items[1]).toContain('All windows');
    expect(text()).not.toContain('profile_id');
  });

  it('hides the warnings card when there are none', () => {
    create(job());
    expect(el().querySelector('.warnings')).toBeNull();
  });

  it('sums up profile, glass and hardware, with a table per tab', () => {
    create(job());
    const stats = Array.from(el().querySelectorAll('app-stat')).map((s) => (s.textContent || '').replace(/\s+/g, ' '));
    expect(stats[0]).toContain('17.5 m');
    expect(stats[0]).toContain('12 pieces, plus 5.5 m of steel');
    expect(stats[1]).toContain('4.93 sq m');
    expect(stats[1]).toContain('3 panes');
    expect(stats[2]).toContain('2 items');
    expect(text()).toContain('P60-K-X-R');
    expect(text()).toContain('GI Reinforcement');

    button('Glass').click();
    fixture.detectChanges();
    expect(text()).toContain('5mm plain glass');
    Array.from(el().querySelectorAll<HTMLButtonElement>('.tab'))[2].click();
    fixture.detectChanges();
    expect(text()).toContain('8x80 Fastner');
    expect(text()).toContain('24 nos');
  });

  it('downloads a document as PDF or Excel under the name the api uses', () => {
    create(job());
    service.getDocument.and.returnValue(pdf());
    labelled('Download Cutting list as PDF').click();
    expect(service.getDocument).toHaveBeenCalledWith('14', 'cutting-list', 'pdf', 1, true);
    labelled('Download Glass order as Excel').click();
    expect(service.getDocument).toHaveBeenCalledWith('14', 'glass-order', 'xlsx', 1, true);
    expect(saved.map((file) => file.name)).toEqual(['Cutting-list-Q-0003-P1.pdf', 'Glass-order-Q-0003-P1.xlsx']);
  });

  it('prefers the file name the api sent', () => {
    create(job());
    service.getDocument.and.returnValue(of({ blob: new Blob(['x']), fileName: 'From-the-api.pdf' }));
    labelled('Download Hardware order as PDF').click();
    expect(saved[0].name).toBe('From-the-api.pdf');
  });

  it('disables every document button while one is working, and says which', () => {
    create(job());
    service.getDocument.and.returnValue(new Subject<any>());
    labelled('Download Cutting list as PDF').click();
    fixture.detectChanges();
    expect(labelled('Download Cutting list as PDF').textContent).toContain('Preparing…');
    expect(labelled('Preview Glass order').disabled).toBeTrue();
    expect(button('Download production pack').disabled).toBeTrue();
  });

  it('opens the preview inline in a sandboxed frame and closes it again', fakeAsync(() => {
    create(job());
    service.getDocument.and.returnValue(of({ blob: new Blob(['<html></html>'], { type: 'text/html' }), fileName: null }));
    labelled('Preview Cutting list').click();
    tick();
    fixture.detectChanges();
    expect(service.getDocument).toHaveBeenCalledWith('14', 'cutting-list', 'html', 1);
    const frame = el().querySelector<HTMLIFrameElement>('iframe.preview-frame')!;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.src).toMatch(/^blob:/);
    expect(frame.title).toBe('Cutting list preview');
    button('Close preview').click();
    fixture.detectChanges();
    expect(el().querySelector('iframe')).toBeNull();
  }));

  it('shares the PDF through the share sheet when the device has one', () => {
    create(job());
    service.getDocument.and.returnValue(pdf());
    const share = spyOn<any>(fixture.componentInstance, 'shareFile');
    labelled('Share Production sheets').click();
    expect(service.getDocument).toHaveBeenCalledWith('14', 'sheet', 'pdf', 1, true);
    const file = share.calls.mostRecent().args[0] as File;
    expect(file.name).toBe('Production-sheets-Q-0003-P1.pdf');
    expect(file.type).toBe('application/pdf');
    expect(share.calls.mostRecent().args[1]).toBe('Production sheets Q-0003/P1');
  });

  it('downloads the PDF and says so when the device cannot share files', () => {
    create(job());
    const nav = navigator as any;
    const had = Object.getOwnPropertyDescriptor(nav, 'canShare');
    Object.defineProperty(nav, 'canShare', { value: () => false, configurable: true });
    (fixture.componentInstance as any).shareFile(new File(['x'], 'Glass-order-Q-0003-P1.pdf'), 'Glass order');
    if (had) {
      Object.defineProperty(nav, 'canShare', had);
    } else {
      delete nav.canShare;
    }
    expect(saved[0].name).toBe('Glass-order-Q-0003-P1.pdf');
    expect(toast.showInfo.calls.mostRecent().args[0]).toContain('was downloaded');
  });

  it('shows a failed download inline with the reason and Try again', () => {
    create(job());
    service.getDocument.and.returnValue(throwError(() => new Error('This quatation has no production job with that revision')));
    labelled('Download Cutting list as PDF').click();
    fixture.detectChanges();
    expect(text()).toContain(
      'Cutting list could not be downloaded. This quatation has no production job with that revision'
    );
    service.getDocument.and.returnValue(pdf());
    button('Try again').click();
    fixture.detectChanges();
    expect(saved.length).toBe(1);
    expect(button('Try again')).toBeUndefined();
  });

  it('blames the connection when the request itself fails', () => {
    create(job());
    service.getDocument.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    labelled('Preview Glass order').click();
    fixture.detectChanges();
    expect(text()).toContain('Glass order could not be opened. Check your connection.');
  });

  it('offers to prepare the documents when the quotation has no job yet', () => {
    create(of({ kind: 'no-job' }));
    expect(text()).toContain('No production job yet');
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
    service.freeze.and.returnValue(job());
    button('Prepare production documents').click();
    fixture.detectChanges();
    expect(service.freeze).toHaveBeenCalledWith('14', false);
    expect(text()).toContain('Job Q-0003/P1');
    expect(toast.showSuccess).toHaveBeenCalledWith('Production job Q-0003/P1 is ready');
  });

  it('shows the empty state with a way back when the quotation has no windows', () => {
    create(of({ kind: 'no-job' }));
    service.freeze.and.returnValue(of({ kind: 'no-windows' }));
    button('Prepare production documents').click();
    fixture.detectChanges();
    expect(text()).toContain('No windows to make yet');
    const link = el().querySelector<HTMLAnchorElement>('a.btn-primary')!;
    expect(link.textContent).toContain('Open the quotation');
    expect(link.getAttribute('href')).toBe('/quotation/detail/14');
  });

  it('shows a failed freeze inline and lets the user try again', () => {
    create(of({ kind: 'no-job' }));
    service.freeze.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    button('Prepare production documents').click();
    fixture.detectChanges();
    expect(text()).toContain('We could not freeze the job. Check your connection.');
    service.freeze.and.returnValue(job());
    button('Try again').click();
    fixture.detectChanges();
    expect(text()).toContain('Job Q-0003/P1');
  });

  it('makes a new revision with Refresh job', () => {
    create(job());
    service.freeze.and.returnValue(job({ revision: 2, latest_revision: 2, number: 'Q-0003/P2' }));
    button('Refresh job').click();
    fixture.detectChanges();
    expect(service.freeze).toHaveBeenCalledWith('14', true);
    expect(text()).toContain('Job Q-0003/P2');
    expect(text()).toContain('Revision 2');
  });

  it('says so when the quotation changed after the freeze, and offers the refresh there', () => {
    create(job({ is_stale: true }));
    expect(text()).toContain('The quotation has changed since this job was frozen');
    expect(Array.from(el().querySelectorAll('button')).filter((b) => (b.textContent || '').includes('Refresh job')).length).toBe(1);
  });

  it('opens an older revision from the list and points back to the newest', () => {
    create(job({ revision: 2, latest_revision: 2, number: 'Q-0003/P2' }));
    const select = el().querySelector<HTMLSelectElement>('select')!;
    expect(Array.from(select.options).map((o) => (o.textContent || '').trim())).toEqual(['2 (newest)', '1']);
    service.getJob.and.returnValue(job({ revision: 1, latest_revision: 2 }));
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(service.getJob).toHaveBeenCalledWith('14', 1);
    expect(text()).toContain('You are looking at revision 1. The newest is revision 2.');
    expect(button('Refresh job')).toBeUndefined();
    service.getDocument.and.returnValue(pdf());
    button('Download production pack').click();
    expect(service.getDocument).toHaveBeenCalledWith('14', 'pack', 'pdf', 1, true);
  });

  it('shows a load failure inline with Try again', () => {
    create(throwError(() => new HttpErrorResponse({ status: 0 })));
    expect(el().querySelector('app-callout [role="alert"]')?.textContent).toContain(
      'We could not load the production job. Check your connection.'
    );
    service.getJob.and.returnValue(job());
    button('Try again').click();
    fixture.detectChanges();
    expect(text()).toContain('Job Q-0003/P1');
  });

  it('shows the reason the api gave when it refuses the job', () => {
    create(of({ kind: 'refused', message: 'This quotation was not found. It may have been deleted.' }));
    expect(text()).toContain('This quotation was not found.');
  });

  it('keeps every button and the revision list at 44 px or more', () => {
    create(job({ revision: 2, latest_revision: 2 }));
    document.body.appendChild(el());
    const controls = Array.from(el().querySelectorAll<HTMLElement>('button.btn, select'));
    expect(controls.length).toBeGreaterThan(16);
    for (const control of controls) {
      expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  });
});

@Component({ template: '<router-outlet></router-outlet>' })
class HostComponent {}

describe('ProductionModule route', () => {
  it('opens the page at /production/:quotationId and reads the id', async () => {
    const service = jasmine.createSpyObj('ProductionService', ['getJob', 'freeze', 'getDocument']);
    service.getJob.and.returnValue(of({ kind: 'no-job' }));
    TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [RouterTestingModule.withRoutes([{ path: 'production', loadChildren: () => ProductionModule }])],
      providers: [
        { provide: ProductionService, useValue: service },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['showSuccess', 'showInfo']) },
      ],
    });
    const host = TestBed.createComponent(HostComponent);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/production/15');
    host.detectChanges();
    expect(TestBed.inject(Location).path()).toBe('/production/15');
    expect(service.getJob).toHaveBeenCalledWith('15', undefined);
    expect(router.routerState.snapshot.root.firstChild?.firstChild?.data['title']).toBe('Production');
  });
});
