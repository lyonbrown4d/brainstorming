import { contextBridge, ipcRenderer } from 'electron'
import type { SplashAPI } from '../shared/startup'

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
}
contextBridge.exposeInMainWorld('trelyxSplash', api)
