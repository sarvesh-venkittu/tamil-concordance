// Runs in a worker thread: reads one file and turns it into clean Tamil lines.
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs/promises';
import { extractPdf, extractHtmlOrText } from './lib/extract.js';

async function run() {
  const { filePath } = workerData;
  const buf = await fs.readFile(filePath);
  const lower = filePath.toLowerCase();
  let result;
  if (lower.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    result = await extractPdf(pdfjs, new Uint8Array(buf), filePath, (value) => parentPort.postMessage({ type: 'progress', value }));
  } else {
    let text = new TextDecoder('utf-8').decode(buf);
    const charset = (text.match(/charset=["']?([\w-]+)/i) || [])[1];
    if (charset && !/utf-?8/i.test(charset)) {
      try { text = new TextDecoder(charset).decode(buf); } catch { /* keep utf-8 */ }
    }
    result = extractHtmlOrText(text, filePath, /\.html?$/.test(lower));
  }
  parentPort.postMessage({ type: 'done', result });
}

run().catch((err) => parentPort.postMessage({ type: 'error', message: err.message || String(err) }));
