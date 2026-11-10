// Offline English-letters → Tamil transliteration that suggests several spellings,
// the way Google Input Tools does. Ambiguous sounds (n → ந/ன/ண, l → ல/ள/ழ, r → ர/ற,
// t → ட/த …) produce alternatives; words that occur in the user's own books float to the top.

const CONS = [
  // [roman, [tamil alternatives…]]  (longest roman first)
  ['ksh', ['க்ஷ']], ['nch', ['ஞ்ச']], ['ngk', ['ங்க']], ['ngg', ['ங்க']],
  ['nth', ['ந்த']], ['ndh', ['ந்த']], ['ndr', ['ன்ற']], ['ntr', ['ன்ற']], ['shr', ['ஶ்ர', 'ஷ்ர']],
  ['zh', ['ழ']], ['sh', ['ஷ', 'ச']], ['ch', ['ச']], ['th', ['த']], ['dh', ['த']],
  ['kh', ['க']], ['gh', ['க']], ['bh', ['ப']], ['ph', ['ப']],
  ['ng', ['ங்க', 'ங']], ['nj', ['ஞ்ச', 'ஞ']], ['ny', ['ஞ']], ['nk', ['ங்க']], ['nc', ['ஞ்ச']],
  ['nd', ['ண்ட', 'ந்த']], ['nt', ['ண்ட', 'ந்த']], ['mb', ['ம்ப']], ['mp', ['ம்ப']],
  ['kk', ['க்க']], ['cc', ['ச்ச']], ['ss', ['ச்ச', 'ஸ்ஸ']], ['tt', ['ட்ட', 'த்த']], ['TT', ['ட்ட']],
  ['pp', ['ப்ப']], ['mm', ['ம்ம']], ['yy', ['ய்ய']], ['vv', ['வ்வ']], ['ww', ['வ்வ']],
  ['nn', ['ன்ன', 'ண்ண', 'ந்ந']], ['NN', ['ண்ண']], ['ll', ['ல்ல', 'ள்ள']], ['LL', ['ள்ள']],
  ['rr', ['ற்ற', 'ர்ர']], ['RR', ['ற்ற']], ['dd', ['ட்ட']], ['jj', ['ஜ்ஜ']], ['gg', ['க்க']], ['bb', ['ப்ப']],
  ['k', ['க']], ['g', ['க']], ['c', ['ச']], ['s', ['ச', 'ஸ']], ['j', ['ஜ', 'ச']], ['t', ['ட', 'த']], ['T', ['ட']],
  ['d', ['ட', 'த']], ['D', ['ட']], ['N', ['ண']], ['n', ['ன', 'ந', 'ண']], ['p', ['ப']], ['b', ['ப']],
  ['m', ['ம']], ['y', ['ய']], ['r', ['ர', 'ற']], ['R', ['ற']], ['l', ['ல', 'ள', 'ழ']], ['L', ['ள']],
  ['z', ['ழ']], ['Z', ['ழ']], ['v', ['வ']], ['w', ['வ']], ['h', ['ஹ', 'க']], ['f', ['ஃப']], ['q', ['க']],
  ['x', ['க்ஸ']], ['S', ['ஸ', 'ஷ']], ['J', ['ஜ']], ['H', ['ஹ']],
];
// At the start of a word some sounds have a different most-likely letter.
const INITIAL = { n: ['ந', 'ன'], t: ['த', 'ட'], d: ['த', 'ட'], s: ['ச', 'ஸ'], nj: ['ஞ'], ng: ['ங'] };

