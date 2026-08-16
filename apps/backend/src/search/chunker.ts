import { CHUNK_OVERLAP_CHARS, CHUNK_SIZE_CHARS } from './search.constants.js';

export function chunkText(text: string): string[] {
  const chunks: string[] = [];

  if (text.length <= CHUNK_SIZE_CHARS) {
    chunks.push(text);
    return chunks;
  }

  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE_CHARS, text.length);
    chunks.push(text.slice(start, end));

    if (end === text.length) {
      break;
    }

    start = Math.max(start + CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS, 0);
  }

  return chunks;
}
