// In-memory concordance over every line of every book in the library.

const TAMIL = /[஀-௿]/;
const WORDS = /[஀-௿]+/g;

export class Corpus {
  constructor() {
    this.works = new Map(); // id → { meta, lines: [{ page, text }] }
    this.wordCounts = new Map();
    this.sortedWords = null;
  }

  add(meta, pages) {
    const lines = [];
    for (const p of pages) for (const text of p.lines) lines.push({ page: p.n, text });
    this.works.set(meta.id, { meta, lines });
    this.sortedWords = null;
  }

  remove(id) { this.works.delete(id); this.sortedWords = null; }
  has(id) { return this.works.has(id); }
  updateMeta(meta) { const w = this.works.get(meta.id); if (w) w.meta = meta; }

  ensureIndex() {
    if (this.sortedWords) return;
    const counts = new Map();
    for (const { lines } of this.works.values()) {
      for (const { text } of lines) {
        const m = text.match(WORDS);
        if (m) for (const w of m) counts.set(w, (counts.get(w) || 0) + 1);
      }
    }
    this.wordCounts = counts;
    this.sortedWords = [...counts.keys()].sort();
  }

  // How often a word occurs on its own, and how often as the start of a longer word.
  lookup(word) {
    this.ensureIndex();
    const exact = this.wordCounts.get(word) || 0;
    const arr = this.sortedWords;
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < word) lo = mid + 1; else hi = mid; }
    let prefix = 0;
    for (let i = lo; i < arr.length && arr[i].startsWith(word) && i < lo + 5000; i++) prefix += this.wordCounts.get(arr[i]);
    return { exact, prefix };
  }

  /**
   * mode: 'starts' (word begins with q), 'word' (whole word), 'anywhere'
   * Returns { hits: [{ workId, index, page, text, start, end, form }], forms: Map(form → count) }
   */
  search(q, mode, workIds) {
    q = q.normalize('NFC').trim();
    const hits = [];
    const forms = new Map();
    if (!q) return { hits, forms };
    const isWordChar = (c) => c !== undefined && TAMIL.test(c);
    for (const [id, { lines }] of this.works) {
      if (workIds && !workIds.has(id)) continue;
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i].text;
        let from = 0, pos;
        while ((pos = text.indexOf(q, from)) !== -1) {
          from = pos + q.length;
          const before = text[pos - 1], after = text[pos + q.length];
          if (mode !== 'anywhere' && isWordChar(before)) continue;
          if (mode === 'word' && isWordChar(after)) continue;
          // the whole word this hit sits in
          let s = pos, e = pos + q.length;
          while (s > 0 && isWordChar(text[s - 1])) s--;
          while (e < text.length && isWordChar(text[e])) e++;
          const form = text.slice(s, e);
          forms.set(form, (forms.get(form) || 0) + 1);
          hits.push({ workId: id, index: i, page: lines[i].page, text, start: pos, end: pos + q.length, form });
        }
      }
    }
    return { hits, forms };
  }

  context(workId, index, radius = 3) {
    const w = this.works.get(workId);
    if (!w) return [];
    const out = [];
    for (let i = Math.max(0, index - radius); i <= Math.min(w.lines.length - 1, index + radius); i++) out.push({ ...w.lines[i], current: i === index });
    return out;
  }
}
