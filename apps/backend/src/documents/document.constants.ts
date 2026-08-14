export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const MAX_NAME_LENGTH = 30;

export const PDF_MAGIC_NUMBER = '%PDF-';

export const ALLOWED_MIME_TYPES: Readonly<Record<string, string>> = {
  'application/pdf': '.pdf',
};
