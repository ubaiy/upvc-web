import { HttpResponse } from '@angular/common/http';
import { Observable, from, of, switchMap, throwError } from 'rxjs';
import { DownloadedFile, fileNameFromHeader, saveBlob } from '../../shared/class/download-file';

export { fileNameFromHeader, saveBlob };

/** A printable document of the api (challan, receipt) as a file, named by the api. */
export type DocumentFile = DownloadedFile;

export type DocumentFormat = 'pdf' | 'html';

const MIME: Record<DocumentFormat, string> = {
  pdf: 'application/pdf',
  html: 'text/html;charset=utf-8',
};

/** `Receipt-RCT-26-27-0001.pdf`: the name used when the api sent none. */
export function documentName(prefix: string, number: string): string {
  return `${prefix}-${number.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
}

/**
 * The api answers a refusal as JSON with HTTP 200, so a JSON body where a
 * document was asked for is an error carrying the api's message.
 */
export function readDocument(response: HttpResponse<Blob>, format: DocumentFormat): Observable<DocumentFile> {
  const body = response.body;
  if (!body || !body.size) {
    return throwError(() => new Error('The document came back empty.'));
  }
  if (/json/i.test(body.type)) {
    return from(body.text()).pipe(
      switchMap((raw) => {
        let message = 'The document could not be made.';
        try {
          message = JSON.parse(raw)?.message || message;
        } catch {
          // keep the general message
        }
        return throwError(() => new Error(message));
      })
    );
  }
  // The type is set here so a saved or shared file opens in the right app.
  return of({
    blob: new Blob([body], { type: MIME[format] }),
    fileName: fileNameFromHeader(response.headers.get('Content-Disposition')),
  });
}

/** Screen-only rules for the preview frame: the page sits centred on white, like the printed sheet. */
const SCREEN_STYLE =
  '<style>@media screen { html { background: #fff; } body { max-width: 186mm; margin: 0 auto !important; padding: 16px; } }</style>';

export function previewPage(html: string): string {
  const head = /<\/head>/i;
  return head.test(html) ? html.replace(head, SCREEN_STYLE + '</head>') : SCREEN_STYLE + html;
}

export type ShareOutcome = 'shared' | 'saved' | 'dismissed';

/**
 * The share sheet of the tablet or phone (WhatsApp, email). Where the browser
 * has none, or refuses the file, the PDF is downloaded instead.
 * Resolves to what happened, so the screen can say so.
 */
export function shareOrSave(file: File, title: string): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    return nav.share({ files: [file], title }).then(
      (): ShareOutcome => 'shared',
      (error: any): ShareOutcome => {
        // Closing the share sheet is not a failure.
        if (error?.name === 'AbortError') {
          return 'dismissed';
        }
        saveBlob(file, file.name);
        return 'saved';
      }
    );
  }
  saveBlob(file, file.name);
  return Promise.resolve<ShareOutcome>('saved');
}

/** The reason to show when a document call failed: the api's own, else the connection. */
export function documentError(error: any, what: string): string {
  return `${what} ${error instanceof Error && error.message ? error.message : 'Check your connection.'}`;
}
