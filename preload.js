
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  activateTab: id => ipcRenderer.invoke('activate-tab', id),
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  getNavigationState: () => ipcRenderer.invoke('get-navigation-state'),
  onNavigationStateUpdated: callback => {
    ipcRenderer.on('navigation-state-updated', (_, state) => callback(state));
  },
  refreshTab: () => ipcRenderer.invoke('refresh-tab'),
  goHome: () => ipcRenderer.invoke('go-home'),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: theme => ipcRenderer.invoke('set-theme', theme),
  getZoomLevel: () => ipcRenderer.invoke('get-zoom-level'),
  changeZoom: direction => ipcRenderer.invoke('change-zoom', direction),
  resetZoom: () => ipcRenderer.invoke('reset-zoom'),

  onZoomLevelUpdated: callback => {
    ipcRenderer.on('zoom-level-updated', (_, factor) => callback(factor));
  },

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
