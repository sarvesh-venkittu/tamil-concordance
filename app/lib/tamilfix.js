// Turns the text that pdf.js pulls out of Project Madurai PDFs into clean, searchable Tamil Unicode.
//
// Project Madurai PDFs come in several flavours:
//   1. Old TSCII-font PDFs (font bytes shown as Latin-1 / Windows-1252 characters, e.g. "¾¢ÕÅ¡ö")
//   2. Old TSCII-font PDFs made on a Mac (same bytes shown as Mac Roman characters, e.g. "¿æ¢∏ı")
//   3. "Unicode" PDFs whose text layer is in visual order with ligature glyphs mapped to
//      junk code points (Greek Extended for Arial Unicode MS, CJK for Latha-based files).
//   4. Properly encoded Unicode PDFs (left alone).

const TSCII = {
  0x80: '௦', 0x81: '௧', 0x82: 'ஸ்ரீ', 0x83: 'ஜ', 0x84: 'ஷ', 0x85: 'ஸ', 0x86: 'ஹ', 0x87: 'க்ஷ',
  0x88: 'ஜ்', 0x89: 'ஷ்', 0x8A: 'ஸ்', 0x8B: 'ஹ்', 0x8C: 'க்ஷ்', 0x8D: '௨', 0x8E: '௩', 0x8F: '௪',
  0x90: '௫', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '௬', 0x96: '௭', 0x97: '௮',
  0x98: '௯', 0x99: 'ஙு', 0x9A: 'ஞு', 0x9B: 'ஙூ', 0x9C: 'ஞூ', 0x9D: '௰', 0x9E: '௱', 0x9F: '௲',
  0xA0: ' ', 0xA1: 'ா', 0xA2: 'ி', 0xA3: 'ீ', 0xA4: 'ு', 0xA5: 'ூ', 0xA6: 'ெ', 0xA7: 'ே',
  0xA8: 'ை', 0xA9: '©', 0xAA: 'ௗ', 0xAB: 'அ', 0xAC: 'ஆ', 0xAD: 'இ', 0xAE: 'ஈ', 0xAF: 'உ',
  0xB0: 'ஊ', 0xB1: 'எ', 0xB2: 'ஏ', 0xB3: 'ஐ', 0xB4: 'ஒ', 0xB5: 'ஓ', 0xB6: 'ஔ', 0xB7: 'ஃ',
  0xB8: 'க', 0xB9: 'ங', 0xBA: 'ச', 0xBB: 'ஞ', 0xBC: 'ட', 0xBD: 'ண', 0xBE: 'த', 0xBF: 'ந',
  0xC0: 'ப', 0xC1: 'ம', 0xC2: 'ய', 0xC3: 'ர', 0xC4: 'ல', 0xC5: 'வ', 0xC6: 'ழ', 0xC7: 'ள',
  0xC8: 'ற', 0xC9: 'ன', 0xCA: 'டி', 0xCB: 'டீ', 0xCC: 'கு', 0xCD: 'சு', 0xCE: 'டு', 0xCF: 'ணு',
  0xD0: 'து', 0xD1: 'நு', 0xD2: 'பு', 0xD3: 'மு', 0xD4: 'யு', 0xD5: 'ரு', 0xD6: 'லு', 0xD7: 'வு',
  0xD8: 'ழு', 0xD9: 'ளு', 0xDA: 'று', 0xDB: 'னு', 0xDC: 'கூ', 0xDD: 'சூ', 0xDE: 'டூ', 0xDF: 'ணூ',
  0xE0: 'தூ', 0xE1: 'நூ', 0xE2: 'பூ', 0xE3: 'மூ', 0xE4: 'யூ', 0xE5: 'ரூ', 0xE6: 'லூ', 0xE7: 'வூ',
  0xE8: 'ழூ', 0xE9: 'ளூ', 0xEA: 'றூ', 0xEB: 'னூ', 0xEC: 'க்', 0xED: 'ங்', 0xEE: 'ச்', 0xEF: 'ஞ்',
  0xF0: 'ட்', 0xF1: 'ண்', 0xF2: 'த்', 0xF3: 'ந்', 0xF4: 'ப்', 0xF5: 'ம்', 0xF6: 'ய்', 0xF7: 'ர்',
  0xF8: 'ல்', 0xF9: 'வ்', 0xFA: 'ழ்', 0xFB: 'ள்', 0xFC: 'ற்', 0xFD: 'ன்', 0xFE: 'இ', 0xFF: ' ',
};

