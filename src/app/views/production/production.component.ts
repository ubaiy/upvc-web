import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

import { Crumb } from '../../shared/components/page-header/page-header.component';
import { ToastService } from '../../shared/services/toast.service';
import {
  DOCUMENTS,
  DocumentCard,
  JobSummary,
  PlainWarning,
  SHEET_PAGE_WIDTH,
  fileName,
  fitZoom,
  noteLines,
  plainWarnings,
  previewPage,
  summarise,
} from './production.adapter';
import { DocumentFormat, DocumentType, JobResult, ProductionJob } from './production.model';
import { ProductionService } from './production.service';

type State = 'loading' | 'error' | 'no-job' | 'no-windows' | 'ready';
type SummaryTab = 'profiles' | 'glass' | 'hardware';

/**
 * Production page of one quotation (roadmap card P5): freeze the job, then
 * preview, download or share the four workshop documents, or take them all
 * as one pack. Sizes, totals, the "not verified" banner and the warnings are
 * the api's; nothing is measured or priced here.
 */
@Component({
  selector: 'app-production',
  templateUrl: './production.component.html',
  styleUrls: ['./production.component.scss'],
})
export class ProductionComponent implements OnInit, OnDestroy {
  @ViewChild('previewCard') previewCard?: ElementRef<HTMLElement>;

  state: State = 'loading';
  quotationId = '';
  job: ProductionJob | null = null;
  summary: JobSummary | null = null;
  warnings: PlainWarning[] = [];
  /** Newest first. */
  revisions: number[] = [];
  errorMessage = '';
  freezing = false;
  /** The button that is working, as "<document>:<action>". */
  busy: string | null = null;
  /** A failed action, shown above the documents with "Try again". */
  actionError: { message: string; retry: () => void } | null = null;
  /**
   * The document on screen. On a frame narrower than the sheet (`narrow`) it is
   * scaled down to fit; `actualSize` shows it at its real size instead.
   */
  preview: { doc: DocumentCard; src: SafeResourceUrl; url: string; html: string; zoom: number; narrow: boolean; actualSize: boolean } | null = null;
  tab: SummaryTab = 'profiles';

  readonly documents = DOCUMENTS;
  readonly placeholders = [0, 1, 2, 3];

