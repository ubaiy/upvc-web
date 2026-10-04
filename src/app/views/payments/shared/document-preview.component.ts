import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { DOCUMENT_PAGE_WIDTH, fitZoom, previewPage } from '../document-file';

/**
 * The api's own page of a document (challan, receipt) in a frame, so the
 * owner sees the sheet before printing it. The frame is sandboxed: nothing
 * in it can run. On a phone the sheet is scaled down to the width of the
 * screen; "Actual size" shows it at its real size, scrolling inside the frame.
 */
@Component({
  selector: 'app-document-preview',
  template: `
    <section class="card doc-preview" [attr.aria-label]="title + ' preview'">
      <div class="card-head">
        <h2>{{ title }} · preview</h2>
        <div class="u-row wrap">
          <ng-content></ng-content>
          <button type="button" class="btn btn-secondary" *ngIf="narrow" [attr.aria-pressed]="actualSize" (click)="toggleSize()">
            {{ actualSize ? 'Fit to screen' : 'Actual size' }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="closed.emit()">
            <app-icon name="x"></app-icon>Close preview
          </button>
        </div>
      </div>
      <iframe class="doc-frame" sandbox="" *ngIf="src" [src]="src" [title]="title + ' preview'"></iframe>
    </section>
  `,
  styles: [
    `
      :host { display: block; }
      .doc-preview { overflow: hidden; }
      .doc-frame { display: block; width: 100%; height: min(78vh, 1100px); border: 0; background: #fff; }
      h2 { margin: 0; font-size: var(--fs-16); }
      .card-head { flex-wrap: wrap; }
      .wrap { flex-wrap: wrap; justify-content: flex-end; gap: var(--s-2); margin-inline-start: auto; }
    `,
  ],
})
export class DocumentPreviewComponent implements OnChanges, OnDestroy {
  @Input() title = 'Document';

  /** The page as the api returned it (`format=html`). */
  @Input() html = '';

  /** The width the sheet is laid out at when the frame is narrower. */
  @Input() pageWidth = DOCUMENT_PAGE_WIDTH;

  @Output() closed = new EventEmitter<void>();

  src: SafeResourceUrl | null = null;
  /** True when the frame is narrower than the sheet. */
  narrow = false;
  actualSize = false;

  private url = '';
  private zoom = 1;

  constructor(private sanitizer: DomSanitizer, private host: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['html']) {
      this.actualSize = false;
    }
    this.draw();
    if (this.src) {
      setTimeout(() => this.host.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
    }
  }

  ngOnDestroy(): void {
    this.release();
  }

  toggleSize(): void {
    this.actualSize = !this.actualSize;
    this.draw();
  }

  /** A turned tablet or a resized window: fit again. */
  @HostListener('window:resize')
  onResize(): void {
    if (this.src && fitZoom(this.frameWidth, this.pageWidth) !== this.zoom) {
      this.draw();
    }
  }

  private get frameWidth(): number {
    return this.host.nativeElement.clientWidth || 0;
  }

  private draw(): void {
    this.release();
    if (!this.html) {
      return;
    }
    const frameWidth = this.frameWidth;
    this.zoom = fitZoom(frameWidth, this.pageWidth);
    this.narrow = this.zoom < 1;
    const page = previewPage(this.html, { frameWidth, pageWidth: this.pageWidth, zoom: this.actualSize ? 1 : this.zoom });
    this.url = URL.createObjectURL(new Blob([page], { type: 'text/html;charset=utf-8' }));
    // An address made here from the api's own page, shown in a sandboxed frame.
    this.src = this.sanitizer.bypassSecurityTrustResourceUrl(this.url);
  }

  private release(): void {
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = '';
      this.src = null;
    }
  }
}
