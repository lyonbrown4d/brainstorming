import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type IpcMainEvent,
} from 'electron'
import type { DocumentFiles } from './files'
import { validateContents, validatePath } from './files'
import type { SaveRequest } from '../shared/contracts'

const filters = [{ name: 'Trelyx 思维导图', extensions: ['trelyx', 'json'] }]

export function registerIPC(
  getWindow: () => BrowserWindow | null,
  files: DocumentFiles,
  setDirty: (dirty: boolean, preserveRecovery: boolean) => void,
): void {
  function trusted(event: IpcMainInvokeEvent | IpcMainEvent): BrowserWindow {
    const window = getWindow()
    if (
      event.sender !== window?.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    ) {
      throw new Error('不受信任的请求')
    }
    return window
  }
  ipcMain.handle('document:open', async (event) => {
    const window = trusted(event)
    const result = await dialog.showOpenDialog(window, { filters, properties: ['openFile'] })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : files.openSelected(path)
  })
  ipcMain.handle('document:save', async (event, input: unknown) => {
    const window = trusted(event)
    if (!input || typeof input !== 'object') throw new Error('保存请求无效')
    const request = input as Partial<SaveRequest>
    validateContents(request.contents)
    if (request.path !== null) validatePath(request.path)
    let path = request.path
    if (path === null) {
      if (typeof request.suggestedName !== 'string') throw new Error('文件名无效')
      const result = await dialog.showSaveDialog(window, {
        filters,
        defaultPath: suggestedFilename(request.suggestedName),
      })
      if (result.canceled || !result.filePath) return null
      path = files.authorizeSelected(result.filePath)
    }
    return files.save(path, request.contents)
  })
  ipcMain.handle('document:recent', (event) => {
    trusted(event)
    return files.getRecentFiles()
  })
  ipcMain.handle('document:open-recent', (event, path: unknown) => {
    trusted(event)
    return files.openRecent(path)
  })
  ipcMain.handle('recovery:read', (event) => {
    trusted(event)
    return files.readRecovery()
  })
  ipcMain.handle('recovery:write', (event, contents: unknown) => {
    trusted(event)
    return files.writeRecovery(contents)
  })
  ipcMain.on('document:dirty', (event, dirty: unknown, preserveRecovery: unknown = false) => {
    // send() has no rejection channel; silently reject untrusted/invalid notifications.
    const window = getWindow()
    if (
      event.sender !== window?.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      typeof dirty !== 'boolean' ||
      typeof preserveRecovery !== 'boolean'
    )
      return
    setDirty(dirty, preserveRecovery)
  })
}

function suggestedFilename(suggestion: string): string {
  const extension = '.trelyx'
  const sanitized = Array.from(suggestion, (character) =>
    character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character,
  )
    .join('')
    .trim()
  const stem = sanitized.endsWith(extension) ? sanitized.slice(0, -extension.length) : sanitized
  let filename = ''
  let bytes = Buffer.byteLength(extension)
  for (const character of stem) {
    const length = Buffer.byteLength(character)
    if (bytes + length > 200) break
    filename += character
    bytes += length
  }
  return `${filename.replace(/[. ]+$/u, '') || '未命名'}${extension}`
}
