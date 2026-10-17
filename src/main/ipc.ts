import type { dialog as ElectronDialog } from 'electron'
import type { DocumentFiles } from '@main/files'
import { validateContents, validateSavePath } from '@main/files'
import type { SaveRequest } from '@shared/contracts'
import { readWindowState, setWindowAppearance } from '@main/windowChrome'
import type { IPCRegistry } from '@main/application/ipcRegistry'
import type { WindowSession } from '@main/application/session'
import type { OpenFileRequests } from '@main/openFiles'

const openFilters = [{ name: '思维导图', extensions: ['trelyx', 'xmind'] }]
const saveFilters = [{ name: 'Trelyx 思维导图', extensions: ['trelyx'] }]

export const registerIPC = (
  ipc: IPCRegistry,
  session: WindowSession,
  files: DocumentFiles,
  requests: OpenFileRequests,
  dialogs: Pick<typeof ElectronDialog, 'showOpenDialog' | 'showSaveDialog'>,
): void => {
  const trusted = session.trusted
  ipc.handle('window:state', (event) => readWindowState(trusted(event)))
  ipc.handle('window:appearance', (event, theme: unknown) => {
    setWindowAppearance(trusted(event), theme)
  })
  ipc.handle('document:has-open-file', (event) => {
    trusted(event)
    return requests.hasPending()
  })
  ipc.handle('document:take-open-file', async (event) => {
    const window = trusted(event)
    try {
      return await requests.take(files)
    } finally {
      if (requests.hasPending() && !window.isDestroyed() && !window.webContents.isDestroyed())
        window.webContents.send('document:open-file-ready')
    }
  })
  ipc.handle('document:open', async (event) => {
    const window = trusted(event)
    const result = await dialogs.showOpenDialog(window, {
      filters: openFilters,
      properties: ['openFile'],
    })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : files.openSelected(path)
  })
  ipc.handle('document:save', async (event, input: unknown) => {
    const window = trusted(event)
    if (!input || typeof input !== 'object') throw new Error('保存请求无效')
    const request = input as Partial<SaveRequest>
    validateContents(request.contents)
    if (request.path !== null) validateSavePath(request.path)
    let path = request.path
    if (path === null) {
      if (typeof request.suggestedName !== 'string') throw new Error('文件名无效')
      const result = await dialogs.showSaveDialog(window, {
        filters: saveFilters,
        defaultPath: suggestedFilename(request.suggestedName),
      })
      if (result.canceled || !result.filePath) return null
      path = files.authorizeSelected(result.filePath)
    }
    if (
      request.password !== undefined &&
      request.password !== null &&
      typeof request.password !== 'string'
    )
      throw new Error('密码设置无效')
    return request.password === undefined
      ? files.save(path, request.contents)
      : files.save(path, request.contents, request.password)
  })
  ipc.handle('document:recent', (event) => {
    trusted(event)
    return files.getRecentFiles()
  })
  ipc.handle('document:open-recent', (event, path: unknown) => {
    trusted(event)
    return files.openRecent(path)
  })
  ipc.handle('recovery:workspace:read', (event) => {
    trusted(event)
    return files.readWorkspaceRecovery()
  })
  ipc.handle('recovery:workspace:write', (event, contents: unknown) => {
    trusted(event)
    return files.writeWorkspaceRecovery(contents)
  })
  ipc.handle('recovery:read', (event) => {
    trusted(event)
    return files.readRecovery()
  })
  ipc.handle('document:unlock', (event, token: unknown, password: unknown) => {
    trusted(event)
    return files.unlockDocument(token, password)
  })
  ipc.handle('document:activate-unlocked', (event, token: unknown) => {
    trusted(event)
    return files.activateUnlockedDocument(token)
  })
  ipc.handle('document:cancel-unlock', (event, token: unknown) => {
    trusted(event)
    files.cancelUnlock(token)
  })
  ipc.handle('document:security', (event, id: unknown) => {
    trusted(event)
    return files.getFileSecurity(id)
  })
  ipc.handle('document:set-password', (event, id: unknown, password: unknown) => {
    trusted(event)
    return files.setFilePassword(id, password)
  })
  ipc.handle('recovery:read-locked', (event) => {
    trusted(event)
    return files.readLockedRecovery()
  })
  ipc.handle('document:backups', (event, id: unknown) => {
    trusted(event)
    return files.listDocumentBackups(id)
  })
  ipc.handle('document:restore-backup', (event, id: unknown) => {
    trusted(event)
    return files.restoreDocumentBackup(id)
  })
  ipc.handle('recovery:write', (event, contents: unknown) => {
    trusted(event)
    return files.writeRecovery(contents)
  })
  ipc.on('document:dirty', (event, dirty: unknown, preserveRecovery: unknown = false) => {
    // send() has no rejection channel; silently reject untrusted/invalid notifications.
    const window = session.getWindow()
    if (
      event.sender !== window?.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      typeof dirty !== 'boolean' ||
      typeof preserveRecovery !== 'boolean'
    )
      return
    session.setDirty(dirty, preserveRecovery)
  })
}

const suggestedFilename = (suggestion: string): string => {
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
