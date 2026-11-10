# How it works

## Overview

```
PDF / HTML ──► extract-worker.js (worker thread)
                 │  pdf.js getTextContent()  → text runs + font names + positions
                 │  tamilfix.planFonts()     → decide, per font, how to decode
                 │  extract.buildLines()     → rebuild lines, drop fake-bold overprints
                 ▼
         library/<id>.json  { pages: [{ n, lines: [...] }] }   + a copy of the original file
                 ▼
renderer: search.js Corpus (all lines in memory, word-frequency index)
          translit.js (offline suggestions) + Google Input Tools (optional)
```

Everything runs locally in Electron. The page has no Node access: it talks to the main process
only through the fixed API in `app/preload.cjs`.

## Why Project Madurai PDFs need decoding

Copying text out of a Tamil PDF rarely gives clean Unicode. The six sample PDFs used in
development came in four different styles:

| Style | Example raw text | Cause | Fix |
|---|---|---|---|
| TSCII via Windows Latin-1 (e.g. pm0007) | `«ÕÇ¢î¦ºö¾` | Old 8-bit TSCII font; pdf.js reports bytes as Windows-1252 characters | Map characters back to bytes, then bytes → Tamil through the TSCII 1.7 table |
| TSCII via Mac Roman (e.g. pm0046) | `≠«Ìß∏°` | Same font, but the PDF uses Mac Roman encoding | Same as above with the Mac Roman table. Byte 0xCA (டி) is a non-breaking space in Mac Roman, which pdf.js drops as a separate wide space; the extractor puts டி back |
| Unicode, Arial Unicode MS (e.g. pm0518) | `ெபாᾞள்` | Glyphs stored in **visual order** (ெ before the consonant); ligatures such as ரு, டு mapped to Greek Extended code points (U+1F8A–1FAC) | Map the ligature table, then reorder |
| Unicode, Latha glyph ids (e.g. pm0743/0845/0874) | `ஔைவயா脥 பாட脧க脨` | Ligatures exported as glyph ids `g8125` etc., which pdf.js turns into CJK code points | Map the glyph-id table (8064–8134), then reorder |

`planFonts()` looks at a sample of each font's text and picks one of `tscii-win`, `tscii-mac`,
`unicode` or `plain`. It also decides whether the document is in visual order by counting vowel
signs that start a word (impossible in correct Unicode) against precomposed ொ/ோ/ௌ (only seen in
correct Unicode). Correct Unicode PDFs are left untouched.

`reorderVisual()` then, line by line:

- turns `ா` + `ி/ீ` into `ரி/ரீ` (the ரி ligature is exported as those two signs),
- moves each prefix vowel sign ெ ே ை after its consonant (including க்ஷ),
- joins the two-part vowels: ெ…ா → ொ, ே…ா → ோ, ெ…ௗ → ௌ,
- glues a vowel sign back onto the letter before it when a stray space separates them,
- repairs pairs that can't occur in real text: ா் → ர் and ு+ா → ூ (how some fonts draw தூ, நூ).

The decoders were checked against the four hand-checked texts of the original web version. Word
agreement is 98–99% for Nalayiram and Thiruvenkata Satakam. The remaining differences are mostly
OCR errors in the old texts (e.g. ௨ for உ) or its reading of TSCII byte 0xAD as a hyphen
instead of இ.

Some PDFs also fake bold text by printing the same run 2–4 times. Identical runs at the same
position are dropped, and a run that is one string repeated is collapsed.

Each book gets a "clean" percentage (Tamil letters vs. unexplained non-ASCII characters). Below
97% the library shows a warning suggesting the HTML version.

### Adding support for a new PDF style

1. Run `node` with pdf.js on the PDF and list the non-Tamil code points, with some context
   (see `test/core.test.js` for the decoding helpers).
2. Work out which Tamil syllable each one stands for from the surrounding words.
3. Add the mapping to `GLYPHS` in `app/lib/tamilfix.js` and a test case in `test/core.test.js`.

## Transliteration

`app/renderer/translit.js` splits the English letters into sounds, longest match first
(`ndr`, `zh`, `th`, `kk`, `aa`, …). Ambiguous sounds have several Tamil options:

- `n` → ன ந ண (ந first at the start of a word)
- `l` → ல ள ழ
- `r` → ர ற
- `t`/`d` → ட த
- `s` → ச ஸ
- `e` → எ ஏ, `o` → ஒ ஓ

A beam search builds up to 60 spellings, cheapest first. Each spelling is then scored against the
user's own library: an exact word match counts most, then words that start with it.

When online, the main process also asks Google Input Tools (`inputtools.google.com`, Tamil
`ta-t-i0-und`) for suggestions. The two lists are merged:

1. If the user typed capitals (Google ignores case), the app's own exact spelling goes first.
2. Google's top suggestions follow, minus loose guesses that start with a different letter.
3. Then the app's own spellings that appear in the library.
4. Then the rest of the app's own spellings.

## Search

`Corpus` (`app/renderer/search.js`) keeps every line in memory, which is a few MB for dozens of books.
The matching rules come from the original web version of this concordance:

- `buildVariants(q)` makes stems from the query. Words ending in ம் also search for the stem without
  it (நிலம் → நில, for நிலத்தில்). Words ending in ு also search for the stem, plus the stem with a
  doubled consonant for கசடதபற (அரசு → அரச, அரச்ச; நாடு → நாட, நாட்ட).
- `matchLine()` scores each Tamil word in a line. Level **3** is the exact word. Level **2** is a
  word starting with the query or a stem. Level **1** is the query or a stem found inside a longer
  word. If the query ends in a bare consonant (கண்), the next letter must not be a vowel sign, so
  கண் finds கண்டு but not கணம்.
- Each line keeps its best level. The three buttons show cumulative counts (3; 3+2; 3+2+1).

Verse numbers are taken from the number Project Madurai prints at the end of each verse; every
line up to that point gets that number. Running headers and footers (any line repeated on more than
a third of the pages, and "Page N of M" lines) are removed during extraction.

A sorted word list with counts powers the "N in your books" numbers in the suggestion dropdown.

## Storage

```
~/Library/Application Support/Tamil Concordance/
  settings.json            text size, match mode, transliteration on/off, Google on/off
  library/index.json       one entry per book (title, PM number, counts, quality, hash)
  library/<id>.json        extracted lines per page
  library/<id>.pdf|html    copy of the original, for "Open the PDF"
```

Files are recognised by a SHA-1 of their contents, so adding the same PDF twice is detected.
