const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;
let currentFilePath = null;

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
              filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
              properties: ['openFile'],
            });
            if (canceled) return;
            const content = fs.readFileSync(filePaths[0], 'utf8');
            currentFilePath = filePaths[0];
            mainWindow.webContents.send('file-opened', { path: filePaths[0], content });
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
      defaultPath: 'untitled.md',
    });
    if (canceled) return { saved: false };
    currentFilePath = filePath;
  }
  fs.writeFileSync(currentFilePath, content, 'utf8');
  return { saved: true, path: currentFilePath };
});

app.whenReady().then(() => {
  createWindow();
  buildMenu();
});

app.on('window-all-closed', () => app.quit());
