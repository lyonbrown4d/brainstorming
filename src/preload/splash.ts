import { contextBridge, ipcRenderer } from 'electron'
import type { SplashAPI } from '@shared/startup'
import { isAppLanguage } from '@shared/language'

const api: SplashAPI = {
  mounted: () => {
    ipcRenderer.send('startup:splash-mounted')
  },
  retry: () => {
    ipcRenderer.send('startup:retry')
  },
  quit: () => {
    ipcRenderer.send('startup:quit')
  },
  onPhase: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, phase: unknown) => {
      if (phase === 'loading' || phase === 'slow' || phase === 'failed') callback(phase)
    }
    ipcRenderer.on('startup:phase', listener)
    return () => ipcRenderer.removeListener('startup:phase', listener)
  },
  onLanguage: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, language: unknown) => {
      if (isAppLanguage(language)) callback(language)
    }
    ipcRenderer.on('startup:language', listener)
    return () => ipcRenderer.removeListener('startup:language', listener)
  },
}
contextBridge.exposeInMainWorld('brainstormingSplash', api)
