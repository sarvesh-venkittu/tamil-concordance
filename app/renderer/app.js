import { Corpus } from './search.js';
import { suggest as localSuggest } from './translit.js';

const api = window.api;
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const corpus = new Corpus();
let library = [];
let settings = { scale: 1, google: true, translit: true, mode: 'infl' };
const selected = new Set(); // book ids included in search
let activeForm = null;
let lastResult = null;
let shownLimit = 300;

/* ---------------- startup ---------------- */

async function init() {
  settings = { ...settings, ...(await api.getSettings()) };
  applyScale();
  $('#googleToggle').checked = settings.google;
  setTranslit(settings.translit);
  if (!['exact', 'infl', 'all'].includes(settings.mode)) settings.mode = 'infl';
  setMode(settings.mode);

  library = await api.listLibrary();
  for (const meta of library) {
    corpus.add(meta, await api.loadText(meta.id));
    selected.add(meta.id);
  }
  renderLibrary();
  renderFilter();
  $('#welcome').hidden = library.length > 0;
  $('#q').focus();
}

function saveSettings() { api.setSettings(settings); }
function applyScale() { document.documentElement.style.setProperty('--scale', settings.scale); }
function zoom(d) {
  settings.scale = Math.min(1.8, Math.max(0.8, Math.round((settings.scale + d * 0.1) * 10) / 10));
  applyScale(); saveSettings();
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------------- tabs ---------------- */

function showView(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'search') $('#q').focus();
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
$('#smaller').addEventListener('click', () => zoom(-1));
$('#larger').addEventListener('click', () => zoom(1));

/* ---------------- transliterating input ---------------- */

const q = $('#q');
const box = $('#suggest');
let comp = null; // { start, roman, options: [], sel }
let googleReq = 0;

function setTranslit(on) {
  settings.translit = on;
  const b = $('#langToggle');
  b.classList.toggle('on', on);
  b.textContent = on ? 'அ' : 'A';
  b.title = on ? 'Typing in English letters becomes Tamil — click (or Ctrl+G) to type plain English' : 'Typing plain letters — click (or Ctrl+G) to turn Tamil typing back on';
  $('#hint').style.visibility = on ? 'visible' : 'hidden';
  q.placeholder = on ? 'Type a word in English letters — e.g. aRam, kaathal, thiru' : 'Type or paste a Tamil word';
  if (!on) commit(false);
}
$('#langToggle').addEventListener('click', () => { setTranslit(!settings.translit); saveSettings(); q.focus(); });

function replaceComp(text) {
  const v = q.value;
  const end = comp.start + comp.shown.length;
  q.value = v.slice(0, comp.start) + text + v.slice(end);
  comp.shown = text;
  const caret = comp.start + text.length;
  q.setSelectionRange(caret, caret);
}

function lookup(w) { return corpus.lookup(w); }

function refreshOptions() {
  const roman = comp.roman;
  const local = localSuggest(roman, lookup, 6);
  comp.local = local;
  comp.options = mergeOptions(comp.google || [], local);
  comp.sel = 0;
  renderSuggest();
  if (settings.google && navigator.onLine) {
    const id = ++googleReq;
    clearTimeout(refreshOptions.t);
    refreshOptions.t = setTimeout(async () => {
      const g = await api.googleTransliterate(roman);
      if (!comp || id !== googleReq || comp.roman !== roman || !g) return;
      comp.google = g;
      const keep = comp.options[comp.sel];
      comp.options = mergeOptions(g, comp.local);
      comp.sel = comp.sel === 0 ? 0 : Math.max(0, comp.options.indexOf(keep));
      renderSuggest();
    }, 120);
  }
}

// Google's order first (it is usually right), then our own spellings; words found in
// the user's books are kept even if Google did not think of them.
// Google ignores capital letters (aRam = aram) and pads its list with loose guesses, so:
// drop its guesses that don't look like the typed word, and when the user typed capitals
// (an exact spelling like aRam or kuRaL) put our exact spelling first.
function mergeOptions(google, local) {
  const out = [];
  const add = (w) => { if (w && !out.includes(w)) out.push(w); };
  const roman = comp ? comp.roman : '';
  const firsts = new Set(local.map((w) => w[0]));
  const len = local[0] ? local[0].length : 0;
  const g = google.slice(0, 5).filter((w) => firsts.has(w[0]) && Math.abs(w.length - len) <= 3);
  if (/[A-Z]/.test(roman.slice(1)) && local[0]) add(local[0]);
  g.forEach(add);
  local.filter((w) => lookup(w).prefix > 0).forEach(add);
  local.forEach(add);
  return out.slice(0, 7);
}

function renderSuggest() {
  box.innerHTML = '';
  if (!comp || !comp.roman) { box.hidden = true; return; }
  box.appendChild(el('li', 'roman', comp.roman));
  comp.options.forEach((w, i) => {
    const li = el('li', 'opt' + (i === comp.sel ? ' sel' : ''));
    li.setAttribute('role', 'option');
    li.appendChild(el('span', 'n', String(i + 1)));
    li.appendChild(el('span', 'w', w));
    const n = lookup(w).prefix;
    if (n) li.appendChild(el('span', 'cnt', `${n.toLocaleString()} in your books`));
    li.addEventListener('mousedown', (e) => { e.preventDefault(); comp.sel = i; commit(true); runSearch(); });
    box.appendChild(li);
  });
  box.hidden = false;
  // keep the list under the word being typed
  const meas = measureText(q.value.slice(0, comp.start));
  box.style.left = Math.min(meas + 40, q.clientWidth - 280) + 'px';
}

const measCanvas = document.createElement('canvas').getContext('2d');
function measureText(t) {
  const cs = getComputedStyle(q);
  measCanvas.font = `${cs.fontSize} ${cs.fontFamily}`;
  return measCanvas.measureText(t).width - q.scrollLeft;
}

function commit(useChoice) {
  if (!comp) return;
  if (useChoice && comp.options.length) replaceComp(comp.options[comp.sel]);
  comp = null;
  box.hidden = true;
}

q.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); setTranslit(!settings.translit); saveSettings(); return; }
  if (!settings.translit || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  const k = e.key;
  if (/^[a-zA-Z]$/.test(k)) {
    e.preventDefault();
    if (!comp) {
      const s = q.selectionStart, en = q.selectionEnd;
      if (en > s) q.value = q.value.slice(0, s) + q.value.slice(en);
      comp = { start: s, roman: '', shown: '', options: [], sel: 0, google: null };
    }
    comp.roman += k;
    comp.google = null;
    replaceComp(comp.roman);
    refreshOptions();
    return;
  }
  if (!comp) { if (k === 'Enter') { e.preventDefault(); runSearch(); } return; }
  if (k === 'Backspace') {
    e.preventDefault();
    comp.roman = comp.roman.slice(0, -1);
    comp.google = null;
    replaceComp(comp.roman);
    if (!comp.roman) { comp = null; box.hidden = true; } else refreshOptions();
  } else if (k === 'ArrowDown' || k === 'ArrowUp') {
    e.preventDefault();
    const n = comp.options.length;
    comp.sel = (comp.sel + (k === 'ArrowDown' ? 1 : n - 1)) % n;
    renderSuggest();
  } else if (/^[1-9]$/.test(k) && +k <= comp.options.length) {
    e.preventDefault();
    comp.sel = +k - 1; commit(true); runSearch();
  } else if (k === 'Escape') {
    e.preventDefault(); commit(false); runSearch();
  } else if (k === 'Enter' || k === 'Tab') {
    e.preventDefault(); commit(true); runSearch();
  } else if (k === ' ') {
    e.preventDefault(); commit(true);
    const p = q.selectionStart;
    q.value = q.value.slice(0, p) + ' ' + q.value.slice(p);
    q.setSelectionRange(p + 1, p + 1);
    runSearch();
  } else if (k.length === 1 || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End') {
    commit(true); // punctuation or moving away keeps the chosen word
  }
});
q.addEventListener('blur', () => { if (comp) { commit(true); runSearch(); } });
q.addEventListener('mousedown', () => { if (comp) commit(true); });
q.addEventListener('input', () => { if (!comp) scheduleSearch(); });