// [roman, [independent vowel, vowel sign]…]
const VOWELS = [
  ['aa', [['ஆ', 'ா']]], ['AA', [['ஆ', 'ா']]], ['ai', [['ஐ', 'ை']]], ['au', [['ஔ', 'ௌ']]], ['ow', [['ஔ', 'ௌ']]],
  ['ii', [['ஈ', 'ீ']]], ['ee', [['ஈ', 'ீ'], ['ஏ', 'ே']]], ['uu', [['ஊ', 'ூ']]], ['oo', [['ஊ', 'ூ'], ['ஓ', 'ோ']]],
  ['ae', [['ஏ', 'ே']]], ['oa', [['ஓ', 'ோ']]],
  ['A', [['ஆ', 'ா']]], ['I', [['ஈ', 'ீ']]], ['U', [['ஊ', 'ூ']]], ['E', [['ஏ', 'ே']]], ['O', [['ஓ', 'ோ']]],
  ['a', [['அ', '']]], ['i', [['இ', 'ி']]], ['u', [['உ', 'ு']]], ['e', [['எ', 'ெ'], ['ஏ', 'ே']]], ['o', [['ஒ', 'ொ'], ['ஓ', 'ோ']]],
];

function tokenize(roman) {
  const tokens = [];
  let i = 0;
  while (i < roman.length) {
    let hit = null;
    for (const [r, alts] of VOWELS) if (roman.startsWith(r, i)) { hit = { kind: 'v', r, alts }; break; }
    if (!hit) {
      for (const [r, alts] of CONS) {
        if (roman.startsWith(r, i)) {
          hit = { kind: 'c', r, alts: i === 0 && INITIAL[r] ? INITIAL[r] : alts }; break;
        }
      }
    }
    if (!hit) {
      // Unknown capital letter → try lower case; anything else passes through.
      const ch = roman[i];
      const low = ch.toLowerCase();
      const c = CONS.find(([x]) => x === low);
      const v = VOWELS.find(([x]) => x === low);
      if (c) hit = { kind: 'c', r: ch, alts: c[1] };
      else if (v) hit = { kind: 'v', r: ch, alts: v[1] };
      else hit = { kind: 'x', r: ch, alts: [ch] };
    }
    tokens.push(hit);
    i += hit.r.length;
  }
  return tokens;
}

// Expand tokens into candidate spellings (beam search, cheapest first).
function expand(tokens, beam = 60) {
  let states = [{ s: '', cost: 0, cons: false }];
  for (const tok of tokens) {
    const next = [];
    for (const st of states) {
      tok.alts.forEach((alt, k) => {
        if (tok.kind === 'c') {
          next.push({ s: st.s + (st.cons ? '்' : '') + alt, cost: st.cost + k, cons: true });
        } else if (tok.kind === 'v') {
          const [indep, sign] = alt;
          next.push({ s: st.s + (st.cons ? sign : indep), cost: st.cost + k, cons: false });
        } else {
          next.push({ s: st.s + (st.cons ? '்' : '') + alt, cost: st.cost, cons: false });
        }
      });
    }
    next.sort((a, b) => a.cost - b.cost);
    states = next.slice(0, beam);
  }
  return states.map((st) => ({ text: st.s + (st.cons ? '்' : ''), cost: st.cost }));
}

/**
 * suggest('vanakkam', lookup) → ['வணக்கம்', 'வனக்கம்', …]
 * lookup(word) → { exact: n, prefix: n }  (optional; ranks spellings found in the user's books)
 */
export function suggest(roman, lookup, max = 6) {
  if (!roman) return [];
  const tokens = tokenize(roman);
  // A word-final "a" is often a long ஆ (amma → அம்மா); final "o"/"e" are often long too.
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && last.kind === 'v') {
    if (last.r === 'a') last.alts = [['அ', ''], ['ஆ', 'ா']];
    if (last.r === 'o') last.alts = [['ஓ', 'ோ'], ['ஒ', 'ொ']];
  }
  const cands = expand(tokens);
  const seen = new Set();
  const scored = [];
  for (const c of cands) {
    if (seen.has(c.text)) continue;
    seen.add(c.text);
    let score = -c.cost;
    if (lookup) {
      const f = lookup(c.text);
      if (f.exact) score += 100 + Math.log(1 + f.exact) * 5;
      else if (f.prefix) score += 50 + Math.log(1 + f.prefix) * 3;
    }
    scored.push({ text: c.text, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((x) => x.text);
}

export const _internal = { tokenize, expand };
