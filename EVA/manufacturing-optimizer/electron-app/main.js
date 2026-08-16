const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const net = require('net');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('in-process-gpu');

const APP_VERSION = '2.0.0';
Menu.setApplicationMenu(null);   // убирает File Edit View…
const PYTHON_API_URL = 'http://127.0.0.1:8000';

let loginWindow = null;
let adminWindow = null;
let pythonProcess = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = adminWindow || loginWindow;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function log(level, ...args) {
    console.log(`[${new Date().toISOString()}] [${level}]`, ...args);
}

function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(true));
        server.once('listening', () => {
            server.close();
            resolve(false);
        });
        server.listen(port);
    });
}

async function checkPythonApi() {
    return new Promise((resolve) => {
        const req = http.get(`${PYTHON_API_URL}/health`, { timeout: 2000 }, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}

async function waitForPythonApi(maxRetries = 30) {
    log('INFO', 'Waiting for Python API...');
    for (let i = 0; i < maxRetries; i++) {
        if (await checkPythonApi()) {
            log('INFO', 'Python API ready');
            return true;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}

async function startPythonBackend() {
    if (await isPortInUse(8000)) {
        log('INFO', 'Port 8000 already in use, using existing Python API');
        return;
    }

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const apiScript = path.join(__dirname, '..', 'python-backend', 'api.py');
    
    if (!fs.existsSync(apiScript)) {
        log('ERROR', 'api.py not found:', apiScript);
        return;
    }
    
    log('INFO', 'Starting Python backend...');
    pythonProcess = spawn(pythonCmd, [apiScript], {
        cwd: path.join(__dirname, '..', 'python-backend'),
        env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
    });
    
    pythonProcess.stdout.on('data', d => {
        const text = d.toString().trim();
        if (text) console.log('[Python]', text);
    });
    pythonProcess.stderr.on('data', d => {
        const text = d.toString().trim();
        if (text) console.log('[Python Error]', text);
    });
    
    pythonProcess.on('exit', (code) => {
        log('WARN', `Python process exited with code ${code}`);
        pythonProcess = null;
    });
}

function createLoginWindow() {
    loginWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        fullscreen: true,          // или show: false → maximize
        frame: false,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: false        // прод: без F12
        }
    });
    loginWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    // loginWindow.webContents.openDevTools();  // УДАЛИТЬ
    loginWindow.on('closed', () => { loginWindow = null; });
}

function createAdminWindow() {
    if (adminWindow) {
        adminWindow.focus();
        return;
    }
    
    adminWindow = new BrowserWindow({
        width: 1440, height: 900, minWidth: 1200, minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    adminWindow.loadFile(path.join(__dirname, 'renderer', 'admin.html'));
    adminWindow.on('closed', () => { adminWindow = null; });
}

function registerIpcHandlers() {
    ipcMain.handle('get-app-version', () => APP_VERSION);
    ipcMain.handle('get-python-status', checkPythonApi);
    
    ipcMain.handle('open-admin', () => {
        createAdminWindow();
        if (loginWindow) loginWindow.close();
    });
    
    ipcMain.handle('logout', (e) => {
        BrowserWindow.fromWebContents(e.sender)?.close();
    });
    
    // Legacy AI
    ipcMain.handle('python:optimize', async (e, data) => {
        try {
            const res = await fetch(`${PYTHON_API_URL}/optimize`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
            });
            return res.ok ? res.json() : { status: 'error', detail: res.statusText };
        } catch (e) { return { status: 'error', detail: e.message }; }
    });
    
    ipcMain.handle('python:predict', async (e, data) => {
        try {
            const res = await fetch(`${PYTHON_API_URL}/predict`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
            });
            return res.ok ? res.json() : { status: 'error' };
        } catch (e) { return { status: 'error', detail: e.message }; }
    });
    
    ipcMain.handle('python:train-model', async (e, data) => {
        try {
            const res = await fetch(`${PYTHON_API_URL}/train`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
            });
            return res.ok ? res.json() : { status: 'error' };
        } catch (e) { return { status: 'error', detail: e.message }; }
    });
    
    ipcMain.handle('python:statistics', async () => {
        try {
            const res = await fetch(`${PYTHON_API_URL}/statistics`);
            return res.ok ? res.json() : { status: 'error' };
        } catch (e) { return { status: 'error', detail: e.message }; }
    });
    
    ipcMain.handle('python:calculate-cpm', async (e, ops) => {
        try {
            const res = await fetch(`${PYTHON_API_URL}/calculate-cpm`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operations: ops })
            });
            return res.ok ? res.json() : { status: 'error' };
        } catch (e) { return { status: 'error', detail: e.message }; }
    });
    
    // AI Engine (без дублей!)
    ipcMain.handle('python:ai-status', async () => {
        try {
            const res = await fetch(`${PYTHON_API_URL}/ai/status`, { signal: AbortSignal.timeout(3000) });
            return res.ok ? res.json() : { status: 'error', detail: 'API returned ' + res.status };
        } catch (e) { return { status: 'offline', detail: e.message }; }
    });
    
    ipcMain.handle('python:ai-build-plan', async (e, data) => {
        try {
            const res = await fetch(`${PYTHON_API_URL}/ai/build-plan`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
                signal: AbortSignal.timeout(15000)
            });
            return res.ok ? res.json() : { success: false, error: res.statusText };
        } catch (e) { return { success: false, error: e.message }; }
    });
    
    ipcMain.handle('python:ai-bottlenecks', async (e, data) => {
        try {
            const res = await fetch(`${PYTHON_API_URL}/ai/bottlenecks`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
                signal: AbortSignal.timeout(10000)
            });
            return res.ok ? res.json() : { bottlenecks: [] };
        } catch (e) { return { bottlenecks: [] }; }
    });
    
    ipcMain.handle('python:ai-train-delay', async () => {
        try {
            await fetch(`${PYTHON_API_URL}/ai/sync-training-data`, { method: 'POST', signal: AbortSignal.timeout(5000) });
            const res = await fetch(`${PYTHON_API_URL}/ai/train/delay-model-from-db`, { method: 'POST', signal: AbortSignal.timeout(30000) });
            return res.ok ? res.json() : { status: 'error' };
        } catch (e) { return { status: 'offline', message: e.message }; }
    });
    
    ipcMain.handle('select-excel-file', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls', 'xlsb', 'csv'] }]
        });
        return result.canceled ? null : result.filePaths[0];
    });
}

