// The only bridge between the page and the computer: a small, fixed set of actions.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listLibrary: () => ipcRenderer.invoke('library:list'),
  loadText: (id) => ipcRenderer.invoke('library:text', id),
  pickFiles: () => ipcRenderer.invoke('library:pick'),
  addFiles: (paths) => ipcRenderer.invoke('library:add', paths),
  pathForFile: (file) => webUtils.getPathForFile(file),
  rename: (id, title) => ipcRenderer.invoke('library:rename', id, title),
  remove: (id) => ipcRenderer.invoke('library:remove', id),
  openOriginal: (id) => ipcRenderer.invoke('library:open', id),
  googleTransliterate: (word) => ipcRenderer.invoke('translit:google', word),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onProgress: (fn) => ipcRenderer.on('library:progress', (_e, d) => fn(d)),
  onMenu: (fn) => {
    ipcRenderer.on('menu:add', () => fn('add'));
    ipcRenderer.on('menu:zoom', (_e, d) => fn('zoom', d));
  },
});
