// Extracts clean Tamil lines from a Project Madurai PDF (or HTML/text file).
// Works with any pdf.js build passed in, so the same code runs in the app and in tests.
import { planFonts, decodeRun, fixLine, collapseRepeats, tamilWords, tamilRatio, clean } from './tamilfix.js';

const SAMPLE_PAGES = 25;

async function readPages(doc, onProgress) {
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.filter((it) => typeof it.str === 'string'));
    page.cleanup();
    if (onProgress) onProgress(i / doc.numPages * 0.8);
  }
  return pages;
}

function buildLines(items, plan) {
  const lines = [];
  let cur = '';
  let lastY = null, lastEndX = null, lastSize = 10, prev = null;
  const push = () => {
    const l = fixLine(cur, plan.visual);
    if (l) lines.push(l);
    cur = '';
  };
  for (const it of items) {
    // drop exact overprints (the same run printed again on top of itself to fake bold)
    if (prev && prev.str === it.str && Math.abs(prev.transform[4] - it.transform[4]) < 2 &&
        Math.abs(prev.transform[5] - it.transform[5]) < 2) { prev = it; continue; }
    const x = it.transform[4], y = it.transform[5];
    const size = Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || lastSize;
    if (lastY !== null && Math.abs(y - lastY) > Math.max(2, lastSize * 0.5)) push();
    else if (lastEndX !== null && x - lastEndX > size * 0.2 && cur && !/\s$/.test(cur) && !/^\s/.test(it.str)) cur += ' ';
    let mode = plan.fonts[it.fontName] || 'plain';
    // Stray TSCII symbols (e.g. ஸ்ரீ) sometimes sit in a separate font run: decode those too.
    if (mode === 'plain' && plan.tscii && /[^\x00-\x7F]/.test(it.str) && !/[A-Za-z]{2}/.test(it.str)) mode = plan.tscii;
    // In Mac-made TSCII PDFs the byte for டி is a non-breaking space, which pdf.js
    // emits as a separate wide " " item. Put the letter back.
    if (mode === 'tscii-mac' && /^\s$/.test(it.str) && (it.width || 0) > size * 0.45 && (it.width || 0) < size * 1.2) {
      cur = cur.replace(/ $/, '') + 'டி';
      lastY = y; lastEndX = x + (it.width || 0); prev = it; continue;
    }
    cur += decodeRun(collapseRepeats(it.str), mode, plan.visual);
    if (it.hasEOL) { push(); lastY = null; lastEndX = null; }
    else { lastY = y; lastEndX = x + (it.width || 0); }
    lastSize = size;
    prev = it;
  }
  push();
  return lines;
}

function summarise(pages) {
  let tamil = 0, junk = 0, lines = 0;
  const words = new Set();
  for (const p of pages) for (const l of p.lines) {
    lines++;
    const r = tamilRatio(l); tamil += r.tamil; junk += r.junk;
    for (const w of tamilWords(l)) words.add(w);
  }
  const quality = tamil + junk === 0 ? 0 : tamil / (tamil + junk);
  return { lines, uniqueWords: words.size, quality: Math.round(quality * 1000) / 10 };
}

// Guess a title: the first mostly-Tamil line on page 1 (or 2).
function guessTitle(pages, fallback) {
  for (const p of pages.slice(0, 3)) {
    for (const l of p.lines.slice(0, 12)) {
      const r = tamilRatio(l);
      if (r.tamil >= 4 && r.tamil > l.replace(/\s/g, '').length * 0.6 && l.length < 80) return l.replace(/^[\d.\s*-]+/, '').replace(/[\s(]*[\d()]*\)+\s*$/, '').replace(/\(+(\d+)\)+/g, '($1)').trim();
    }
  }
  return fallback;
}

export async function extractPdf(pdfjsLib, data, fileName, onProgress) {
  const doc = await pdfjsLib.getDocument({ data, verbosity: 0, isEvalSupported: false }).promise;
  const rawPages = await readPages(doc, onProgress);
  const samples = new Map();
  rawPages.slice(0, SAMPLE_PAGES).forEach((items) => {
    for (const it of items) {
      if (!samples.has(it.fontName)) samples.set(it.fontName, []);
      samples.get(it.fontName).push(it.str);
    }
  });
  // fonts first seen later in the book
  rawPages.slice(SAMPLE_PAGES).forEach((items) => {
    for (const it of items) if (!samples.has(it.fontName)) samples.set(it.fontName, [it.str]);
  });
  const plan = planFonts(samples);
  const pages = rawPages.map((items, i) => ({ n: i + 1, lines: buildLines(items, plan) }));
  await doc.destroy();
  if (onProgress) onProgress(1);
  const stats = summarise(pages);
  return { title: guessTitle(pages, baseName(fileName)), pages, stats, source: 'pdf' };
}

// Project Madurai also publishes every work as Unicode HTML — perfect text, no decoding needed.
export function extractHtmlOrText(text, fileName, isHtml) {
  let body = text;
  if (isHtml) {
    body = body
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h\d|li|tr|pre)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
  }
  const all = body.split(/\r?\n/).map((l) => clean(l).replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  // split into pseudo-pages of 40 lines so results can still show a location
  const pages = [];
  for (let i = 0; i < all.length; i += 40) pages.push({ n: pages.length + 1, lines: all.slice(i, i + 40) });
  const stats = summarise(pages);
  return { title: guessTitle(pages, baseName(fileName)), pages, stats, source: isHtml ? 'html' : 'text' };
}

function baseName(f) { return String(f).replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''); }
