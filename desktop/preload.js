const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('runnerApi', {
  start: () => ipcRenderer.invoke('runner-start'),
  stop: () => ipcRenderer.invoke('runner-stop'),
  loadData: () => ipcRenderer.invoke('data-load'),
  listLogs: () => ipcRenderer.invoke('logs-list'),
  readLog: name => ipcRenderer.invoke('logs-read', name),
  listLogResults: () => ipcRenderer.invoke('logs-results'),
  saveData: data => ipcRenderer.invoke('data-save', data),
  loadTelegram: () => ipcRenderer.invoke('telegram-load'),
  saveTelegram: data => ipcRenderer.invoke('telegram-save', data),
  testTelegram: data => ipcRenderer.invoke('telegram-test', data),
  importData: kind => ipcRenderer.invoke('data-import', kind),
  exportData: data => ipcRenderer.invoke('data-export', data),
  openFolder: () => ipcRenderer.invoke('runner-open-folder'),
  onOutput: callback => ipcRenderer.on('runner-output', (_, data) => callback(data)),
  onStatus: callback => ipcRenderer.on('runner-status', (_, data) => callback(data)),
  onExit: callback => ipcRenderer.on('runner-exit', (_, data) => callback(data))
});