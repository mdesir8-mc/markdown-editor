const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onFileNew: (cb) => ipcRenderer.on('file-new', cb),
  onFileOpened: (cb) => ipcRenderer.on('file-opened', (_e, data) => cb(data)),
  onFileSave: (cb) => ipcRenderer.on('file-save', cb),
  onFileSaveAs: (cb) => ipcRenderer.on('file-save-as', cb),
  saveFile: (content, saveAs = false) => ipcRenderer.invoke('save-file', { content, saveAs }),
});