/* ---------------- search ---------------- */

function setMode(m) {
  settings.mode = m;
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
}
document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => {
  setMode(b.dataset.mode); saveSettings(); activeForm = null; renderFilter(); renderResults(); q.focus();
}));

let searchTimer;
function scheduleSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 220); }

const LEVEL = { exact: 3, infl: 2, all: 1 };
const LEVEL_TAG = { 3: ['l3', 'exact word'], 2: ['l2', 'inflected form'], 1: ['l1', 'inside compound'] };

function runSearch() {
  clearTimeout(searchTimer);
  activeForm = null;
  shownLimit = 300;
  const r = corpus.search(q.value);
  lastResult = r.error ? null : r;
  lastError = r.error || null;
  renderModeCounts();
  renderFilter();
  renderResults();
}
let lastError = null;

function renderModeCounts() {
  const t = lastResult ? lastResult.totals : null;
  const counts = t ? { exact: t[3], infl: t[3] + t[2], all: t[3] + t[2] + t[1] } : {};
  document.querySelectorAll('#modes button').forEach((b) => {
    b.querySelector('.n').textContent = t ? counts[b.dataset.mode].toLocaleString() : '';
  });
}

// Hits visible under the current match level, book selection and word-form filter.
function visibleHits() {
  if (!lastResult) return [];
  const th = LEVEL[settings.mode];
  return lastResult.hits.filter((h) => h.level >= th && selected.has(h.workId) &&
    (!activeForm || h.forms.some(([f, l]) => f === activeForm && l >= th)));
}

