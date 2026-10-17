import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI, MenuAction } from '@shared/contracts'
import { isWindowState } from '@shared/window'
import type { StartupAPI } from '@shared/startup'

const actions = new Set<MenuAction>([
  'closeTab',
  'new',
  'open',
  'save',
  'saveAs',
  'undo',
  'redo',
  'zoomIn',
  'zoomOut',
  'actualSize',
  'centerRoot',
])
const api: DesktopAPI = {
  platform:
    process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
  getLanguage: () => ipcRenderer.invoke('app:language:get'),
  setLanguage: (language) => ipcRenderer.invoke('app:language:set', language),
  getWindowState: () => ipcRenderer.invoke('window:state'),
  setAppearance: (theme) => ipcRenderer.invoke('window:appearance', theme),
  onSystemThemeChanged: (callback) => {
    const listener = () => {
      callback()
    }
    ipcRenderer.on('window:system-theme-changed', listener)
    return () => ipcRenderer.removeListener('window:system-theme-changed', listener)
  },
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
  getAISettings: () => ipcRenderer.invoke('ai:settings:get'),
  saveAISettings: (settings) => ipcRenderer.invoke('ai:settings:save', settings),
  generateMindMap: (request) => ipcRenderer.invoke('ai:generate', request),
  cancelAIGeneration: (requestId) => ipcRenderer.invoke('ai:cancel', requestId),
  getMCPConnection: () => ipcRenderer.invoke('mcp:connection'),
  startMCPServer: (input) => ipcRenderer.invoke('mcp:start', input),
  stopMCPServer: () => ipcRenderer.invoke('mcp:stop'),
  onMCPRequest: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      request: Parameters<typeof callback>[0],
    ) => {
      callback(request)
    }
    ipcRenderer.on('mcp:request', listener)
    return () => ipcRenderer.removeListener('mcp:request', listener)
  },
  replyMCPRequest: (reply) => {
    ipcRenderer.send('mcp:reply', reply)
  },
  onMCPConnectionChanged: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      connection: Parameters<typeof callback>[0],
    ) => {
      callback(connection)
    }
    ipcRenderer.on('mcp:connection-changed', listener)
    return () => ipcRenderer.removeListener('mcp:connection-changed', listener)
  },
  openDocument: () => ipcRenderer.invoke('document:open'),
  selectAsset: (kind) => ipcRenderer.invoke('asset:select', kind),
  exportAsset: (asset) => ipcRenderer.invoke('asset:export', asset),
  exportFile: (request) => ipcRenderer.invoke('file:export', request),
  writeTopicClipboard: (contents, plainText) =>
    ipcRenderer.invoke('clipboard:write-topics', contents, plainText),
  readTopicClipboard: () => ipcRenderer.invoke('clipboard:read-topics'),
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
  saveDocument: (request) => ipcRenderer.invoke('document:save', request),
  unlockDocument: (token, password) => ipcRenderer.invoke('document:unlock', token, password),
  activateUnlockedDocument: (token) => ipcRenderer.invoke('document:activate-unlocked', token),
  cancelUnlock: (token) => ipcRenderer.invoke('document:cancel-unlock', token),
  getFileSecurity: (id) => ipcRenderer.invoke('document:security', id),
  setFilePassword: (id, password) => ipcRenderer.invoke('document:set-password', id, password),
  readLockedRecovery: () => ipcRenderer.invoke('recovery:read-locked'),
  readWorkspaceRecovery: () => ipcRenderer.invoke('recovery:workspace:read'),
  writeWorkspaceRecovery: (contents) => ipcRenderer.invoke('recovery:workspace:write', contents),
  listDocumentBackups: (id) => ipcRenderer.invoke('document:backups', id),
  restoreDocumentBackup: (id) => ipcRenderer.invoke('document:restore-backup', id),
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
const startup: StartupAPI = {
  ready: () => {
    ipcRenderer.send('startup:ready')
  },
  failed: () => {
    ipcRenderer.send('startup:failed')
  },
}
contextBridge.exposeInMainWorld('trelyxStartup', startup)
