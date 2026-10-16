import { app, ipcMain, safeStorage, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { AISettingsStore } from './settings'
import { generateMindMap } from './service'
import { validateRequest } from './validation'

export function registerAIIPC(trusted: (event: IpcMainInvokeEvent) => BrowserWindow): void {
  const store = new AISettingsStore(app.getPath('userData'), {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    ...(process.platform === 'linux'
      ? { getSelectedStorageBackend: () => safeStorage.getSelectedStorageBackend() }
      : {}),
    encryptString: (value) => safeStorage.encryptString(value),
    decryptString: (value) => safeStorage.decryptString(value),
  })
  const pending = new Map<
    number,
    { id: string; controller: AbortController; finished: Promise<void> }
  >()
  ipcMain.handle('ai:settings:get', (event) => {
    trusted(event)
    return store.get()
  })
  ipcMain.handle('ai:settings:save', (event, input: unknown) => {
    trusted(event)
    return store.save(input)
  })
  ipcMain.handle('ai:generate', (event, input: unknown) => {
    const window = trusted(event)
    const request = validateRequest(input)
    if (pending.has(event.sender.id)) throw new Error('已有 AI 请求正在进行，请等待或取消')
    const controller = new AbortController()
    const closed = () => {
      controller.abort()
    }
    window.once('closed', closed)
    const operation = Promise.resolve()
      .then(() => store.privateSettings())
      .then((settings) => generateMindMap(settings, request, controller.signal))
      .finally(() => {
        pending.delete(event.sender.id)
        window.removeListener('closed', closed)
      })
    pending.set(event.sender.id, {
      id: request.requestId,
      controller,
      finished: operation.then(
        () => undefined,
        () => undefined,
      ),
    })
    return operation
  })
  ipcMain.handle('ai:cancel', async (event, id: unknown) => {
    trusted(event)
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id))
      throw new Error('AI 请求标识无效')
    const request = pending.get(event.sender.id)
    if (request?.id === id) {
      request.controller.abort()
      await request.finished
    }
  })
}
