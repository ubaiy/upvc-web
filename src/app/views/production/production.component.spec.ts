import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';

import { AccessState } from '../../shared/access/access.models';
import { AccessService } from '../../shared/access/access.service';
import { me, subscription } from '../../shared/access/access.spec';
import { ACCESS_PARTS } from '../../shared/access/write.directive';
import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { ConfirmDialogComponent } from '../bills/confirm-dialog.component';
import { ToastService } from '../../shared/services/toast.service';
import { BarSettingsDialogComponent } from './bar-settings-dialog.component';
import { BAR_PLAN, JOB } from './production.adapter.spec';
import { ProductionComponent } from './production.component';
import { BarPlan, JobResult, ProductionJob } from './production.model';
import { ProductionModule } from './production.module';
import { ProductionService } from './production.service';

const job = (over: Partial<ProductionJob> = {}): Observable<JobResult> => of({ kind: 'job', job: { ...JOB, ...over } });
const planJob = (plan: Partial<BarPlan> = {}): Observable<JobResult> => job({ bar_plan: { ...BAR_PLAN, ...plan } });
const pdf = () => of({ blob: new Blob(['%PDF'], { type: 'application/pdf' }), fileName: null });
const SETTINGS = { bar_mm: 5800, steel_bar_mm: 6000, blade_mm: 6, end_trim_mm: 20, min_offcut_mm: 500 };

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
    service = jasmine.createSpyObj('ProductionService', ['getJob', 'freeze', 'getDocument', 'getBarSettings', 'saveBarSettings']);
    service.getBarSettings.and.returnValue(of({ settings: SETTINGS, defaults: SETTINGS }));
    service.saveBarSettings.and.returnValue(of({ settings: SETTINGS, defaults: SETTINGS }));
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError', 'showInfo']);
    saved = [];
    TestBed.configureTestingModule({
      declarations: [ProductionComponent],
      imports: [RouterTestingModule, NoopAnimationsModule, SharedComponentsModule, ConfirmDialogComponent, BarSettingsDialogComponent, ...ACCESS_PARTS],
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
    expect(el().querySelectorAll('.sk-doc').length).toBe(5);
    expect(el().querySelector('.btn-primary')).toBeNull();
  });

  it('shows the job, when it was frozen, its revision and the five documents', () => {
    create(job());
    expect(text()).toContain('Job Q-0003/P1');
    expect(text()).toContain('Frozen');
    expect(text()).toContain('by Tester');
    expect(text()).toContain('Revision 1');
    expect(text()).toContain('3 windows, 3 units');
    expect(text()).toContain('Al-Rashid Villa Windows · Ahmed Al-Rashid');
    const titles = Array.from(el().querySelectorAll('.doc h2')).map((h) => h.textContent);
    expect(titles).toEqual(['Cutting list', 'Bar plan', 'Glass order', 'Hardware order', 'Production sheets']);
    expect(text()).toContain('For buying and the saw: bars to order, the cuts on each bar, offcuts and waste.');
    for (const doc of Array.from(el().querySelectorAll('.doc'))) {
      const labels = Array.from(doc.querySelectorAll('button')).map((b) => (b.textContent || '').trim());
      expect(labels).toEqual(['Preview', 'Download PDF', 'Download Excel', 'Share']);
    }
  });

  it('a job with a 3D structure: the four lists say they are windows only, the sheets do not (T143)', () => {
    create(job({ structures: [{ line_id: 161, code: 'S2', name: 'Balcony cabin', type: 'cabin', quantity: 1, overall: { widthMm: 3600, depthMm: 2400, heightMm: 2700 } }] } as any));
    const notes = Array.from(el().querySelectorAll('.doc')).map((doc) => [doc.querySelector('h2')!.textContent!.trim(), !!doc.querySelector('[data-q="doc-no-structure"]')]);
    expect(notes).toEqual([
      ['Cutting list', true],
      ['Bar plan', true],
      ['Glass order', true],
      ['Hardware order', true],
      ['Production sheets', false],
    ]);
    expect(el().querySelector('[data-q="doc-no-structure"]')!.textContent).toContain('Windows only. The 3D structure is not on this document: see the production sheets.');
  });

  it('a job of windows only says nothing of structures on its documents (T143)', () => {
    create(job());
    expect(el().querySelector('[data-q="doc-no-structure"]')).toBeNull();
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

  it("shows the api's own notes as it sends them, in place of the reworded warnings", () => {
    create(
      job({
        warnings: [{ message: "No profile with role 'reinforcement' in the system.", windows: ['W1'] }],
        notes: [
          {
            code: 'profile_role_missing',
            text: 'No profile of the profile system is marked as steel reinforcement, so those pieces are listed without a profile code.',
            windows: ['W1', 'W2', 'W3'],
            where: { kind: 'product', field: 'role', value: 'reinforcement' },
          },
          { code: 'beads_missing', text: 'Some bead pieces are missing. Refresh the job to add them.', windows: ['W2'] },
        ],
      })
    );
    const items = Array.from(el().querySelectorAll('.warning-list li')).map((li) => (li.textContent || '').replace(/\s+/g, ' '));
    expect(items.length).toBe(2);
    expect(items[0]).toContain('No profile of the profile system is marked as steel reinforcement');
    expect(items[0]).toContain('All windows');
    expect(items[1]).toContain('Refresh the job to add them.W2');
    expect(text()).not.toContain('in the catalogue');
  });

  it('keeps the page clear of notes when the api sends an empty list', () => {
    create(job({ warnings: [{ message: 'Something raw', windows: ['W1'] }], notes: [] }));
    expect(el().querySelector('.warnings')).toBeNull();
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

  it('opens the preview inline in a sandboxed frame and closes it again', async () => {
    create(job());
    // The page reads the file's text before it shows the frame. The test holds that read itself and waits
    // for it, instead of waiting a fixed time that a busy machine can outlast.
    const blob = new Blob(['<html></html>'], { type: 'text/html' });
    const read = Promise.resolve('<html></html>');
    spyOn(blob, 'text').and.returnValue(read);
    service.getDocument.and.returnValue(of({ blob, fileName: null }));
    labelled('Preview Cutting list').click();
    await read;
    fixture.detectChanges();
    expect(service.getDocument).toHaveBeenCalledWith('14', 'cutting-list', 'html', 1);
    const frame = el().querySelector<HTMLIFrameElement>('iframe.preview-frame')!;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.src).toMatch(/^blob:/);
    expect(frame.title).toBe('Cutting list preview');
    button('Close preview').click();
    fixture.detectChanges();
    expect(el().querySelector('iframe')).toBeNull();
  });

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
    expect(text()).toContain('to make the cutting list, bar plan, glass order, hardware order and production sheets.');
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
    // One tap does not replace the revision the workshop may be cutting from.
    expect(service.freeze).not.toHaveBeenCalled();
    const dialog = el().querySelector('app-confirm-dialog')!;
    expect(dialog.textContent).toContain('Make revision 2 of Q-0003?');
    expect(dialog.textContent).toContain('Keep revision 1');
    (Array.from(dialog.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => (b.textContent || '').includes('Refresh job'))!.click();
    fixture.detectChanges();
    expect(el().querySelector('app-confirm-dialog')).toBeNull();
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
  describe('bar plan (card P6)', () => {
    // A dialog closed in a test finishes its leaving animation a moment later: wait for that before the page is torn down.
    afterEach(async () => fixture?.whenStable());

    const tabs = (): string[] => Array.from(el().querySelectorAll('.tab')).map((t) => (t.textContent || '').trim());
    const openBars = (): void => {
      Array.from(el().querySelectorAll<HTMLButtonElement>('.tab')).find((t) => (t.textContent || '').trim() === 'Bars')!.click();
      fixture.detectChanges();
    };
    const cells = (tr: Element): string[] => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim());
    const rows = (): string[][] => Array.from(el().querySelectorAll('table tbody tr')).map(cells);
    const stat = (label: string): string | undefined =>
      Array.from(el().querySelectorAll('app-stat'))
        .map((s) => Array.from(s.children).map((part) => (part.textContent || '').trim()).join(' '))
        .find((s) => s.startsWith(label));
    const dialogButton = (label: string): HTMLButtonElement =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('.p-dialog button')).find((b) => (b.textContent || '').includes(label))!;

    it('an older api sends no bar plan: the page is as it was, with no stat and no tab', () => {
      create(job());
      expect(tabs()).toEqual(['Profiles', 'Glass', 'Hardware']);
      expect(stat('Bars to buy')).toBeUndefined();
      expect(el().querySelectorAll('app-stat').length).toBe(3);
      expect(el().querySelector('.stats')!.classList.contains('stats-4')).toBeFalse();
      expect(text()).not.toContain('Bar settings');
    });

    it('shows the bars to buy beside the other three figures, as the api counted them', () => {
      create(planJob());
      expect(stat('Bars to buy')).toBe('Bars to buy 8 bars plus 1 steel bar, 1.7% waste');
      expect(el().querySelectorAll('app-stat').length).toBe(4);
      expect(el().querySelector('.stats')!.classList.contains('stats-4')).toBeTrue();
      expect(tabs()).toEqual(['Profiles', 'Glass', 'Hardware', 'Bars']);
    });

    it('leaves the stat out when the plan has no bars, but keeps the tab, which says so', () => {
      const none = { ...BAR_PLAN.totals.profile, bars: 0, pieces: 0, offcuts: 0 };
      create(planJob({ sections: [], totals: { profile: none, steel: { ...none } } }));
      expect(stat('Bars to buy')).toBeUndefined();
      expect(tabs()).toContain('Bars');
      openBars();
      expect(rows()).toEqual([['No profile sizes in this job.']]);
    });

    it('lists each profile with its bar, bars, offcuts and waste, then the sums', () => {
      create(planJob());
      openBars();
      const heads = Array.from(el().querySelectorAll('table th')).map((th) => (th.textContent || '').trim());
      expect(heads).toEqual(['Profile', 'Bar', 'Bars', 'Offcuts', 'Waste']);
      const table = rows();
      expect(table.length).toBe(5);
      expect(table[0][0]).toContain('Outer Frame');
      expect(table[0][0]).toContain('P60-K-X-R · Default');
      expect(table[0].slice(1, 5)).toEqual(['5800 mm', '3', '2', '2.7%']);
      expect(table[1][0]).toContain('Outward Sash');
      expect(table[1].slice(1, 5)).toEqual(['5800 mm', '5', '4', '1.0%']);
      expect(table[2][0]).toContain('GI Reinforcement');
      expect(table[2][0]).toContain('Steel reinforcement');
      expect(table[2].slice(1, 5)).toEqual(['5800 mm', '1', '0', '5.9%']);
      expect(table[3]).toEqual(['Profile total', '', '8', '6', '1.7%']);
      expect(table[4]).toEqual(['Steel total', '', '1', '0', '5.9%']);
      expect(el().querySelectorAll('table tbody tr.sum').length).toBe(2);
    });

    it('has one sum row, "Total", when the job has no steel', () => {
      create(planJob({ sections: BAR_PLAN.sections.filter((section) => !section.steel) }));
      openBars();
      expect(rows().slice(-1)).toEqual([['Total', '', '8', '6', '1.7%']]);
    });

    it('keeps its columns on a phone, and the table inside the card', () => {
      create(planJob());
      openBars();
      expect(el().querySelector('table')!.classList.contains('table-keep')).toBeTrue();
      expect(el().querySelector('table th:nth-child(2)')!.classList.contains('hide-phone')).toBeTrue();
    });

    it('says what the bars were worked out with, and nothing else when all is well', () => {
      create(planJob());
      openBars();
      expect(text()).toContain('Blade 6 mm · 20 mm trimmed from each end · offcuts from 500 mm kept, not counted as waste');
      expect(text()).not.toContain('standard values');
      expect(text()).not.toContain('No bar length is set');
      expect(text()).not.toContain('longer than the bar');
      expect(el().querySelector('.bars-notes')).toBeNull();
    });

    it('prints every waste figure with one decimal, as the paper does', () => {
      create(planJob());
      openBars();
      expect(text()).toContain('1.0%');
    });

    it('standard: says the job was made with standard values', () => {
      create(planJob({ standard: true }));
      openBars();
      expect(text()).toContain('Made with standard values. Refresh the job to use your own.');
    });

    it('assumed: names the profiles that have no bar length of their own', () => {
      create(planJob({ assumed: ['OLD-F · Old Frame', 'GI Reinforcement'] }));
      openBars();
      expect(text()).toContain('No bar length is set for OLD-F · Old Frame; GI Reinforcement. 5800 mm was used.');
    });

    it('too_long: warns, naming the pieces the api left out', () => {
      const sections = [{ ...BAR_PLAN.sections[0], too_long: [{ mm: 6200, code: 'W1', window: 'Hall', part: 'frame', qty: 1 }] }, ...BAR_PLAN.sections.slice(1)];
      create(planJob({ too_long: 1, sections }));
      openBars();
      const warn = el().querySelector('.bars-notes .callout.warn')!;
      expect((warn.textContent || '').replace(/\s+/g, ' ')).toContain('1 piece is longer than the bar and is not in this plan: W1 frame 6200 mm.');
    });

    it('shows Bar settings only on the Bars tab, as a secondary button', () => {
      create(planJob());
      expect(button('Bar settings')).toBeUndefined();
      openBars();
      expect(button('Bar settings').classList.contains('btn-secondary')).toBeTrue();
      expect(button('Bar settings').hasAttribute('hidden')).toBeFalse();
    });

    it('hides Bar settings from someone without production.write', () => {
      const state: AccessState = { me: me(['production.view'], 'viewer', 'Viewer'), subscription: subscription() };
      TestBed.overrideProvider(AccessService, { useValue: { state$: new BehaviorSubject(state), get state() { return state; } } });
      create(planJob());
      openBars();
      expect(button('Bar settings').hasAttribute('hidden')).toBeTrue();
      expect(text()).toContain('Blade 6 mm');
    });

    it('shows Bar settings to someone with production.write', () => {
      const state: AccessState = { me: me(['production.view', 'production.write'], 'workshop', 'Workshop'), subscription: subscription() };
      TestBed.overrideProvider(AccessService, { useValue: { state$: new BehaviorSubject(state), get state() { return state; } } });
      create(planJob());
      openBars();
      expect(button('Bar settings').hasAttribute('hidden')).toBeFalse();
    });

    it('opens the settings with the current values, saves them and says a refresh is needed', () => {
      create(planJob());
      openBars();
      expect(service.getBarSettings).not.toHaveBeenCalled();
      button('Bar settings').click();
      fixture.detectChanges();
      expect(service.getBarSettings).toHaveBeenCalledTimes(1);
      expect(document.querySelector('.p-dialog-title')?.textContent).toContain('Bar settings');
      dialogButton('Save').click();
      fixture.detectChanges();
      expect(service.saveBarSettings).toHaveBeenCalledOnceWith(SETTINGS);
      expect(toast.showSuccess).toHaveBeenCalledOnceWith('Saved. Refresh the job to use these.');
      expect(fixture.componentInstance.barSettingsOpen).toBeFalse();
      expect(service.getJob).toHaveBeenCalledTimes(1);
      expect(text()).toContain('8 bars');
    });

    it("keeps the dialog open with the api's refusal inside it, and no toast", () => {
      service.saveBarSettings.and.returnValue(throwError(() => new Error('The bar length must be 500 to 20000 mm.')));
      create(planJob());
      openBars();
      button('Bar settings').click();
      fixture.detectChanges();
      dialogButton('Save').click();
      fixture.detectChanges();
      expect(document.querySelector('.p-dialog [role="alert"]')?.textContent).toContain('The bar length must be 500 to 20000 mm.');
      expect(fixture.componentInstance.barSettingsOpen).toBeTrue();
      expect(toast.showSuccess).not.toHaveBeenCalled();
    });

    it('closes the dialog with Cancel and says nothing', () => {
      create(planJob());
      openBars();
      button('Bar settings').click();
      fixture.detectChanges();
      dialogButton('Cancel').click();
      fixture.detectChanges();
      expect(fixture.componentInstance.barSettingsOpen).toBeFalse();
      expect(toast.showSuccess).not.toHaveBeenCalled();
    });

    it('downloads and shares the bar plan like the other documents', () => {
      create(planJob());
      service.getDocument.and.returnValue(pdf());
      labelled('Download Bar plan as PDF').click();
      labelled('Download Bar plan as Excel').click();
      expect(service.getDocument).toHaveBeenCalledWith('14', 'bar-plan', 'pdf', 1, true);
      expect(service.getDocument).toHaveBeenCalledWith('14', 'bar-plan', 'xlsx', 1, true);
      expect(saved.map((file) => file.name)).toEqual(['Bar-plan-Q-0003-P1.pdf', 'Bar-plan-Q-0003-P1.xlsx']);
      expect(labelled('Preview Bar plan')).not.toBeNull();
      expect(labelled('Share Bar plan')).not.toBeNull();
    });

    it('goes back to Profiles when the job now on screen has no bar plan', () => {
      create(planJob());
      openBars();
      expect(fixture.componentInstance.tab).toBe('bars');
      service.getJob.and.returnValue(job());
      fixture.componentInstance.load();
      fixture.detectChanges();
      expect(fixture.componentInstance.tab).toBe('profiles');
      expect(text()).toContain('P60-K-X-R');
      expect(tabs()).toEqual(['Profiles', 'Glass', 'Hardware']);
    });

    it('keeps every control, the new tab and Bar settings at 44 px or more', () => {
      create(planJob());
      openBars();
      document.body.appendChild(el());
      const controls = Array.from(el().querySelectorAll<HTMLElement>('button.btn, select, .tab'));
      expect(controls.some((c) => (c.textContent || '').includes('Bar settings'))).toBeTrue();
      for (const control of controls) {
        expect(control.getBoundingClientRect().height).withContext(control.textContent!.trim()).toBeGreaterThanOrEqual(44);
      }
    });

    describe('layout at the width of this window (run at 390, 1440 and 1920)', () => {
      let page: HTMLElement;

      beforeEach(() => {
        // Everything at once: a long name, a long code, every note and a piece left out.
        const long = { ...BAR_PLAN.sections[0], name: 'Casement outward outer frame with a reinforcement chamber', code: 'CO-6040-R-REINFORCED-123456789', too_long: [{ mm: 6200, code: 'W1', window: 'Hall', part: 'frame', qty: 1 }] };
        create(planJob({ assumed: ['OLD-F · Old Frame'], standard: true, too_long: 1, sections: [long, ...BAR_PLAN.sections] }));
        // Like the shell: the screen sits in a .page.
        page = document.createElement('div');
        page.className = 'page';
        document.body.appendChild(page);
        page.appendChild(el());
        fixture.detectChanges();
      });

      afterEach(() => page.remove());

      const noSidewaysScroll = (why: string) => {
        const root = document.documentElement;
        expect(root.scrollWidth).withContext(`${why}: page scroll width ${root.scrollWidth} in a window of ${root.clientWidth}`).toBeLessThanOrEqual(root.clientWidth);
        for (const wide of Array.from(el().querySelectorAll<HTMLElement>('table, .stats, .docs, .bars-foot'))) {
          expect(wide.getBoundingClientRect().right).withContext(`${why}: ${wide.className || wide.tagName}`).toBeLessThanOrEqual(root.clientWidth + 0.5);
        }
      };

      it('never scrolls sideways, on any tab', () => {
        noSidewaysScroll('Profiles');
        for (const name of ['Glass', 'Hardware', 'Bars']) {
          Array.from(el().querySelectorAll<HTMLButtonElement>('.tab')).find((t) => (t.textContent || '').trim() === name)!.click();
          fixture.detectChanges();
          noSidewaysScroll(name);
        }
      });

      it('keeps the Bar settings dialog inside the window', () => {
        Array.from(el().querySelectorAll<HTMLButtonElement>('.tab')).find((t) => (t.textContent || '').trim() === 'Bars')!.click();
        fixture.detectChanges();
        button('Bar settings').click();
        fixture.detectChanges();
        const box = document.querySelector('.p-dialog')!.getBoundingClientRect();
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(document.documentElement.clientWidth + 0.5);
        const content = document.querySelector('.p-dialog-content')!;
        expect(content.scrollWidth).toBeLessThanOrEqual(content.clientWidth);
        for (const input of Array.from(document.querySelectorAll<HTMLElement>('.p-dialog input, .p-dialog button'))) {
          expect(input.getBoundingClientRect().right).toBeLessThanOrEqual(box.right + 0.5);
        }
      });

      it('sets the five document cards in the grid: none outside it, none over another', () => {
        const grid = el().querySelector('.docs')!.getBoundingClientRect();
        const cards = Array.from(el().querySelectorAll('.doc')).map((card) => card.getBoundingClientRect());
        expect(cards.length).toBe(5);
        for (const card of cards) {
          expect(card.left).toBeGreaterThanOrEqual(grid.left - 0.5);
          expect(card.right).toBeLessThanOrEqual(grid.right + 0.5);
        }
        for (let i = 0; i < cards.length; i++) {
          for (let j = i + 1; j < cards.length; j++) {
            const apart = cards[i].bottom <= cards[j].top + 0.5 || cards[j].bottom <= cards[i].top + 0.5 || cards[i].right <= cards[j].left + 0.5 || cards[j].right <= cards[i].left + 0.5;
            expect(apart).withContext(`cards ${i} and ${j}`).toBeTrue();
          }
        }
        if (window.innerWidth > 900) {
          // Two to a row, and the odd one out takes the whole last row.
          expect(Math.abs(cards[0].top - cards[1].top)).toBeLessThan(1);
          expect(Math.abs(cards[2].top - cards[3].top)).toBeLessThan(1);
          expect(Math.abs(cards[4].width - grid.width)).toBeLessThan(1);
        } else {
          expect(cards.every((card) => Math.abs(card.width - grid.width) < 1)).toBeTrue();
        }
      });

      it('keeps the four figures in a row on a wide screen, one under another on a phone', () => {
        const figures = Array.from(el().querySelectorAll('.stats > app-stat')).map((s) => s.getBoundingClientRect());
        expect(figures.length).toBe(4);
        if (window.innerWidth >= 1280) {
          expect(new Set(figures.map((f) => Math.round(f.top))).size).toBe(1);
        } else if (window.innerWidth <= 700) {
          expect(new Set(figures.map((f) => Math.round(f.left))).size).toBe(1);
        }
        for (const figure of figures) {
          expect(figure.right).toBeLessThanOrEqual(window.innerWidth + 0.5);
        }
      });
    });
  });

  describe('from the job of one quotation straight to the job of another: only the id in the address changes (T91)', () => {
    let params: BehaviorSubject<any>;
    const other = (): Observable<JobResult> => job({ number: 'Q-0009/P1', quotation: { ...JOB.quotation, number: 'Q-0009' } });

    beforeEach(() => {
      params = new BehaviorSubject(convertToParamMap({ quotationId: '14' }));
      TestBed.overrideProvider(ActivatedRoute, { useValue: { paramMap: params } });
    });

    function goTo(quotationId: string, result: Observable<JobResult>): void {
      service.getJob.and.returnValue(result);
      params.next(convertToParamMap({ quotationId }));
      fixture.detectChanges();
    }

    it('shows the second job and nothing asked on the first', () => {
      create(job());
      fixture.componentInstance.refreshAsking = true;
      goTo('20', other());
      expect(service.getJob.calls.mostRecent().args).toEqual(['20', undefined]);
      expect(text()).toContain('Job Q-0009/P1');
      expect(text()).not.toContain('Q-0003/P1');
      expect(fixture.componentInstance.refreshAsking).toBeFalse();
    });

    it('a first job that answers late is not shown over the second', () => {
      const slow = new Subject<JobResult>();
      create(slow);
      goTo('20', other());
      expect(slow.observed).withContext('the first load is cancelled').toBeFalse();
      slow.next({ kind: 'job', job: JOB });
      fixture.detectChanges();
      expect(text()).toContain('Job Q-0009/P1');
    });

    it('a freeze of the first quotation answered late is not shown as the job of the second', () => {
      create(of({ kind: 'no-job' } as JobResult));
      const answer = new Subject<JobResult>();
      service.freeze.and.returnValue(answer);
      fixture.componentInstance.freeze();
      goTo('20', other());
      expect(fixture.componentInstance.freezing).withContext('the second job is not held up by the first').toBeFalse();
      answer.next({ kind: 'job', job: JOB });
      fixture.detectChanges();
      expect(text()).toContain('Job Q-0009/P1');
      expect(toast.showSuccess).not.toHaveBeenCalled();
    });

    it('a document of the first job that fails late says nothing on the second', () => {
      create(job());
      const answer = new Subject<any>();
      service.getDocument.and.returnValue(answer);
      fixture.componentInstance.download('cutting-list' as any, 'pdf', 'Cutting list');
      goTo('20', other());
      expect(fixture.componentInstance.busy).toBeNull();
      answer.error(new Error('late'));
      fixture.detectChanges();
      expect(fixture.componentInstance.actionError).toBeNull();
    });
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