function renderFilter() {
  const list = $('#filterList');
  list.innerHTML = '';
  const counts = new Map();
  if (lastResult) {
    const th = LEVEL[settings.mode];
    for (const h of lastResult.hits) {
      if (h.level < th || (activeForm && !h.forms.some(([f]) => f === activeForm))) continue;
      counts.set(h.workId, (counts.get(h.workId) || 0) + 1);
    }
  }
  if (!library.length) { list.appendChild(el('li', 'muted', 'No books yet.')); return; }

  const allLi = el('li', 'all');
  const allLab = el('label');
  const allCb = el('input'); allCb.type = 'checkbox';
  allCb.checked = selected.size === library.length;
  allCb.indeterminate = selected.size > 0 && selected.size < library.length;
  allCb.addEventListener('change', () => {
    selected.clear();
    if (allCb.checked) library.forEach((w) => selected.add(w.id));
    renderFilter(); renderResults();
  });
  allLab.append(allCb, el('span', 't', 'All books'));
  allLi.appendChild(allLab);
  list.appendChild(allLi);

  for (const w of library) {
    const li = el('li');
    const lab = el('label');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = selected.has(w.id);
    cb.addEventListener('change', () => { cb.checked ? selected.add(w.id) : selected.delete(w.id); renderFilter(); renderResults(); });
    const n = counts.get(w.id) || 0;
    lab.append(cb, el('span', 't', w.title), el('span', 'c' + (n ? ' has' : ''), lastResult ? String(n) : ''));
    li.appendChild(lab);
    list.appendChild(li);
  }
}

function highlight(text, ranges) {
  const merged = [];
  for (const r of ranges.slice().sort((x, y) => x[0] - y[0])) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([r[0], r[1]]);
  }
  const frag = document.createDocumentFragment();
  let p = 0;
  for (const [s0, e0] of merged) {
    frag.append(text.slice(p, s0));
    frag.appendChild(el('mark', null, text.slice(s0, e0)));
    p = e0;
  }
  frag.append(text.slice(p));
  return frag;
}

