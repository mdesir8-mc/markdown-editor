const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;
let currentFilePath = null;
let pendingOpenPath = null;
let suggestedSavePath = null; // where Save As starts for a converted .docx

const isDocx = (filePath) => /\.docx$/i.test(filePath);
const DOC_FILTERS = [{ name: 'Documents', extensions: ['md', 'markdown', 'txt', 'docx'] }];

// .docx is sent as raw bytes and converted to Markdown in the renderer
function readDocument(filePath) {
  return isDocx(filePath)
    ? { path: filePath.replace(/\.docx$/i, '.md'), data: fs.readFileSync(filePath) }
    : { path: filePath, content: fs.readFileSync(filePath, 'utf8') };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile('index.html');
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click() { mainWindow.webContents.send('file-new'); },
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          async click() {
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
              filters: DOC_FILTERS,
              properties: ['openFile'],
            });
            if (canceled) return;
            openFile(filePaths[0]);
          },
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click() { mainWindow.webContents.send('file-save'); },
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click() { mainWindow.webContents.send('file-save-as'); },
        },
        { type: 'separator' },
        {
          label: 'Compare With…',
          accelerator: 'CmdOrCtrl+Shift+D',
          click() { mainWindow.webContents.send('compare-with'); },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ]},
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
      { role: 'togglefullscreen' },
    ]},
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('save-file', async (_e, { content, saveAs }) => {
  if (!currentFilePath || saveAs) {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      defaultPath: suggestedSavePath || 'untitled.md',
    });
    if (canceled) return { saved: false };
    currentFilePath = filePath;
  }
  fs.writeFileSync(currentFilePath, content, 'utf8');
  return { saved: true, path: currentFilePath };
});

// Pick a file to read without making it the document being edited (used by compare)
ipcMain.handle('pick-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: DOC_FILTERS,
    properties: ['openFile'],
  });
  if (canceled) return null;
  return readDocument(filePaths[0]);
});

// Native context menu for the editor textarea
ipcMain.handle('ctx-editor', (_e, line) => {
  const items = [
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { type: 'separator' },
    { role: 'selectAll' },
  ];
  if (line >= 0) {
    items.push(
      { type: 'separator' },
      { label: 'Jump to preview', click() { mainWindow.webContents.send('jump-to-preview', line); } },
    );
  }
  Menu.buildFromTemplate(items).popup({ window: mainWindow });
});

// Native context menu for the preview pane
ipcMain.handle('ctx-preview', (_e, line) => {
  const items = [
    { role: 'copy' },
    { type: 'separator' },
    { role: 'selectAll' },
  ];
  if (line >= 0) {
    items.push(
      { type: 'separator' },
      { label: 'Jump to source in editor', click() { mainWindow.webContents.send('jump-to-editor', line); } },
    );
  }
  Menu.buildFromTemplate(items).popup({ window: mainWindow });
});

function openFile(filePath) {
  const doc = readDocument(filePath);
  // Never let Save overwrite the original .docx with Markdown
  currentFilePath = isDocx(filePath) ? null : filePath;
  suggestedSavePath = isDocx(filePath) ? doc.path : null;
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('file-opened', doc);
  } else {
    pendingOpenPath = filePath;
  }
}

// macOS: fired when a file is opened via Finder / "Open With"
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFile(filePath);
});

app.whenReady().then(() => {
  createWindow();
  buildMenu();
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpenPath) {
      openFile(pendingOpenPath);
      pendingOpenPath = null;
    }
  });
});

app.on('window-all-closed', () => app.quit());