// Ligature glyphs that some PDF writers export as unrelated code points.
const GLYPHS = {};
(function buildGlyphMaps() {
  // Arial Unicode MS → Greek Extended block (U+1F8A…)
  const greek = ['டி', 'டீ', 'டு', 'டூ', 'ணு', 'ணூ', 'து', 'தூ', 'நு', 'நூ', 'னு', 'னூ', 'பீ', 'பு', 'பூ', 'மு',
    'மூ', 'யீ', 'யு', 'யூ', 'ரு', 'ரூ', 'று', 'றூ', 'லி', 'லீ', 'லு', 'லூ', 'ளு', 'ளூ', 'ழு', 'ழூ', 'வீ', 'வு', 'வூ'];
  greek.forEach((s, i) => { GLYPHS[String.fromCodePoint(0x1F8A + i)] = s; });
  // Latha-based PDFs → glyph ids 8064…8134 read as hex code points (CJK block)
  const cjk = {
    8064: 'க்ஷ', 8065: 'கு', 8066: 'கூ', 8067: 'ஙு', 8068: 'ஙூ', 8070: 'சு', 8071: 'சூ', 8072: 'ஞு', 8073: 'ஞூ',
    8074: 'டி', 8075: 'டீ', 8076: 'டு', 8077: 'டூ', 8078: 'ணு', 8079: 'ணூ', 8080: 'து', 8081: 'தூ', 8082: 'நு',
    8083: 'நூ', 8084: 'னு', 8085: 'னூ', 8086: 'பீ', 8087: 'பு', 8088: 'பூ', 8089: 'மு', 8090: 'மூ', 8091: 'யீ',
    8092: 'யு', 8093: 'யூ', 8094: 'ரு', 8095: 'ரூ', 8096: 'று', 8097: 'றூ', 8098: 'லி', 8099: 'லீ', 8100: 'லு',
    8101: 'லூ', 8102: 'ளு', 8103: 'ளூ', 8104: 'ழு', 8105: 'ழூ', 8106: 'வீ', 8107: 'வு', 8108: 'வூ', 8111: 'ஸ்ரீ',
    8112: 'க்', 8113: 'ங்', 8114: 'ச்', 8115: 'ஜ்', 8116: 'ஞ்', 8117: 'ட்', 8118: 'ண்', 8119: 'த்', 8120: 'ந்',
    8121: 'ன்', 8122: 'ப்', 8123: 'ம்', 8124: 'ய்', 8125: 'ர்', 8126: 'ற்', 8127: 'ல்', 8128: 'ள்', 8129: 'ழ்',
    8130: 'வ்', 8131: 'ஷ்', 8132: 'ஸ்', 8133: 'ஹ்', 8134: 'க்ஷ்',
  };
  for (const [id, s] of Object.entries(cjk)) GLYPHS[String.fromCodePoint(parseInt(id, 16))] = s;
})();