  private params?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private service: ProductionService,
    private toast: ToastService,
    private sanitizer: DomSanitizer,
    private host: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    this.params = this.route.paramMap.subscribe((params) => {
      this.quotationId = params.get('quotationId') || '';
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.params?.unsubscribe();
    this.closePreview();
  }

  get crumbs(): Crumb[] {
    return [
      { label: 'Quotations', link: '/quotation' },
      { label: this.job?.quotation?.number || 'Quotation', link: this.quotationLink },
      { label: 'Production' },
    ];
  }

  get quotationLink(): any[] {
    return ['/quotation/detail', this.quotationId];
  }

  /** "Al-Rashid Villa Windows · Ahmed Al-Rashid" */
  get subtitle(): string {
    return [this.job?.quotation?.name, this.job?.customer?.name].filter(Boolean).join(' · ');
  }

  get isNewest(): boolean {
    return !!this.job && this.job.revision >= this.job.latest_revision;
  }

  load(revision?: number): void {
    this.state = 'loading';
    this.actionError = null;
    this.closePreview();
    this.service.getJob(this.quotationId, revision).subscribe({
      next: (result) => this.show(result),
      error: () => this.fail('We could not load the production job. Check your connection.'),
    });
  }

  /** Reloads what was on screen: the same revision when one was open. */
  retry(): void {
    this.load(this.job && !this.isNewest ? this.job.revision : undefined);
  }

  /** True while "Refresh job" waits for a yes: the workshop may be cutting from the revision on screen. */
  refreshAsking = false;

  /** "Refresh job": a new revision is not made in one tap. */
  askRefresh(): void {
    if (!this.freezing) {
      this.refreshAsking = true;
    }
  }

  confirmRefresh(): void {
    this.refreshAsking = false;
    this.freeze(true);
  }

  /** Freezes the quotation, or with `refresh` makes a new revision from it as it is now. */
  freeze(refresh = false): void {
    if (this.freezing) {
      return;
    }
    this.freezing = true;
    this.actionError = null;
    this.service.freeze(this.quotationId, refresh).subscribe({
      next: (result) => {
        this.freezing = false;
        if (result.kind === 'refused') {
          this.actionError = { message: result.message, retry: () => this.freeze(refresh) };
          return;
        }
        this.closePreview();
        this.show(result);
        if (result.kind === 'job') {
          this.toast.showSuccess(`Production job ${result.job.number} is ready`);
        }
      },
      error: () => {
        this.freezing = false;
        this.actionError = {
          message: 'We could not freeze the job. Check your connection.',
          retry: () => this.freeze(refresh),
        };
      },
    });
  }

  showRevision(value: string): void {
    const revision = Number(value);
    if (revision && revision !== this.job?.revision) {
      this.load(revision);
    }
  }

  isBusy(type: DocumentType | 'pack', action: string): boolean {
    return this.busy === `${type}:${action}`;
  }

  download(type: DocumentType | 'pack', format: DocumentFormat, title: string): void {
    const job = this.job;
    if (!job || this.busy) {
      return;
    }
    this.start(type, format);
    this.service.getDocument(this.quotationId, type, format, job.revision, true).subscribe({
      next: (file) => {
        this.busy = null;
        this.save(file.blob, file.fileName || fileName(job, type, format));
      },
      error: (error) => this.failed(error, `${title} could not be downloaded.`, () => this.download(type, format, title)),
    });
  }

  /** The share sheet of the tablet or phone (WhatsApp, email); elsewhere the PDF is downloaded. */
  share(doc: DocumentCard): void {
    const job = this.job;
    if (!job || this.busy) {
      return;
    }
    this.start(doc.type, 'share');
    this.service.getDocument(this.quotationId, doc.type, 'pdf', job.revision, true).subscribe({
      next: (file) => {
        this.busy = null;
        const name = file.fileName || fileName(job, doc.type, 'pdf');
        this.shareFile(new File([file.blob], name, { type: 'application/pdf' }), `${doc.title} ${job.number}`);
      },
      error: (error) => this.failed(error, `${doc.title} could not be shared.`, () => this.share(doc)),
    });
  }

  openPreview(doc: DocumentCard): void {
    const job = this.job;
    if (!job || this.busy) {
      return;
    }
    this.start(doc.type, 'preview');
    this.service.getDocument(this.quotationId, doc.type, 'html', job.revision).subscribe({
      next: (file) => {
        file.blob.text().then((html) => {
          this.busy = null;
          this.drawPreview(doc, html, false);
          setTimeout(() => this.previewCard?.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
        });
      },
      error: (error) => this.failed(error, `${doc.title} could not be opened.`, () => this.openPreview(doc)),
    });
  }

  /** "Actual size" and "Fit to screen" on a phone. */
  togglePreviewSize(): void {
    const open = this.preview;
    if (open) {
      this.drawPreview(open.doc, open.html, !open.actualSize);
    }
  }

  /** A turned tablet or a resized window: fit again. */
  @HostListener('window:resize')
  onResize(): void {
    const open = this.preview;
    if (open && fitZoom(this.host.nativeElement.clientWidth, SHEET_PAGE_WIDTH) !== open.zoom) {
      this.drawPreview(open.doc, open.html, open.actualSize);
    }
  }

  private drawPreview(doc: DocumentCard, html: string, actualSize: boolean): void {
    this.closePreview();
    const frameWidth = this.host.nativeElement.clientWidth || 0;
    const zoom = fitZoom(frameWidth, SHEET_PAGE_WIDTH);
    const page = previewPage(html, { frameWidth, pageWidth: SHEET_PAGE_WIDTH, zoom: actualSize ? 1 : zoom });
    const url = URL.createObjectURL(new Blob([page], { type: 'text/html;charset=utf-8' }));
    // An address made here from the api's own page; the frame is sandboxed, so nothing in it can run.
    this.preview = { doc, url, html, zoom, narrow: zoom < 1, actualSize, src: this.sanitizer.bypassSecurityTrustResourceUrl(url) };
  }

  closePreview(): void {
    if (this.preview) {
      URL.revokeObjectURL(this.preview.url);
      this.preview = null;
    }
  }

  trackByType(_: number, doc: DocumentCard): string {
    return doc.type;
  }

  /** Hands a file to the browser's downloads. */
  protected save(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  protected shareFile(file: File, title: string): void {
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      nav.share({ files: [file], title }).catch((error: any) => {
        // Closing the share sheet is not a failure.
        if (error?.name !== 'AbortError') {
          this.downloadInstead(file);
        }
      });
      return;
    }
    this.downloadInstead(file);
  }

  private downloadInstead(file: File): void {
    this.save(file, file.name);
    this.toast.showInfo(`${file.name} was downloaded. Attach it to WhatsApp or an email to share it.`);
  }

  private show(result: JobResult): void {
    switch (result.kind) {
      case 'job':
        this.job = result.job;
        this.summary = summarise(result.job);
        // The api's own lines when it sends them; the raw warnings reworded here only for an older api.
        this.warnings = Array.isArray(result.job.notes)
          ? noteLines(result.job.notes, result.job.window_count)
          : plainWarnings(result.job.warnings, result.job.window_count);
        this.revisions = Array.from({ length: result.job.latest_revision || 1 }, (_, i) => i + 1).reverse();
        this.state = 'ready';
        break;
      case 'no-job':
        this.job = null;
        this.state = 'no-job';
        break;
      case 'no-windows':
        this.job = null;
        this.state = 'no-windows';
        break;
      default:
        this.fail(result.message);
    }
  }

  private fail(message: string): void {
    this.errorMessage = message;
    this.state = 'error';
  }

  private start(type: DocumentType | 'pack', action: string): void {
    this.busy = `${type}:${action}`;
    this.actionError = null;
  }

  private failed(error: any, fallback: string, retry: () => void): void {
    this.busy = null;
    // An Error carries the api's own reason; anything else is the connection.
    const reason = error instanceof Error && error.message ? error.message : 'Check your connection.';
    this.actionError = { message: `${fallback} ${reason}`, retry };
  }
}