function renderResults() {
  const list = $('#hitList');
  list.innerHTML = '';
  const summary = $('#summary'), forms = $('#forms'), bars = $('#bars');
  $('#searchPlaceholder').hidden = !!lastResult;
  if (!lastResult) {
    summary.hidden = true; forms.hidden = true; bars.hidden = true;
    const ph = $('#searchPlaceholder p');
    ph.textContent = !library.length ? 'Add some books in “My Books” to begin.'
      : lastError === 'notamil' ? 'Pick a Tamil word from the list, or turn on English-to-Tamil typing with the அ button.'
      : lastError === 'short' ? 'Type at least two Tamil letters.'
      : 'Start typing to search every book in your library.';
    return;
  }
  const th = LEVEL[settings.mode];
  const hits = visibleHits();
  const perBook = library.map((w) => ({ w, n: hits.filter((h) => h.workId === w.id).length })).filter((x) => selected.has(x.w.id));
  const books = perBook.filter((x) => x.n).length;
  summary.hidden = false;
  summary.innerHTML = '';
  if (!hits.length) {
    summary.append('No lines found for ', el('b', null, lastResult.query), settings.mode !== 'all' ? '. Try “+ Inside compounds”, or a shorter part of the word.' : '. Try a shorter part of the word.');
  } else {
    summary.append(el('b', null, hits.length.toLocaleString()), ` line${hits.length === 1 ? '' : 's'} for `, el('b', null, lastResult.query), ` in ${books} of ${perBook.length} book${perBook.length === 1 ? '' : 's'}`);
    if (activeForm) summary.append(' — showing only ', el('b', null, activeForm));
  }

  // per-book bars
  bars.innerHTML = '';
  bars.hidden = !hits.length || perBook.length < 2;
  const max = Math.max(1, ...perBook.map((x) => x.n));
  for (const { w, n } of perBook) {
    const row = el('div', 'bar');
    const nm = el('div', 'nm', w.title); nm.title = w.title;
    const track = el('div', 'track'); const fill = el('div', 'fill'); fill.style.width = (n / max * 100) + '%'; track.appendChild(fill);
    const per = w.lines ? Math.round(n / w.lines * 10000) / 10 : 0;
    const ct = el('div', 'ct', n.toLocaleString()); ct.appendChild(el('small', null, `${per} per 1,000 lines`));
    row.append(nm, track, ct);
    bars.appendChild(row);
  }

  // word forms
  forms.innerHTML = '';
  const formCounts = new Map();
  for (const h of lastResult.hits) {
    if (!selected.has(h.workId) || h.level < th) continue;
    for (const [f, l] of h.forms) if (l >= th) formCounts.set(f, (formCounts.get(f) || 0) + 1);
  }
  const sorted = [...formCounts].sort((a, b) => b[1] - a[1]);
  forms.hidden = sorted.length < 2 && !activeForm;
  const limit = forms.dataset.expanded ? sorted.length : 24;
  for (const [f, c] of sorted.slice(0, limit)) {
    const chip = el('button', 'chip' + (f === activeForm ? ' active' : ''));
    chip.append(f, el('small', null, String(c)));
    chip.title = f === activeForm ? 'Show all word forms again' : 'Show only this word form';
    chip.addEventListener('click', () => { activeForm = activeForm === f ? null : f; shownLimit = 300; renderFilter(); renderResults(); });
    forms.appendChild(chip);
  }
  if (sorted.length > limit) {
    const more = el('button', 'chip more', `+ ${sorted.length - limit} more forms`);
    more.addEventListener('click', () => { forms.dataset.expanded = '1'; renderResults(); });
    forms.appendChild(more);
  }

  // grouped hits: best matches first within each book, then in reading order
  let shown = 0;
  for (const w of library) {
    if (shown >= shownLimit) break;
    const wh = hits.filter((h) => h.workId === w.id).sort((a, b) => b.level - a.level || a.index - b.index);
    if (!wh.length) continue;
    const g = el('div', 'group');
    const head = el('button', 'group-head');
    head.append(el('span', 'chev', '▾'), el('span', 'title', w.title), el('span', 'count', `${wh.length.toLocaleString()} line${wh.length === 1 ? '' : 's'}`));
    head.addEventListener('click', () => g.classList.toggle('collapsed'));
    const ul = el('ul', 'hits');
    for (const h of wh) {
      if (shown >= shownLimit) break;
      shown++;
      const li = el('li', 'hit');
      const ref = el('span', 'pg');
      ref.appendChild(el('b', null, `p. ${h.page}`));
      if (h.no) ref.appendChild(el('span', null, `no. ${h.no}`));
      const body = el('div', 'tx-wrap');
      const tx = el('div', 'tx'); tx.appendChild(highlight(h.text, h.ranges));
      const tags = el('div', 'tags');
      const [cls, label] = LEVEL_TAG[h.level];
      tags.appendChild(el('span', 'tag ' + cls, label));
      body.append(tx, tags);
      li.append(ref, body);
      li.title = 'Click to see the surrounding lines';
      li.addEventListener('click', () => toggleContext(li, h));
      ul.appendChild(li);
    }
    g.append(head, ul);
    list.appendChild(g);
  }
  if (hits.length > shownLimit) {
    const more = el('button', 'btn more-btn', `Show more (${(hits.length - shownLimit).toLocaleString()} left)`);
    more.addEventListener('click', () => { shownLimit += 500; renderResults(); });
    list.appendChild(more);
  }
}

