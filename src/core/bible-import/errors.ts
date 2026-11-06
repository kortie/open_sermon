// Error codes of the txt bible import (DESIGN 3.14). Messages carry the code only, never file content.
export type ImportErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE'
  | 'ENCODING'
  | 'EMPTY'
  | 'MIXED_FORMAT'
  | 'UNKNOWN_FORMAT'
  | 'CONSENT_REQUIRED'
  | 'TOO_MANY_WARNINGS'
  | 'BAD_NAME';

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(`bible import: ${code}`);
    this.name = 'ImportError';
  }
}
