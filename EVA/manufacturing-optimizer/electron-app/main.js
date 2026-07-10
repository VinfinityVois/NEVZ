const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('in-process-gpu');

const APP_VERSION = '2.0.0';
const PYTHON_API_URL = 'http://127.0.0.1:8000';

let loginWindow = null;
let adminWindow = null;
const workerWindows = new Map();
let pythonProcess = null;
let isPythonReady = false;

function log(level, ...args) {
    console.log(`[${new Date().toISOString()}] [${level}]`, ...args);
}

async function checkPythonApi() {
    return new Promise((resolve) => {
        const req = http.get(`${PYTHON_API_URL}/health`, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => { req.destroy(); resolve(false); });
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

function startPythonBackend() {
    const pythonCmd = 'python';
    const apiScript = path.join(__dirname, '..', 'python-backend', 'api.py');
    
    if (!fs.existsSync(apiScript)) {
        log('ERROR', 'api.py not found:', apiScript);
        return;
    }
    
    pythonProcess = spawn(pythonCmd, [apiScript], {
        cwd: path.join(__dirname, '..', 'python-backend'),
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    
    pythonProcess.stdout.on('data', d => console.log('[Python]', d.toString().trim()));
    pythonProcess.stderr.on('data', d => console.log('[Python Error]', d.toString().trim()));
}

function createLoginWindow() {
    loginWindow = new BrowserWindow({
        width: 500, height: 480, frame: false, transparent: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    loginWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    loginWindow.webContents.openDevTools();
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
    adminWindow.webContents.openDevTools();
    adminWindow.on('closed', () => { adminWindow = null; });
    adminWindow.on('focus', () => adminWindow?.webContents.send('window-focus', 'admin'));
}

// IPC Handlers
function registerIpcHandlers() {
    ipcMain.handle('get-app-version', () => APP_VERSION);
    ipcMain.handle('get-python-status', checkPythonApi);
    
    ipcMain.handle('open-admin', () => {
        createAdminWindow();
        loginWindow?.close();
    });
    
    ipcMain.handle('logout', (e) => {
        BrowserWindow.fromWebContents(e.sender)?.close();
    });
    
    // AI endpoints
    ipcMain.handle('python:optimize', async (e, data) => {
        const res = await fetch(`${PYTHON_API_URL}/optimize`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        return res.json();
    });
    
    ipcMain.handle('python:calculate-cpm', async (e, ops) => {
        const res = await fetch(`${PYTHON_API_URL}/calculate-cpm`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operations: ops })
        });
        return res.json();
    });
    
    ipcMain.handle('python:predict', async (e, data) => {
        const res = await fetch(`${PYTHON_API_URL}/predict`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        return res.json();
    });
    
    ipcMain.handle('python:train-model', async (e, data) => {
        const res = await fetch(`${PYTHON_API_URL}/train`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        return res.json();
    });
    
    ipcMain.handle('python:statistics', async () => {
        const res = await fetch(`${PYTHON_API_URL}/statistics`);
        return res.json();
    });
    
    ipcMain.handle('select-excel-file', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Excel Files', extensions: ['xlsx', 'xls', 'xlsb', 'csv'] }
        ]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const fileBuffer = await fs.promises.readFile(filePath);
        const fileName = path.basename(filePath);
        
        // Создаём FormData для отправки
        const formData = new FormData();
        const blob = new Blob([fileBuffer]);
        formData.append('file', blob, fileName);
        
        try {
            const response = await fetch(`${PYTHON_API_URL}/import-excel`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            return { success: true, ...data };
        } catch (error) {
            console.error('Upload error:', error);
            return { success: false, error: error.message };
        }
    }
    
    return { success: false, error: 'No file selected' };
});
    
    // File upload to Python
    ipcMain.handle('upload-excel', async (e, filePath) => {
        const formData = new FormData();
        const fileBuffer = await fs.promises.readFile(filePath);
        const blob = new Blob([fileBuffer]);
        formData.append('file', blob, path.basename(filePath));
        
        const res = await fetch(`${PYTHON_API_URL}/import-excel`, {
            method: 'POST', body: formData
        });
        return res.json();
    });
}

app.whenReady().then(async () => {
    log('INFO', 'Starting Manufacturing Optimizer v' + APP_VERSION);
    
    startPythonBackend();
    isPythonReady = await waitForPythonApi();
    
    registerIpcHandlers();
    createLoginWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    pythonProcess?.kill();
});