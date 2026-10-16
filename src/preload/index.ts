import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI, MenuAction } from '../shared/contracts'
import { isWindowState } from '../shared/window'

const actions = new Set<MenuAction>(['new', 'open', 'save', 'saveAs', 'undo', 'redo'])
const api: DesktopAPI = {
  platform:
    process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
  getWindowState: () => ipcRenderer.invoke('window:state'),
  onWindowStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (isWindowState(state)) callback(state)
    }
    ipcRenderer.on('window:state-changed', listener)
    return () => ipcRenderer.removeListener('window:state-changed', listener)
  },
  hasOpenFile: () => ipcRenderer.invoke('document:has-open-file'),
  takeOpenFile: () => ipcRenderer.invoke('document:take-open-file'),
  onOpenFile: (callback) => {
    const listener = () => {
      callback()
    }
    ipcRenderer.on('document:open-file-ready', listener)
    return () => ipcRenderer.removeListener('document:open-file-ready', listener)
  },
  openDocument: () => ipcRenderer.invoke('document:open'),
  saveDocument: (request) => ipcRenderer.invoke('document:save', request),
  readRecovery: () => ipcRenderer.invoke('recovery:read'),
  writeRecovery: (contents) => ipcRenderer.invoke('recovery:write', contents),
  setDirty: (dirty, preserveRecovery = false) => {
    ipcRenderer.send('document:dirty', dirty, preserveRecovery)
  },
  getRecentFiles: () => ipcRenderer.invoke('document:recent'),
  openRecent: (path) => ipcRenderer.invoke('document:open-recent', path),
  onMenuAction: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action === 'string' && actions.has(action as MenuAction)) {
        callback(action as MenuAction)
      }
    }
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  },
}
contextBridge.exposeInMainWorld('trelyx', api)