function reverseTable(encoding) {
  const rev = new Map();
  try {
    const dec = new TextDecoder(encoding);
    for (let b = 0x80; b < 0x100; b++) {
      const ch = dec.decode(new Uint8Array([b]));
      if (ch && ch !== '�' && !rev.has(ch)) rev.set(ch, b);
    }
  } catch (e) { /* encoding not supported */ }
  return rev;
}
const REV_WIN = reverseTable('windows-1252');
const REV_MAC = reverseTable('macintosh');
// pdf.js normalises a few compatibility characters; map them back to their bytes.
for (const rev of [REV_WIN, REV_MAC]) {
  if (!rev.has('μ')) rev.set('μ', 0xB5); // micro sign → Greek mu
}
REV_WIN.set('μ', 0xB5);
REV_MAC.set('μ', 0xB5);
REV_MAC.set('¤', 0xDB); // older Mac Roman
REV_MAC.set('ﬁ', 0xDE);
REV_MAC.set('ﬂ', 0xDF);
REV_MAC.set('Ω', 0xBD);
REV_MAC.set('∏', 0xB8);
REV_MAC.set('π', 0xB9);
REV_MAC.set('∑', 0xB7);
REV_MAC.set('∂', 0xB6);
REV_MAC.set('Δ', 0xC6);
REV_MAC.set('◊', 0xD7);

const isCons = (c) => c >= 'க' && c <= 'ஹ';
const isTamil = (c) => c >= '஀' && c <= '௿';
const PRE = 'ெேை';

function toBytes(str, rev) {
  const out = [];
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) out.push(ch);
    else if (rev.has(ch)) out.push(rev.get(ch));
    else out.push(ch);
  }
  return out;
}

function decodeTSCII(str, rev) {
  let s = '';
  for (const b of toBytes(str, rev)) s += typeof b === 'number' ? TSCII[b] : b;
  return s;
}

// Score how plausible a string is as TSCII when read through the given table.
function tsciiScore(str, rev) {
  const bytes = toBytes(str, rev);
  let good = 0, bad = 0, tamil = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (typeof b !== 'number') { if (b.charCodeAt(0) >= 0x80) bad++; continue; }
    tamil++;
    const next = bytes[i + 1], prev = bytes[i - 1];
    if (b >= 0xA6 && b <= 0xA8) { // prefix vowel sign must precede a consonant
      if (typeof next === 'number' && ((next >= 0xB8 && next <= 0xC9) || (next >= 0x83 && next <= 0x87))) good++; else bad++;
    } else if (b >= 0xA1 && b <= 0xA3) { // post vowel sign must follow a consonant
      if (typeof prev === 'number' && ((prev >= 0xB8 && prev <= 0xC9) || (prev >= 0x83 && prev <= 0x87))) good++; else bad++;
    }
  }
  return { good, bad, tamil };
}

function mapGlyphs(str) {
  let s = '';
  for (const ch of str) s += GLYPHS[ch] !== undefined ? GLYPHS[ch] : ch;
  return s;
}

// Move prefix vowel signs (written before the consonant in visual order) after it,
// and join the two-part vowels ொ ோ ௌ.
function reorderVisual(s) {
  // ரி / ரீ ligature glyphs are often exported as ா + ி
  s = s.replace(/ா(?=[ிீ])/g, 'ர');
  // ர் is sometimes exported as ா + ், and ூ (on து, நு…) as ு + ா: neither pair can occur in real text
  s = s.replace(/ா்/g, 'ர்').replace(/ுா/g, 'ூ');
  // a prefix vowel sign can't end a word, so a space after it is a layout artefact
  s = s.replace(/([ெேை])\s+(?=[க-ஹ])/g, '$1');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (PRE.includes(c) && isCons(s[i + 1])) {
      let j = i + 1;
      let cl = s[j++];
      if (cl === 'க' && s[j] === '்' && s[j + 1] === 'ஷ') { cl += '்ஷ'; j += 2; }
      let sign = c;
      if (c === 'ெ' && s[j] === 'ா') { sign = 'ொ'; j++; }
      else if (c === 'ே' && s[j] === 'ா') { sign = 'ோ'; j++; }
      else if (c === 'ெ' && s[j] === 'ௗ') { sign = 'ௌ'; j++; }
      out += cl + sign;
      i = j - 1;
    } else out += c;
  }
  return out;
}

function clean(s) {
  return s.replace(/[​-‍﻿­]/g, '').normalize('NFC');
}

