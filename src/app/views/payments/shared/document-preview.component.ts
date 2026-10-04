import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { previewPage } from '../document-file';

/**
 * The api's own page of a document (challan, receipt) in a frame, so the
 * owner sees the sheet before printing it. The frame is sandboxed: nothing
 * in it can run.
 */
@Component({
  selector: 'app-document-preview',
  template: `
    <section class="card doc-preview" [attr.aria-label]="title + ' preview'">
      <div class="card-head">
        <h2>{{ title }} · preview</h2>
        <div class="u-row wrap">
          <ng-content></ng-content>
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
      .wrap { flex-wrap: wrap; }
    `,
  ],
})
export class DocumentPreviewComponent implements OnChanges, OnDestroy {
  @Input() title = 'Document';

  /** The page as the api returned it (`format=html`). */
  @Input() html = '';

  @Output() closed = new EventEmitter<void>();

  src: SafeResourceUrl | null = null;
  private url = '';

  constructor(private sanitizer: DomSanitizer, private host: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    this.release();
    if (!this.html) {
      return;
    }
    this.url = URL.createObjectURL(new Blob([previewPage(this.html)], { type: 'text/html;charset=utf-8' }));
    // An address made here from the api's own page, shown in a sandboxed frame.
    this.src = this.sanitizer.bypassSecurityTrustResourceUrl(this.url);
    setTimeout(() => this.host.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  }

  ngOnDestroy(): void {
    this.release();
  }

  private release(): void {
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = '';
      this.src = null;
    }
  }
}
