// Electron main process: window, library storage on disk, PDF extraction (in a worker
// thread so the window never freezes) and the optional Google transliteration lookup.
import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libDir = () => path.join(app.getPath('userData'), 'library');
const indexFile = () => path.join(libDir(), 'index.json');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const SUPPORTED = /\.(pdf|html?|txt)$/i;

let win;

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

const readIndex = () => readJson(indexFile(), []);
const writeIndex = (idx) => writeJson(indexFile(), idx);

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    title: 'Tamil Concordance',
    backgroundColor: '#faf8f5',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Links open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function openExternal(url) {
  if (/^https:\/\/(www\.)?projectmadurai\.org\//i.test(url) || /^https:\/\/github\.com\//i.test(url)) shell.openExternal(url);
}

function runExtraction(filePath, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'extract-worker.js'), { workerData: { filePath } });
    worker.on('message', (m) => {
      if (m.type === 'progress') onProgress(m.value);
      else if (m.type === 'done') { resolve(m.result); worker.terminate(); }
      else if (m.type === 'error') { reject(new Error(m.message)); worker.terminate(); }
    });
    worker.on('error', reject);
  });
}

async function addFiles(filePaths) {
  const results = [];
  const index = await readIndex();
  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const send = (status, extra = {}) => win?.webContents.send('library:progress', { fileName, status, ...extra });
    try {
      if (!SUPPORTED.test(fileName)) throw new Error('Only PDF, HTML or TXT files can be added.');
      const buf = await fs.readFile(filePath);
      const hash = createHash('sha1').update(buf).digest('hex').slice(0, 16);
      if (index.some((w) => w.hash === hash)) { send('duplicate'); results.push({ fileName, status: 'duplicate' }); continue; }
      send('reading', { value: 0 });
      const out = await runExtraction(filePath, (value) => send('reading', { value }));
      if (!out.stats.lines) throw new Error('No text could be found in this file.');
      const id = `${Date.now().toString(36)}-${hash.slice(0, 6)}`;
      const ext = path.extname(fileName).toLowerCase();
      await fs.mkdir(libDir(), { recursive: true });
      await fs.writeFile(path.join(libDir(), id + ext), buf);
      await writeJson(path.join(libDir(), id + '.json'), { pages: out.pages });
      const meta = {
        id, hash, fileName, ext,
        title: out.title,
        pm: (fileName.match(/pm(?:uni)?(\d{4})/i) || [])[1] || null,
        addedAt: new Date().toISOString(),
        pageCount: out.pages.length,
        ...out.stats,
        source: out.source,
      };
      index.push(meta);
      await writeIndex(index);
      send('done', { meta });
      results.push({ fileName, status: 'done', meta });
    } catch (err) {
      send('error', { message: err.message });
      results.push({ fileName, status: 'error', message: err.message });
    }
  }
  return results;
}

async function googleTransliterate(word) {
  const url = 'https://inputtools.google.com/request?itc=ta-t-i0-und&num=8&cp=0&cs=1&ie=utf-8&oe=utf-8&app=tamilconcordance&text=' + encodeURIComponent(word);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const data = await res.json();
    if (data[0] !== 'SUCCESS') return null;
    return data[1][0][1];
  } catch { return null; } finally { clearTimeout(t); }
}

