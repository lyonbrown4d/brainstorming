import {
  clipboard,
  ClipboardItem,
  dialog,
  ipcMain,
  shell,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron'
import { validateTopicClipboard } from '@core'
import { safeAssetName } from '@assets'
import { exportFormats, type ExportRequest } from '@shared/exports'
import { atomicWrite } from '@main/files'

const CLIPBOARD_TYPE = 'web application/vnd.trelyx.topics+json'
const PREFIX = 'Trelyx topics v1\n'
const CLIPBOARD_LIMIT = 56 * 1024 * 1024

const assertText: (value: unknown, limit: number) => asserts value is string = (
  value: unknown,
  limit: number,
): asserts value is string => {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > limit)
    throw new Error('文本内容无效或超过大小限制')
}

const assertTopics: (value: unknown) => asserts value is string = (
  value: unknown,
): asserts value is string => {
  assertText(value, CLIPBOARD_LIMIT)
  if (!value.startsWith(PREFIX)) throw new Error('剪贴板主题格式无效')
  const parsed: unknown = JSON.parse(value.slice(PREFIX.length))
  validateTopicClipboard(parsed)
}

export const registerEditingIPC = (trusted: (event: IpcMainInvokeEvent) => BrowserWindow): void => {
  ipcMain.handle('clipboard:write-topics', async (event, contents: unknown, plainText: unknown) => {
    trusted(event)
    assertTopics(contents)
    assertText(plainText, 10 * 1024 * 1024)
    await clipboard.write([
      new ClipboardItem({ 'text/plain': plainText, [CLIPBOARD_TYPE]: contents }),
    ])
  })
  ipcMain.handle('clipboard:read-topics', async (event) => {
    trusted(event)
    const items = await clipboard.read()
    for (const item of items) {
      if (!item.types.includes(CLIPBOARD_TYPE)) continue
      const blob = await item.getType(CLIPBOARD_TYPE)
      if (blob.size > CLIPBOARD_LIMIT) throw new Error('剪贴板内容过大')
      const contents = await blob.text()
      assertTopics(contents)
      return contents
    }
    const contents = await clipboard.readText()
    assertText(contents, CLIPBOARD_LIMIT)
    return contents
  })
  ipcMain.handle('file:export', async (event, input: unknown) => {
    const window = trusted(event)
    if (!input || typeof input !== 'object') throw new Error('导出请求无效')
    const request = input as Partial<ExportRequest>
    if (!request.format || !exportFormats.includes(request.format)) throw new Error('导出格式无效')
    assertText(request.suggestedName, 4096)
    if (!(request.bytes instanceof Uint8Array) || request.bytes.byteLength > 128 * 1024 * 1024)
      throw new Error('导出内容无效或超过 128 MiB')
    const name = safeAssetName(request.suggestedName)
    const extension = `.${request.format}`
    const result = await dialog.showSaveDialog(window, {
      title: '导出导图',
      defaultPath: name.endsWith(extension) ? name : name + extension,
      filters: [{ name: request.format.toUpperCase(), extensions: [request.format] }],
    })
    if (result.canceled || !result.filePath) return null
    await atomicWrite(result.filePath, request.bytes)
    return result.filePath
  })
  ipcMain.handle('system:open-external', async (event, value: unknown) => {
    trusted(event)
    assertText(value, 4096)
    const url = new URL(value)
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password)
      throw new Error('只支持安全的网页或邮件链接')
    await shell.openExternal(url.href)
  })
}