function toggleContext(li, h) {
  const next = li.nextElementSibling;
  if (next && next.classList.contains('ctx')) { next.remove(); return; }
  const box = el('li', 'ctx');
  for (const line of corpus.context(h.workId, h.index, 3)) {
    const d = el('div', line.current ? 'cur' : '');
    if (line.current) d.appendChild(highlight(line.text, h.ranges)); else d.textContent = line.text;
    box.appendChild(d);
  }
  const w = library.find((x) => x.id === h.workId);
  const foot = el('div', 'pgline', `${w ? w.title : ''} · page ${h.page}${h.no ? ` · no. ${h.no}` : ''}  `);
  const open = el('button', 'btn link inline', 'Open the PDF');
  open.addEventListener('click', (e) => { e.stopPropagation(); api.openOriginal(h.workId); });
  foot.appendChild(open);
  box.appendChild(foot);
  li.after(box);
}

/* ---------------- library ---------------- */

function renderLibrary() {
  $('#bookCount').textContent = library.length;
  const ul = $('#bookList');
  ul.innerHTML = '';
  if (!library.length) { ul.appendChild(el('li', 'empty-lib', 'Your library is empty. Add a few Project Madurai PDFs to get started.')); return; }
  for (const w of library) {
    const li = el('li', 'book');
    li.appendChild(el('div', 'spine'));
    const info = el('div', 'info');
    const title = el('div', 'title', w.title);
    const meta = [
      w.pm ? `Project Madurai #${w.pm}` : w.fileName,
      w.source === 'pdf' ? `${w.pageCount} pages` : null,
      `${(w.lines || 0).toLocaleString()} lines`,
      `${(w.uniqueWords || 0).toLocaleString()} different words`,
      `added ${new Date(w.addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    ].filter(Boolean).join('  ·  ');
    info.append(title, el('div', 'meta', meta));
    if (w.quality < 97) info.appendChild(el('div', 'warn', `⚠ Some of this PDF’s text could not be read (${w.quality}% clean). The Unicode/HTML version from Project Madurai will search better.`));
    const acts = el('div', 'acts');
    const rename = el('button', 'btn small', 'Rename');
    rename.addEventListener('click', () => startRename(title, w));
    const open = el('button', 'btn small', 'Open');
    open.title = 'Open the original file';
    open.addEventListener('click', () => api.openOriginal(w.id));
    const rm = el('button', 'btn small danger', 'Remove');
    rm.addEventListener('click', async () => {
      const next = await api.remove(w.id);
      if (next.length !== library.length) {
        library = next; corpus.remove(w.id); selected.delete(w.id);
        renderLibrary(); runSearch(); toast(`Removed “${w.title}”`);
      }
    });
    acts.append(rename, open, rm);
    li.append(info, acts);
    ul.appendChild(li);
  }
}

function startRename(titleEl, w) {
  titleEl.contentEditable = 'true';
  titleEl.focus();
  document.getSelection().selectAllChildren(titleEl);
  const finish = async (save) => {
    titleEl.contentEditable = 'false';
    titleEl.removeEventListener('keydown', onKey);
    const t = titleEl.textContent.trim();
    if (save && t && t !== w.title) {
      library = await api.rename(w.id, t);
      corpus.updateMeta(library.find((x) => x.id === w.id));
      renderLibrary(); renderFilter(); renderResults();
    } else titleEl.textContent = w.title;
  };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); titleEl.textContent = w.title; titleEl.blur(); }
  };
  titleEl.addEventListener('keydown', onKey);
  titleEl.addEventListener('blur', () => finish(true), { once: true });
}

const progressRows = new Map();
api.onProgress((d) => {
  let row = progressRows.get(d.fileName);
  if (!row) {
    row = el('li');
    row.innerHTML = '<span class="name"></span><span class="bar"><i></i></span><span class="st"></span>';
    row.querySelector('.name').textContent = d.fileName;
    $('#progress').appendChild(row);
    progressRows.set(d.fileName, row);
  }
  const st = row.querySelector('.st'), bar = row.querySelector('.bar i');
  st.className = 'st';
  if (d.status === 'reading') { st.textContent = 'Reading…'; bar.style.width = Math.round((d.value || 0) * 100) + '%'; }
  if (d.status === 'done') { st.textContent = '✓ Added'; st.classList.add('ok'); bar.style.width = '100%'; }
  if (d.status === 'duplicate') { st.textContent = 'Already in library'; bar.style.width = '100%'; }
  if (d.status === 'error') { st.textContent = d.message || 'Could not read'; st.classList.add('err'); st.title = d.message || ''; }
  if (d.status !== 'reading') setTimeout(() => { row.remove(); progressRows.delete(d.fileName); }, d.status === 'error' ? 9000 : 3500);
});

async function addPaths(paths) {
  if (!paths.length) return;
  $('#welcome').hidden = true;
  showView('library');
  const results = await api.addFiles(paths);
  let added = 0;
  for (const r of results) {
    if (r.status !== 'done') continue;
    added++;
    library.push(r.meta);
    corpus.add(r.meta, await api.loadText(r.meta.id));
    selected.add(r.meta.id);
  }
  renderLibrary(); renderFilter();
  if (lastResult) runSearch();
  if (added) toast(`Added ${added} book${added === 1 ? '' : 's'} — ready to search`);
}
const pick = async () => addPaths(await api.pickFiles());
['#addBtn', '#addBtn2', '#addBtn3'].forEach((s) => $(s).addEventListener('click', pick));
const pm = () => api.openExternal('https://www.projectmadurai.org/pmworks.html');
$('#pmLink').addEventListener('click', pm);
$('#pmLink2').addEventListener('click', pm);
$('#googleToggle').addEventListener('change', (e) => { settings.google = e.target.checked; saveSettings(); });

// drag & drop anywhere in the window
const drop = $('#drop');
window.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('over'); });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  addPaths(paths);
});

api.onMenu((what, d) => { if (what === 'add') pick(); if (what === 'zoom') zoom(d); });

init();
