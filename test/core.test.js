// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { planFonts, decodeRun, fixLine, collapseRepeats } from '../app/lib/tamilfix.js';
import { extractHtmlOrText } from '../app/lib/extract.js';
import { suggest } from '../app/renderer/translit.js';
import { Corpus } from '../app/renderer/search.js';

// Helper: decode one string the way the extractor does for a whole document.
function decode(str, sample = [str]) {
  const plan = planFonts(new Map([['f', sample]]));
  return fixLine(decodeRun(str, plan.fonts.f, plan.visual), plan.visual);
}

test('TSCII text shown as Windows Latin-1 (old Project Madurai PDFs)', () => {
  const s = '«ÕÇ¢î¦ºö¾ ¾¢ÕôÀøÄ¡ñÎ ãýÈ¡õ ¾¢ÕÅó¾¡¾¢';
  assert.equal(decode(s, [s.repeat(5)]), 'அருளிச்செய்த திருப்பல்லாண்டு மூன்றாம் திருவந்தாதி');
});

test('TSCII text shown as Mac Roman (Mac-made PDFs)', () => {
  const s = '≠«Ìß∏° ¿æ¢∏ı';
  assert.equal(decode(s, [s.repeat(10)]), 'இளங்கோ பதிகம்');
});

test('visual-order Unicode with Arial Unicode MS ligature glyphs', () => {
  const s = 'மகாேதவ ᾙதᾢயார் அᾞம்ெபாᾞள் விளக்கᾙம் தமிழாசிாியர்';
  assert.equal(decode(s, [s.repeat(3)]), 'மகாதேவ முதலியார் அரும்பொருள் விளக்கமும் தமிழாசிரியர்');
});

test('visual-order Unicode with Latha glyph ids (CJK code points)', () => {
  const s = 'ஔைவயா脥 பாட脧க脨 ஆ脙தி聱聴 ெகா脡ைறேவ脠த脡';
  assert.equal(decode(s, [s.repeat(3)]), 'ஔவையார் பாடல்கள் ஆத்திசூடி கொன்றைவேந்தன்');
});

test('correct Unicode is left untouched', () => {
  const s = 'கொன்றை வேந்தன் கைக்கிளை';
  assert.equal(decode(s, [s.repeat(3)]), s);
});

test('fake-bold repeated runs collapse to one copy', () => {
  assert.equal(collapseRepeats('Source:Source:Source:Source:'), 'Source:');
  assert.equal(collapseRepeats('அறம் அறம்'), 'அறம் அறம்');
});

test('HTML (Unicode) books are read line by line', () => {
  const r = extractHtmlOrText('<html><body><h1>திருக்குறள்</h1><p>அகர முதல எழுத்தெல்லாம்<br>ஆதி பகவன் முதற்றே உலகு</p></body></html>', 'pm0001.html', true);
  assert.equal(r.title, 'திருக்குறள்');
  assert.deepEqual(r.pages[0].lines, ['திருக்குறள்', 'அகர முதல எழுத்தெல்லாம்', 'ஆதி பகவன் முதற்றே உலகு']);
});

test('transliteration offers the usual spellings', () => {
  assert.equal(suggest('thamizh')[0], 'தமிழ்');
  assert.equal(suggest('kuRaL')[0], 'குறள்');
  assert.ok(suggest('vanakkam').includes('வணக்கம்'));
  assert.ok(suggest('amma').includes('அம்மா'));
});

test('transliteration prefers words found in the library', () => {
  const lookup = (w) => ({ exact: w === 'வணக்கம்' ? 5 : 0, prefix: w === 'வணக்கம்' ? 5 : 0 });
  assert.equal(suggest('vanakkam', lookup)[0], 'வணக்கம்');
});

test('search modes: starts with, whole word, anywhere', () => {
  const c = new Corpus();
  c.add({ id: 'k', title: 'குறள்' }, [{ n: 1, lines: ['அறத்தான் வருவதே இன்பம்', 'அறம் பொருள் இன்பம்', 'மறம் அறம்'] }]);
  assert.equal(c.search('அற', 'starts').hits.length, 3);
  assert.equal(c.search('அறம்', 'word').hits.length, 2);
  assert.equal(c.search('றம்', 'anywhere').hits.length, 3);
  assert.equal(c.search('றம்', 'starts').hits.length, 0);
  assert.deepEqual([...c.search('அற', 'starts').forms.keys()].sort(), ['அறத்தான்', 'அறம்']);
  assert.deepEqual(c.lookup('அறம்'), { exact: 2, prefix: 2 });
});
