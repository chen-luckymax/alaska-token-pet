const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  hitTest: (hit) => ipcRenderer.send('hit-test', !!hit),
  dragStart: (point) => ipcRenderer.send('drag-start', point),
  dragMove: (point) => ipcRenderer.send('drag-move', point),
  dragEnd: () => ipcRenderer.send('drag-end'),
  openPanel: (tab) => ipcRenderer.send('open-panel', tab || 'balance'),
  openChat: () => ipcRenderer.send('open-chat'),
  demoFeed: (tier) => ipcRenderer.send('demo-feed', tier),
  resizePet: (size) => ipcRenderer.send('resize-pet', size),
  quit: () => ipcRenderer.send('quit-app'),
  closePanel: () => ipcRenderer.send('panel-close'),
  minimizePanel: () => ipcRenderer.send('panel-minimize'),
  getState: () => ipcRenderer.send('get-state'),
  onState: (callback) => ipcRenderer.on('pet-state', (_event, state) => callback(state)),
  onPanelTab: (callback) => ipcRenderer.on('panel-tab', (_event, tab) => callback(tab)),
  onDemoFeed: (callback) => ipcRenderer.on('demo-feed', (_event, tier) => callback(tier)),
  chatStatus: () => ipcRenderer.invoke('chat-status'),
  chatSend: (messages) => ipcRenderer.invoke('chat-send', { messages }),
  openExternal: (url) => ipcRenderer.send('open-external', url)
});
