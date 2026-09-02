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
let workerWindow = null;
let pythonProcess = null;
let brigadierWindow = null;

/** Кэш данных со старта (до открытия админки) */
let bootstrapCache = {
  ready: false,
  loading: false,
  error: null,
  loadedAt: null,
  health: null,
  operations: [],
  brigades: [],
  workers: [],
  brigadeGroups: [],
  aiStatus: null,
};


function broadcastBootstrapProgress(payload) {
  const data = {
    ...payload,
    operations: (bootstrapCache.operations && bootstrapCache.operations.length) || 0,
    brigades: (bootstrapCache.brigades && bootstrapCache.brigades.length) || 0,
    workers: (bootstrapCache.workers && bootstrapCache.workers.length) || 0,
    groups: (bootstrapCache.brigadeGroups && bootstrapCache.brigadeGroups.length) || 0,
    ready: !!bootstrapCache.ready,
    loading: !!bootstrapCache.loading,
  };
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send('bootstrap:progress', data);
    } catch (_) {}
  }
}

const stepPause = (ms = 700) => new Promise((r) => setTimeout(r, ms));

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

async function fetchJson(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function bootstrapAppData() {
  if (bootstrapCache.loading) return bootstrapCache;

  bootstrapCache.loading = true;
  bootstrapCache.ready = false;
  bootstrapCache.error = null;
  bootstrapCache.operations = [];
  bootstrapCache.brigades = [];
  bootstrapCache.workers = [];
  bootstrapCache.brigadeGroups = [];
  bootstrapCache.aiStatus = null;

  const asArr = (x) => (Array.isArray(x) ? x : (x?.items || x?.data || []));

  log('INFO', 'Bootstrap: step by step...');
  broadcastBootstrapProgress({ stage: 'start', message: 'Подключение к API…', pct: 5 });
  await stepPause(500);

  try {
    broadcastBootstrapProgress({ stage: 'health', message: 'Проверка сервера…', pct: 10 });
    bootstrapCache.health = await fetchJson(`${PYTHON_API_URL}/health`).catch(() => ({ status: 'unknown' }));
    await stepPause(400);

    broadcastBootstrapProgress({ stage: 'operations', message: 'Загрузка операций…', pct: 20 });
    await stepPause(500);
    bootstrapCache.operations = asArr(
      await fetchJson(`${PYTHON_API_URL}/operations`).catch(() => [])
    );
    broadcastBootstrapProgress({
      stage: 'operations_done',
      message: `Операции: ${bootstrapCache.operations.length}`,
      pct: 40,
    });
    await stepPause(800);

    broadcastBootstrapProgress({ stage: 'brigades', message: 'Загрузка бригад…', pct: 50 });
    await stepPause(500);
    bootstrapCache.brigades = asArr(
      await fetchJson(`${PYTHON_API_URL}/brigades`).catch(() => [])
    );
    broadcastBootstrapProgress({
      stage: 'brigades_done',
      message: `Бригады: ${bootstrapCache.brigades.length}`,
      pct: 65,
    });
    await stepPause(800);

    broadcastBootstrapProgress({ stage: 'workers', message: 'Загрузка сотрудников…', pct: 72 });
    await stepPause(500);
    bootstrapCache.workers = asArr(
      await fetchJson(`${PYTHON_API_URL}/workers`).catch(() => [])
    );
    broadcastBootstrapProgress({
      stage: 'workers_done',
      message: `Сотрудники: ${bootstrapCache.workers.length}`,
      pct: 85,
    });
    await stepPause(700);

    broadcastBootstrapProgress({ stage: 'groups', message: 'Загрузка групп бригад…', pct: 90 });
    await stepPause(400);
    bootstrapCache.brigadeGroups = asArr(
      await fetchJson(`${PYTHON_API_URL}/brigade-groups`).catch(() => [])
    );
    broadcastBootstrapProgress({
      stage: 'groups_done',
      message: `Группы: ${bootstrapCache.brigadeGroups.length}`,
      pct: 95,
    });
    await stepPause(400);

    bootstrapCache.aiStatus = await fetchJson(`${PYTHON_API_URL}/ai/status`).catch(() => null);

    bootstrapCache.ready = true;
    bootstrapCache.loading = false;
    bootstrapCache.loadedAt = new Date().toISOString();

    broadcastBootstrapProgress({
      stage: 'done',
      message: `Загружено: ${bootstrapCache.operations.length} операций, ${bootstrapCache.brigades.length} бригад, ${bootstrapCache.workers.length} сотрудников`,
      pct: 100,
    });

    log(
      'INFO',
      `Bootstrap OK: ops=${bootstrapCache.operations.length} brigades=${bootstrapCache.brigades.length}`
    );
  } catch (e) {
    bootstrapCache.loading = false;
    bootstrapCache.ready = false;
    bootstrapCache.error = e.message || String(e);
    broadcastBootstrapProgress({
      stage: 'error',
      message: 'Ошибка: ' + bootstrapCache.error,
      pct: 100,
    });
    log('ERROR', 'Bootstrap failed:', bootstrapCache.error);
  }
  return bootstrapCache;
}

async function refreshBootstrapPartial(keys) {
  const map = {
    operations: '/operations',
    brigades: '/brigades',
    workers: '/workers',
    brigadeGroups: '/brigade-groups',
    health: '/health',
    aiStatus: '/ai/status',
  };
  const asArr = (x) => (Array.isArray(x) ? x : (x?.items || x?.data || []));
  for (const k of keys || Object.keys(map)) {
    if (!map[k]) continue;
    try {
      const data = await fetchJson(`${PYTHON_API_URL}${map[k]}`);
      if (k === 'operations') bootstrapCache.operations = asArr(data);
      else if (k === 'brigades') bootstrapCache.brigades = asArr(data);
      else if (k === 'workers') bootstrapCache.workers = asArr(data);
      else if (k === 'brigadeGroups') bootstrapCache.brigadeGroups = asArr(data);
      else if (k === 'health') bootstrapCache.health = data;
      else if (k === 'aiStatus') bootstrapCache.aiStatus = data;
    } catch (e) {
      log('WARN', 'refreshBootstrap', k, e.message);
    }
  }
  bootstrapCache.loadedAt = new Date().toISOString();
  bootstrapCache.ready = true;
  return bootstrapCache;
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


// function createAdminWindow() {
//     if (adminWindow) {
//         adminWindow.focus();
//         return;
//     }
    
//     adminWindow = new BrowserWindow({
//         width: 1440, height: 900, minWidth: 1200, minHeight: 700,
//         webPreferences: {
//             nodeIntegration: false,
//             contextIsolation: true,
//             preload: path.join(__dirname, 'preload.js')
//         }
//     });
//     adminWindow.loadFile(path.join(__dirname, 'renderer', 'admin.html'));
//     adminWindow.on('closed', () => { adminWindow = null; });
// }

function registerIpcHandlers() {
    ipcMain.handle('get-app-version', () => APP_VERSION);
    ipcMain.handle('get-python-status', checkPythonApi);
    
    ipcMain.handle('open-admin', () => {
      createAdminWindow();
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
  });

  ipcMain.handle('open-worker', (_e, userId, brigadeId) => {
      createWorkerWindow(userId, brigadeId);
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
  });

  ipcMain.handle('open-brigadier', (_e, userId, brigadeId) => {
    createBrigadierWindow(userId, brigadeId);
    if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
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

    ipcMain.handle('bootstrap:get', () => bootstrapCache);

    ipcMain.handle('bootstrap:refresh', async (_e, keys) => {
      return refreshBootstrapPartial(keys);
    });

    ipcMain.handle('bootstrap:wait', async () => {
      if (bootstrapCache.ready) return bootstrapCache;
      if (!bootstrapCache.loading) await bootstrapAppData();
      let n = 0;
      while (bootstrapCache.loading && n < 40) {
        await new Promise((r) => setTimeout(r, 250));
        n++;
      }
      return bootstrapCache;
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
    const apiOk = await waitForPythonApi();
  
    registerIpcHandlers();

    ipcMain.once('splash-done', () => {
      if (splash && !splash.isDestroyed()) splash.close();
      createLoginWindow();
    });

    // СНАЧАЛА splash (чтобы ловил progress)
    const splash = createSplashWindow();
    await new Promise((r) => setTimeout(r, 500));

    // ПОТОМ пошаговая загрузка
    if (apiOk) {
      log('INFO', 'Bootstrap after splash visible...');
      await bootstrapAppData();
      log('INFO', 'Bootstrap finished');
    }

    setTimeout(() => {
      if (splash && !splash.isDestroyed() && !loginWindow) {
        log('WARN', 'Splash fallback timeout');
        splash.close();
        createLoginWindow();
      }
    }, 30000);
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
      fullscreen: true,
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
  

  function createWorkerWindow(userId, brigadeId) {
    if (workerWindow && !workerWindow.isDestroyed()) {
      workerWindow.focus();
      return;
    }
    workerWindow = new BrowserWindow({
      fullscreen: true,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        devTools: false
      }
    });
    const q = new URLSearchParams({
      userId: String(userId ?? ''),
      brigadeId: String(brigadeId ?? ''),
    }).toString();
    workerWindow.loadFile(
      path.join(__dirname, 'renderer', 'worker.html'),
      { search: q }
    );
    blockDevShortcuts(workerWindow);
    workerWindow.on('closed', () => { workerWindow = null; });
  }

  function createBrigadierWindow(userId, brigadeId) {
    const q = new URLSearchParams({
      userId: String(userId ?? ''),
      brigadeId: String(brigadeId ?? ''),
    }).toString();
  
    // Всегда пересоздаём окно с актуальными параметрами
    if (brigadierWindow && !brigadierWindow.isDestroyed()) {
      try { brigadierWindow.close(); } catch (_) {}
      brigadierWindow = null;
    }
  
    brigadierWindow = new BrowserWindow({
      fullscreen: true,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        devTools: true, // временно, чтобы видеть [Brigadier init]
      },
    });
  
    // и search, и query — совместимость версий Electron
    brigadierWindow.loadFile(
      path.join(__dirname, 'renderer', 'brigadier.html'),
      { search: q, query: { userId: String(userId ?? ''), brigadeId: String(brigadeId ?? '') } }
    );
  
    brigadierWindow.webContents.on('did-finish-load', () => {
      console.log('[main] brigadier loaded', q);
    });
  
    blockDevShortcuts(brigadierWindow);
    brigadierWindow.on('closed', () => { brigadierWindow = null; });
  }
  
  // logout: закрыть админ → открыть логин (не закрывать приложение)
  ipcMain.handle('logout', () => {
    if (adminWindow && !adminWindow.isDestroyed()) {
      adminWindow.close();
      adminWindow = null;
    }
    if (workerWindow && !workerWindow.isDestroyed()) {
      workerWindow.close();
      workerWindow = null;
    }
    // ОБЯЗАТЕЛЬНО:
    if (typeof brigadierWindow !== 'undefined' && brigadierWindow && !brigadierWindow.isDestroyed()) {
      brigadierWindow.close();
      brigadierWindow = null;
    }
    if (!loginWindow || loginWindow.isDestroyed()) {
      createLoginWindow();
    } else {
      loginWindow.focus();
    }
  });
  
  ipcMain.handle('app-quit', () => {
    app.quit();
  });
  
