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

/** The narrowest a receipt or a challan is laid out; a workshop sheet (A4, wide tables) passes its own. */
export const DOCUMENT_PAGE_WIDTH = 560;
/** A delivery challan has a drawing and five columns a row: it needs more room. */
export const CHALLAN_PAGE_WIDTH = 660;

const SCROLLBAR = 16;

/**
 * How much the page is scaled down to fit a frame `frameWidth` px wide:
 * 1 when it fits as it is. Not below 0.4, where nothing could be read.
 */
export function fitZoom(frameWidth: number, pageWidth = DOCUMENT_PAGE_WIDTH): number {
  if (!frameWidth || frameWidth >= pageWidth) {
    return 1;
  }
  // The frame's own scrollbar takes up to 16 px of the width.
  return Math.max(0.4, Math.round(((frameWidth - SCROLLBAR) / pageWidth) * 1000) / 1000);
}

/**
 * The api's page with the screen rules added. On a frame narrower than the
 * page (a phone) the page keeps its own width, so nothing in it is cut or
 * squeezed, and is scaled down as a whole with `zoom`. With `zoom` 1 on a
 * narrow frame the page is shown at its real size and scrolls inside the frame.
 */
export function previewPage(html: string, fit?: { frameWidth: number; pageWidth?: number; zoom?: number }): string {
  let style = SCREEN_STYLE;
  const pageWidth = fit?.pageWidth || DOCUMENT_PAGE_WIDTH;
  if (fit && fit.frameWidth > 0 && fit.frameWidth < pageWidth) {
    const zoom = fit.zoom ?? fitZoom(fit.frameWidth, pageWidth);
    style += `<style>@media screen { html { zoom: ${zoom}; } body { box-sizing: border-box; width: ${pageWidth}px; max-width: none; } }</style>`;
  }
  const head = /<\/head>/i;
  return head.test(html) ? html.replace(head, style + '</head>') : style + html;
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
