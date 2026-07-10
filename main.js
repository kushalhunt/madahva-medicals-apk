const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let serverProcess = null;
let mainWindow = null;

function startServer() {
  const serverPath = path.join(__dirname, 'server.js');
  serverProcess = fork(serverPath, [], {
    silent: true,
    env: { ...process.env }
  });
  serverProcess.stdout.on('data', (data) => console.log('Server:', data.toString()));
  serverProcess.stderr.on('data', (data) => {
    const msg = data.toString();
    console.error('Server error:', msg);
    if (msg.includes('MongoDB connection failed') || msg.includes('ECONNREFUSED')) {
      dialog.showErrorBox('MongoDB Not Running', 'Could not connect to MongoDB.\n\nGo to: Services → MongoDB → Start');
    }
  });
}

function waitForServer(retries = 20) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    let attempts = 0;
    const check = () => {
      http.get('http://127.0.0.1:3791/api/health', (res) => {
        if (res.statusCode === 200) resolve(); else retry();
      }).on('error', retry);
    };
    const retry = () => { attempts++; if (attempts >= retries) reject(new Error('Server did not start')); else setTimeout(check, 500); };
    check();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 800, minHeight: 600,
    title: 'Madhava Clinic',
    icon: path.join(__dirname, 'app', 'logo.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    backgroundColor: '#f7f5ef',
    show: false,
  });

  mainWindow.loadURL(`data:text/html,<html><body style="background:#f7f5ef;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Georgia,serif;color:#1e3d1e;font-size:22px;">Starting Madhava Clinic...</body></html>`);
  mainWindow.show();

  try {
    await waitForServer();
    mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
  } catch (e) {
    mainWindow.loadURL(`data:text/html,<html><body style="background:#f7f5ef;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Georgia,serif;color:#c0533c;font-size:18px;text-align:center;padding:40px;">Could not connect to local server.<br><br>Make sure MongoDB is installed and running.</body></html>`);
  }

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Alt+F4', click: () => app.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.webContents.openDevTools() },
        { type: 'separator' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
        { role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => { startServer(); createWindow(); });
app.on('window-all-closed', () => { if (serverProcess) serverProcess.kill(); app.quit(); });
app.on('before-quit', () => { if (serverProcess) serverProcess.kill(); });
