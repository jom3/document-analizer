import { createRequire } from 'node:module';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const worker = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const here = dirname(fileURLToPath(import.meta.url));
const destDir = resolve(here, '../public/pdfjs');
const dest = resolve(destDir, 'pdf.worker.min.mjs');

await mkdir(destDir, { recursive: true });
await copyFile(worker, dest);
console.log('PDF.js worker copiado a public/pdfjs/pdf.worker.min.mjs');
