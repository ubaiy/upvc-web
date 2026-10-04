import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { finalize } from 'rxjs/operators';
import { saveAs } from 'file-saver';

import { ToastService } from 'src/app/shared/services/toast.service';
import { QuotationService } from '../../quotation.service';
import { errorText } from '../../quotation-list.model';
import { pdfFileName, QuotationView } from '../detail/quotation-detail.model';

export type SendChannel = 'whatsapp' | 'email' | 'download';

/** A4 at 96 dpi: the width the document is laid out for. */
const PAGE_WIDTH = 794;

/**
 * "Send quotation" (flow gap G13): the document as the customer will receive
 * it, with three ways to send it. WhatsApp opens a chat with a short message
 * and a link to the PDF; Email sends it with the PDF attached; Download saves
 * the file. Any of the three marks the quotation Sent with today's date.
 *
 * Nothing about margin or tax is asked here: the Summary card decided them.
 *
 *   <app-send-quotation-dialog [visible]="open" [quotation]="view"
 *     (closed)="open = false" (sent)="reload()"></app-send-quotation-dialog>
 */
@Component({
  selector: 'app-send-quotation-dialog',
  templateUrl: './send-quotation-dialog.component.html',
  styleUrls: ['./send-quotation-dialog.component.scss'],
})
export class SendQuotationDialogComponent implements OnChanges {
  @Input() visible = false;

  @Input() quotation: QuotationView | null = null;

  @Output() closed = new EventEmitter<void>();

  /** The quotation was sent by this channel and is now marked Sent. */
  @Output() sent = new EventEmitter<SendChannel>();

  @ViewChild('pane') pane?: ElementRef<HTMLElement>;

  preview: SafeHtml | null = null;
  previewLoading = false;
  previewFailed = false;

  phone = '';
  email = '';
  /** The channel in flight. */
  sending: SendChannel | '' = '';
  /** The error of the last try, shown under the button that was pressed. */
  error: { channel: SendChannel; text: string } | null = null;

  constructor(
    private _dataService: QuotationService,
    private _sanitizer: DomSanitizer,
    private _toast: ToastService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.quotation) {
      this.phone = this.quotation.customer.phone;
      this.email = this.quotation.customer.email;
      this.error = null;
      this.loadPreview();
    }
    if (changes['visible'] && !this.visible) {
      this.preview = null;
    }
  }

  get phoneMissing(): boolean {
    return this.phone.replace(/\D/g, '').length < 10;
  }

  get emailMissing(): boolean {
    return !/^\S+@\S+\.\S+$/.test(this.email.trim());
  }

  loadPreview(): void {
    this.previewLoading = true;
    this.previewFailed = false;
    this._dataService
      .getQuotationPreview(this.quotation!.id)
      .pipe(finalize(() => (this.previewLoading = false)))
      .subscribe({
        next: (html) => (this.preview = this._frame(html)),
        error: () => (this.previewFailed = true),
      });
  }

  close(): void {
    if (!this.sending) {
      this.closed.emit();
    }
  }

  errorFor(channel: SendChannel): string {
    return this.error?.channel === channel ? this.error.text : '';
  }

  send(channel: SendChannel): void {
    const q = this.quotation;
    if (!q || this.sending) {
      return;
    }
    this.error = null;
    if (channel === 'whatsapp' && this.phoneMissing) {
      this.error = { channel, text: 'Enter the customer’s 10-digit mobile number.' };
      return;
    }
    if (channel === 'email' && this.emailMissing) {
      this.error = { channel, text: 'Enter the customer’s email address.' };
      return;
    }
    const body: any = { channel };
    if (channel === 'whatsapp') {
      body.phone = this.phone.trim();
    } else if (channel === 'email') {
      body.to = this.email.trim();
    }
    // A tab opened after the answer arrives is blocked as a pop-up; open it now and point it at the chat later.
    const chat = channel === 'whatsapp' ? window.open('', '_blank') : null;
    this.sending = channel;
    this._dataService
      .sendQuotation(q.id, body)
      .pipe(finalize(() => (this.sending = '')))
      .subscribe({
        next: (res) => {
          if (!res?.success) {
            chat?.close();
            this.error = { channel, text: res?.message || 'The quotation was not sent. Try again.' };
            return;
          }
          this._afterSend(channel, q, res.data, chat);
        },
        error: (err) => {
          chat?.close();
          this.error = { channel, text: errorText(err, 'The quotation was not sent. Check your connection.') };
        },
      });
  }

  private _afterSend(channel: SendChannel, q: QuotationView, data: any, chat: Window | null): void {
    // Tell the page first, so its status refreshes before the PDF is fetched.
    this.sent.emit(channel);
    if (channel === 'whatsapp') {
      if (chat && data?.whatsapp_url) {
        chat.location.href = data.whatsapp_url;
      } else if (data?.whatsapp_url) {
        window.open(data.whatsapp_url, '_blank');
      }
      this._toast.showSuccess('WhatsApp opened with the message. The quotation is marked as sent.');
    } else if (channel === 'email') {
      this._toast.showSuccess(`Emailed to ${data?.emailed_to || this.email.trim()}. The quotation is marked as sent.`);
    } else {
      this._dataService.getQuotationPdf(q.id).subscribe({
        next: (file) => saveAs(file.blob, file.fileName || pdfFileName(q)),
        error: () => this._toast.showError('The quotation is marked as sent, but the PDF could not be downloaded. Use the PDF button.'),
      });
      this._toast.showSuccess('PDF downloaded. The quotation is marked as sent.');
    }
  }

  /**
   * The document is laid out for an A4 sheet. In the dialog it is shown at
   * the width of the pane: the page margins a printer would add are put back,
   * and the whole page is scaled down to fit. The frame is sandboxed; the
   * markup comes from our own API and holds no scripts.
   */
  private _frame(html: string): SafeHtml {
    const width = this.pane?.nativeElement.clientWidth || PAGE_WIDTH;
    const zoom = Math.min(1, Math.max(0.4, width / PAGE_WIDTH));
    const style = `<style>html{zoom:${zoom.toFixed(3)};background:#fff}body{box-sizing:border-box;width:${PAGE_WIDTH}px;padding:13mm 14mm;margin:0}</style>`;
    const framed = html.includes('</head>') ? html.replace('</head>', style + '</head>') : style + html;
    return this._sanitizer.bypassSecurityTrustHtml(framed);
  }
}
