
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  activateTab: id => ipcRenderer.invoke('activate-tab', id),
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  refreshTab: () => ipcRenderer.invoke('refresh-tab'),
  goHome: () => ipcRenderer.invoke('go-home'),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: theme => ipcRenderer.invoke('set-theme', theme),

  getAudioMuted: () => ipcRenderer.invoke('get-audio-muted'),
  setAudioMuted: muted => ipcRenderer.invoke('set-audio-muted', muted),
  getAudioStates: () => ipcRenderer.invoke('get-audio-states'),

  onAudioStateUpdated: callback => {
    ipcRenderer.on('audio-state-updated', (_, data) => callback(data));
  },

  onFaviconUpdated: callback => {
    ipcRenderer.on('favicon-updated', (_, data) => callback(data));
  },

  logFaviconError: data =>
    ipcRenderer.send('favicon-load-error', data),

  fetchFaviconData: url =>
    ipcRenderer.invoke('fetch-favicon-data', url)
});