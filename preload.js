const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onFileNew: (cb) => ipcRenderer.on('file-new', cb),
  onFileOpened: (cb) => ipcRenderer.on('file-opened', (_e, data) => cb(data)),
  onFileSave: (cb) => ipcRenderer.on('file-save', cb),
  onFileSaveAs: (cb) => ipcRenderer.on('file-save-as', cb),
  saveFile: (content, saveAs = false) => ipcRenderer.invoke('save-file', { content, saveAs }),
  showEditorMenu: (line) => ipcRenderer.invoke('ctx-editor', line),
  showPreviewMenu: (line) => ipcRenderer.invoke('ctx-preview', line),
  onJumpToPreview: (cb) => ipcRenderer.on('jump-to-preview', (_e, line) => cb(line)),
  onJumpToEditor: (cb) => ipcRenderer.on('jump-to-editor', (_e, line) => cb(line)),
});
