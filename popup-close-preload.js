const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popupAPI', {
  close: () => ipcRenderer.send('close-active-popup')
});
