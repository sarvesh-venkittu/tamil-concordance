// In-memory concordance over every line of every book in the library.
//
// Matching (carried over from the original web version of this concordance) has three levels:
//   3  exact word            அரசு
//   2  inflected form        அரசன், அரசர்க்கு, நிலத்தில் (word starts with the word or its stem)
//   1  inside a compound     பேரரசு (the word or stem appears inside a longer joined word)

const TAMIL_RUN = /[஀-௿]+/g;
const VSIGN = /[ா-்ௗ]/;
const isCons = (c) => c >= 'க' && c <= 'ஹ';

export function normQ(q) { return q.normalize('NFC').replace(/[‌‍\s]+/g, ''); }

// Spelling variants of the query that inflected forms start with.
export function buildVariants(q) {
  const ch = [...q];
  const last = ch[ch.length - 1];
  // guard: if the query ends in a bare consonant, the next letter must not be a vowel sign
  // (so கண் doesn't match கணம்)
  const out = [{ s: q, guard: isCons(last) }];
  if (last === '்' && ch.length >= 3 && ch[ch.length - 2] === 'ம') {
    out.push({ s: ch.slice(0, -2).join(''), guard: true }); // நிலம் → நில(த்தில்)
  }
  if (last === 'ு' && ch.length >= 2) { // அரசு → அரச(ன்), நாடு → நாட்ட(ு)
    const stem = ch.slice(0, -1).join('');
    out.push({ s: stem, guard: false });
    const c = ch[ch.length - 2];
    if ('கசடதபற'.includes(c)) out.push({ s: stem + '்' + c, guard: false });
  }
  const seen = new Set();
  return out.filter((v) => [...v.s].length >= 2 && !seen.has(v.s) && seen.add(v.s));
}

export function matchLine(s, q, vs) {
  let level = 0;
  const ranges = [];
  const forms = [];
  for (const m of s.matchAll(TAMIL_RUN)) {
    const tok = m[0], off = m.index;
    if (tok === q) { level = Math.max(level, 3); ranges.push([off, off + tok.length]); forms.push([tok, 3]); continue; }
    let hit = false;
    for (const v of vs) {
      if (tok.startsWith(v.s) && tok.length > v.s.length && !(v.guard && VSIGN.test(tok[v.s.length]))) {
        level = Math.max(level, 2); ranges.push([off, off + tok.length]); forms.push([tok, 2]); hit = true; break;
      }
    }
    if (hit) continue;
    for (const v of vs) {
      const i = tok.indexOf(v.s, 1);
      if (i > 0) {
        const nxt = tok[i + v.s.length];
        if (v.guard && nxt && VSIGN.test(nxt)) continue;
        level = Math.max(level, 1); ranges.push([off + i, off + i + v.s.length]); forms.push([tok, 1]); break;
      }
    }
  }
  return { level, ranges, forms };
}

// Verse numbers: Project Madurai prints the number at the end of each verse ("… நின்றானே. 15"
// or "… (2) 15"). Lines up to and including that line belong to that verse.
function verseNumbers(lines) {
  const nums = new Array(lines.length).fill('');
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].text.match(/[஀-௿.,;:!?)'’”\s]\s*(?:\(\d+\)\s*)?(\d{1,4})\s*$/);
    if (m && /[஀-௿]/.test(lines[i].text)) {
      for (let k = start; k <= i; k++) nums[k] = m[1];
      start = i + 1;
    }
  }
  return nums;
}

export class Corpus {
  constructor() {
    this.works = new Map(); // id → { meta, lines: [{ page, text, no }] }
    this.wordCounts = new Map();
    this.sortedWords = null;
  }

  add(meta, pages) {
    const lines = [];
    for (const p of pages) for (const text of p.lines) lines.push({ page: p.n, text, no: '' });
    verseNumbers(lines).forEach((n, i) => { lines[i].no = n; });
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
        const m = text.match(TAMIL_RUN);
        if (m) for (const w of m) counts.set(w, (counts.get(w) || 0) + 1);
      }
    }
    this.wordCounts = counts;
    this.sortedWords = [...counts.keys()].sort();
  }

  // How often a word occurs on its own, and how often it starts a longer word.
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
   * Returns { query, hits: [{ workId, index, page, no, text, level, ranges, forms }], totals: {1,2,3} }
   * or { error } when the query can't be searched.
   */
  search(raw) {
    const q = normQ(raw);
    if (!q) return { error: 'blank' };
    if (!/[஀-௿]/.test(q)) return { error: 'notamil' };
    const vs = buildVariants(q);
    if (!vs.length) return { error: 'short' };
    const hits = [];
    const totals = { 1: 0, 2: 0, 3: 0 };
    for (const [id, { lines }] of this.works) {
      for (let i = 0; i < lines.length; i++) {
        const m = matchLine(lines[i].text, q, vs);
        if (!m.level) continue;
        totals[m.level]++;
        hits.push({ workId: id, index: i, page: lines[i].page, no: lines[i].no, text: lines[i].text, ...m });
      }
    }
    return { query: q, hits, totals };
  }

  context(workId, index, radius = 3) {
    const w = this.works.get(workId);
    if (!w) return [];
    const out = [];
    for (let i = Math.max(0, index - radius); i <= Math.min(w.lines.length - 1, index + radius); i++) out.push({ ...w.lines[i], current: i === index });
    return out;
  }
}
