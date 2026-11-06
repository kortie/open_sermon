// Browser pdf.js loader. Imported dynamically from the upload screen only (lazy chunk).
// Legacy build: the modern build needs very recent JS built-ins that older phones lack.
// Worker and Korean CMaps are same-origin files (CSP worker-src/connect-src 'self'; no CDN).
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PdfDocument, PdfLoader } from './pdf';

/** Same path the open-sermon:pdf-cmaps Vite plugin serves the Korean CMaps from. */
export const CMAP_DIR = 'cmaps/';

let configured = false;

export const browserPdfLoader: PdfLoader = async (bytes) => {
  if (!configured) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    configured = true;
  }
  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: new URL(CMAP_DIR, document.baseURI).href,
    cMapPacked: true,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;
  return { doc: doc as unknown as PdfDocument, close: () => task.destroy() };
};