app.whenReady().then(async () => {
    log('INFO', 'Starting Manufacturing Optimizer v' + APP_VERSION);
  
    await startPythonBackend();
    await waitForPythonApi();
  
    registerIpcHandlers();
  
    ipcMain.once('splash-done', () => {
      if (splash && !splash.isDestroyed()) splash.close();
      createLoginWindow();
    });
  
    const splash = createSplashWindow();
    // запасной выход, если preload не сработал
    setTimeout(() => {
      if (splash && !splash.isDestroyed() && !loginWindow) {
        splash.close();
        createLoginWindow();
      }
    }, 4000);
  });

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (pythonProcess) {
        log('INFO', 'Killing Python process...');
        pythonProcess.kill();
        pythonProcess = null;
    }
});

function blockDevShortcuts(win) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') event.preventDefault();
      if (input.control && input.shift && ['I', 'J', 'C'].includes((input.key || '').toUpperCase())) {
        event.preventDefault();
      }
    });
  }
  
  function createSplashWindow() {
    const splash = new BrowserWindow({
      fullscreen: true,
      frame: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        devTools: false
      }
    });
    splash.loadFile(path.join(__dirname, 'renderer', 'splash.html'));
    return splash;
  }
  
  function createLoginWindow() {
    loginWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      fullscreen: true,
      frame: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        devTools: false
      }
    });
    loginWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    blockDevShortcuts(loginWindow);
    loginWindow.on('closed', () => { loginWindow = null; });
  }
  
  function createAdminWindow() {
    if (adminWindow) {
      adminWindow.focus();
      return;
    }
    adminWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1200,
      minHeight: 700,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        devTools: false
      }
    });
    adminWindow.loadFile(path.join(__dirname, 'renderer', 'admin.html'));
    blockDevShortcuts(adminWindow);
    adminWindow.on('closed', () => { adminWindow = null; });
  }