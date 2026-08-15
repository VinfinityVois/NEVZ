const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Starting...');

try {
    contextBridge.exposeInMainWorld('electronAPI', {
        dbUpdated: (callback) => ipcRenderer.on('db-updated', callback),
        app: {
            getVersion: () => ipcRenderer.invoke('get-app-version'),
            getPlatform: () => process.platform,
            getStartupParams: () => ({ userId: null, brigadeId: null }),
            quit: () => ipcRenderer.invoke('app-quit')
        },
        splashDone: () => ipcRenderer.send('splash-done'),
        navigation: {
            openAdmin: () => ipcRenderer.invoke('open-admin'),
            openWorker: (userId, brigadeId) => ipcRenderer.invoke('open-worker', userId, brigadeId),
            logout: () => ipcRenderer.invoke('logout')
        },
        ai: {
            optimize: (data) => ipcRenderer.invoke('python:optimize', data),
            predict: (data) => ipcRenderer.invoke('python:predict', data),
            trainModel: (data) => ipcRenderer.invoke('python:train-model', data),
            getStatistics: () => ipcRenderer.invoke('python:statistics'),
            // AI Engine
            status: () => ipcRenderer.invoke('python:ai-status'),
            buildPlan: (data) => ipcRenderer.invoke('python:ai-build-plan', data),
            bottlenecks: (data) => ipcRenderer.invoke('python:ai-bottlenecks', data),
            trainDelayModel: () => ipcRenderer.invoke('python:ai-train-delay')
        },
        dbUpdated: (callback) => ipcRenderer.on('db-updated', (event, ...args) => callback(...args)),

        cpm: {
            calculate: (ops) => ipcRenderer.invoke('python:calculate-cpm', ops)
        },
        files: {
            importExcel: () => ipcRenderer.invoke('select-excel-file')
        },
        python: {
            isReady: () => ipcRenderer.invoke('get-python-status')
        },
        storage: {
            set: (k, v) => localStorage.setItem(`mfg_${k}`, JSON.stringify(v)),
            get: (k, d = null) => { try { const v = localStorage.getItem(`mfg_${k}`); return v ? JSON.parse(v) : d; } catch { return d; } }
        }
        
    });
    
    console.log('[Preload] ✅ API exposed successfully');
} catch (error) {
    console.error('[Preload] ❌ Failed to expose API:', error);
}