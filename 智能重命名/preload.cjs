const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smartRename', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  preview: (payload) => ipcRenderer.invoke('preview', payload),
  apply: (rows) => ipcRenderer.invoke('apply', rows),
});
