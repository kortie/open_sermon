// Error codes of the sermon ingest pipeline. Messages carry the code only, never file content.
export type IngestErrorCode =
  | 'CONSENT_REQUIRED'
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE'
  | 'ENCODING'
  | 'DOCX_INVALID'
  | 'PDF_INVALID'
  | 'IMAGE_PDF'
  | 'EMPTY';

export class IngestError extends Error {
  constructor(readonly code: IngestErrorCode) {
    super(`sermon ingest: ${code}`);
    this.name = 'IngestError';
  }
}
