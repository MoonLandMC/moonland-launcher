import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ml', {
  state: () => ipcRenderer.invoke('ml:state'),
  login: (u: string, p: string) => ipcRenderer.invoke('ml:login', u, p),
  logout: () => ipcRenderer.invoke('ml:logout'),
  play: () => ipcRenderer.invoke('ml:play'),
  settings: (patch: unknown) => ipcRenderer.invoke('ml:settings', patch),
  openDir: () => ipcRenderer.invoke('ml:openDir'),
  verify: () => ipcRenderer.invoke('ml:verify'),
  skinPick: () => ipcRenderer.invoke('ml:skinPick'),
  skinApply: (v: string) => ipcRenderer.invoke('ml:skinApply', v),
  online: () => ipcRenderer.invoke('ml:online'),
  news: () => ipcRenderer.invoke('ml:news'),
  minimize: () => ipcRenderer.invoke('ml:minimize'),
  close: () => ipcRenderer.invoke('ml:close'),
  onProgress: (cb: (p: unknown) => void) => ipcRenderer.on('ml:progress', (_e, p) => cb(p)),
  onStatus: (cb: (p: unknown) => void) => ipcRenderer.on('ml:status', (_e, p) => cb(p)),
  installUpdate: () => ipcRenderer.invoke('ml:installUpdate'),
  checkUpdate: () => ipcRenderer.invoke('ml:checkUpdate'),
  onUpdate: (cb: (p: unknown) => void) => ipcRenderer.on('ml:update', (_e, p) => cb(p)),
});
