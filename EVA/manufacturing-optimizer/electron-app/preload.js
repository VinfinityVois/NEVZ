const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Starting...');

try {
    contextBridge.exposeInMainWorld('electronAPI', {
        app: {
            getVersion: () => ipcRenderer.invoke('get-app-version'),
            getPlatform: () => process.platform,
            getStartupParams: () => ({ userId: null, brigadeId: null })
        },
        navigation: {
            openAdmin: () => ipcRenderer.invoke('open-admin'),
            openWorker: (userId, brigadeId) => ipcRenderer.invoke('open-worker', userId, brigadeId),
            logout: () => ipcRenderer.invoke('logout')
        },
        ai: {
            optimize: (data) => ipcRenderer.invoke('python:optimize', data),
            predict: (data) => ipcRenderer.invoke('python:predict', data),
            trainModel: (data) => ipcRenderer.invoke('python:train-model', data),
            getStatistics: () => ipcRenderer.invoke('python:statistics')
        },
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