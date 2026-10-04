import { HttpResponse } from '@angular/common/http';

/** A file the api sent, with the name it gave it. */
export interface DownloadedFile {
  blob: Blob;
  /** From the Content-Disposition header ("Quotation-Q-0003-Ahmed-Al-Rashid.pdf"), or null when the api sent none. */
  fileName: string | null;
}

/** The file name inside a Content-Disposition header, or null. */
export function fileNameFromHeader(disposition: string | null): string | null {
  if (!disposition) {
    return null;
  }
  const encoded = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // fall through to the plain name
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1].trim() : null;
}

/** The body of a download answer with the api's own file name. */
export function downloadedFile(response: HttpResponse<Blob>): DownloadedFile {
  return {
    blob: response.body ?? new Blob(),
    fileName: fileNameFromHeader(response.headers.get('Content-Disposition')),
  };
}

/** Hands a file to the browser's downloads. */
export function saveBlob(blob: Blob, name: string): void {
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
