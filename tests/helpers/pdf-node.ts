// pdf.js loader for unit tests (Node, legacy build, no worker file needed: pdf.js falls back to a
// fake worker in Node). CMaps are read from the package directory.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { PdfDocument, PdfLoader } from '../../src/core/sermon/parse/pdf';

const require = createRequire(import.meta.url);
const cmaps = join(dirname(require.resolve('pdfjs-dist/package.json')), 'cmaps') + '/';

export const nodePdfLoader: PdfLoader = async (bytes) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), cMapUrl: cmaps, cMapPacked: true, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  return { doc: doc as unknown as PdfDocument, close: () => task.destroy() };
};