// If a run of text is the same string printed 2–4 times (fake bold), keep one copy.
function collapseRepeats(s) {
  const t = s.trim();
  for (const k of [4, 3, 2]) {
    if (t.length >= k * 2 && t.length % k === 0) {
      const part = t.slice(0, t.length / k);
      if (part.repeat(k) === t) return part;
    }
  }
  return s;
}

/**
 * Decide, for each font in a document, how its text should be decoded.
 * samples: Map<fontName, string[]>
 */
function planFonts(samples) {
  const plan = {};
  let visualEvidence = 0, logicalEvidence = 0;
  for (const [font, strs] of samples) {
    const text = strs.join(' ');
    let tamil = 0, glyph = 0, high = 0;
    for (const ch of text) {
      if (isTamil(ch)) tamil++;
      else if (GLYPHS[ch]) glyph++;
      else if (ch.charCodeAt(0) >= 0x80) high++;
    }
    if (tamil + glyph >= high && tamil + glyph > 0) {
      plan[font] = 'unicode';
      const mapped = mapGlyphs(text);
      for (let i = 0; i < mapped.length; i++) {
        const c = mapped[i];
        if (PRE.includes(c)) {
          const p = mapped[i - 1];
          if (p === undefined || !isTamil(p)) visualEvidence++;
          else if (isCons(mapped[i + 1]) && mapped[i + 2] === 'ா') visualEvidence += 0.5;
        } else if (c === 'ொ' || c === 'ோ' || c === 'ௌ') logicalEvidence++;
        else if (PRE.includes(mapped[i + 1]) && isCons(c) && !isTamil(mapped[i - 1] || ' ')) logicalEvidence += 0.5;
      }
      continue;
    }
    if (high > 20) {
      const w = tsciiScore(text, REV_WIN), m = tsciiScore(text, REV_MAC);
      const rate = (r) => r.good / Math.max(1, r.good + r.bad);
      const best = rate(m) > rate(w) ? ['tscii-mac', m] : ['tscii-win', w];
      if (rate(best[1]) > 0.6 && best[1].tamil > high * 0.5) { plan[font] = best[0]; continue; }
    }
    plan[font] = 'plain';
  }
  const tscii = Object.values(plan).some((m) => m.startsWith('tscii'));
  const tsciiMode = Object.values(plan).find((m) => m.startsWith('tscii')) || null;
  return { fonts: plan, tscii: tsciiMode, visual: tscii || visualEvidence > logicalEvidence };
}

function decodeRun(str, mode, visual) {
  let s = str;
  // Reordering of visual-order vowel signs happens once per line in fixLine().
  if (mode === 'tscii-win') s = decodeTSCII(s, REV_WIN);
  else if (mode === 'tscii-mac') s = decodeTSCII(s.replace(/\u00A0/g, '\u00CA'), REV_MAC);
  else if (mode === 'unicode') s = mapGlyphs(s);
  return s;
}

// Fix line-level things after runs are joined (prefix sign split from its consonant by a run break).
function fixLine(s, anyVisual) {
  if (anyVisual) s = reorderVisual(s);
  // a vowel sign can never start a word: glue it back to the letter before the space
  s = s.replace(/([\u0B95-\u0BB9])\s+(?=[\u0BBE-\u0BC2\u0BC6-\u0BCD\u0BD7])/g, '$1');
  return clean(s).replace(/[ \t]+/g, ' ').trim();
}

// Words for indexing: runs of Tamil letters/signs.
const WORD_RE = /[஀-௿]+/g;
function tamilWords(s) { return s.match(WORD_RE) || []; }

function tamilRatio(s) {
  let t = 0, junk = 0;
  for (const ch of s) {
    if (isTamil(ch)) t++;
    else if (ch.charCodeAt(0) >= 0x80 && !/[‐-‧ -¿]/.test(ch)) junk++;
  }
  return { tamil: t, junk };
}

export { planFonts, decodeRun, fixLine, collapseRepeats, tamilWords, tamilRatio, reorderVisual, clean };