function registerIpc() {
  ipcMain.handle('library:list', () => readIndex());
  ipcMain.handle('library:text', async (_e, id) => (await readJson(path.join(libDir(), id + '.json'), { pages: [] })).pages);
  ipcMain.handle('library:pick', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Add books from Project Madurai',
      buttonLabel: 'Add',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Project Madurai books', extensions: ['pdf', 'html', 'htm', 'txt'] }],
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('library:add', (_e, paths) => addFiles(paths));
  ipcMain.handle('library:rename', async (_e, id, title) => {
    const idx = await readIndex();
    const w = idx.find((x) => x.id === id);
    if (w && title.trim()) { w.title = title.trim(); await writeIndex(idx); }
    return idx;
  });
  ipcMain.handle('library:remove', async (_e, id) => {
    const idx = await readIndex();
    const w = idx.find((x) => x.id === id);
    const { response } = await dialog.showMessageBox(win, {
      type: 'question', buttons: ['Remove', 'Cancel'], defaultId: 1, cancelId: 1,
      message: `Remove “${w ? w.title : 'this book'}” from your library?`,
      detail: 'It will no longer be searched. You can add the PDF again at any time.',
    });
    if (response !== 0) return idx;
    const next = idx.filter((x) => x.id !== id);
    await writeIndex(next);
    for (const f of [id + '.json', id + (w?.ext || '.pdf')]) await fs.rm(path.join(libDir(), f), { force: true });
    return next;
  });
  ipcMain.handle('library:open', async (_e, id) => {
    const w = (await readIndex()).find((x) => x.id === id);
    if (w) await shell.openPath(path.join(libDir(), id + w.ext));
  });
  ipcMain.handle('translit:google', (_e, word) => googleTransliterate(String(word).slice(0, 60)));
  ipcMain.handle('settings:get', () => readJson(settingsFile(), {}));
  ipcMain.handle('settings:set', async (_e, s) => { await writeJson(settingsFile(), s); return s; });
  ipcMain.handle('open:external', (_e, url) => openExternal(url));
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Add Books…', accelerator: 'CmdOrCtrl+O', click: () => win?.webContents.send('menu:add') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Larger Text', accelerator: 'CmdOrCtrl+=', click: () => win?.webContents.send('menu:zoom', 1) },
        { label: 'Smaller Text', accelerator: 'CmdOrCtrl+-', click: () => win?.webContents.send('menu:zoom', -1) },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Project Madurai Website', click: () => openExternal('https://www.projectmadurai.org/pmworks.html') },
        { label: 'About This App', click: () => openExternal('https://github.com/sarvesh-venkittu/tamil-concordance') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Developer smoke test: TC_SMOKE=<folder of PDFs> npm start
// Uses a throwaway library, adds the PDFs, types a search and saves screenshots there.
if (process.env.TC_SMOKE) app.setPath('userData', path.join(process.env.TC_SMOKE, '.smoke-userdata'));

async function smokeTest(dir) {
  const shot = async (name) => fs.writeFile(path.join(dir, name), (await win.webContents.capturePage()).toPNG());
  const js = (code) => win.webContents.executeJavaScript(code);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(1500);
  await shot('1-welcome.png');
  const pdfs = (await fs.readdir(dir)).filter((f) => /\.(pdf|html?)$/i.test(f)).map((f) => path.join(dir, f));
  await js(`document.querySelector('#welcome').hidden = true; document.querySelector('.tab[data-view=library]').click()`);
  const res = await addFiles(pdfs);
  console.log('[smoke] added', res.map((r) => `${r.fileName}:${r.status}${r.message ? ' ' + r.message : ''}`).join(', '));
  win.webContents.reload();
  await wait(2500);
  await js(`document.querySelector('#welcome').hidden = true; document.querySelector('.tab[data-view=library]').click()`);
  await wait(400);
  await shot('2-library.png');
  await js(`document.querySelector('.tab[data-view=search]').click(); document.querySelector('#q').focus()`);
  for (const ch of (process.env.TC_SMOKE_WORD || 'aRam')) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: ch });
    win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: ch });
    await wait(60);
  }
  await wait(2200);
  await shot('3-suggest.png');
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
  win.webContents.sendInputEvent({ type: 'char', keyCode: ' ' });
  await wait(800);
  console.log('[smoke] query =', await js(`document.querySelector('#q').value`), '|', await js(`document.querySelector('#summary').textContent`));
  await shot('4-results.png');
  await js(`document.querySelector('.hit')?.click()`);
  await wait(300);
  await shot('5-context.png');
  app.quit();
}

app.whenReady().then(() => {
  registerIpc();
  buildMenu();
  createWindow();
  if (process.env.TC_SMOKE) win.webContents.once('did-finish-load', () => smokeTest(process.env.TC_SMOKE).catch((e) => { console.error(e); app.quit(); }));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
