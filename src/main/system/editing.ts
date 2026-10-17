import type {
  BrowserWindow,
  clipboard as ElectronClipboard,
  ClipboardItem as ElectronClipboardItem,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from 'electron'
import { safeAssetName } from '@assets'
import { exportFormats, type ExportRequest } from '@shared/exports'
import { atomicWrite } from '@main/file-security/write'
import { assertText, assertTopics } from '@main/system/clipboardValidation'

const CLIPBOARD_TYPE = 'web application/vnd.brainstorming.topics+json'
const CLIPBOARD_LIMIT = 56 * 1024 * 1024

export interface EditingPorts {
  clipboard: Pick<typeof ElectronClipboard, 'write' | 'read' | 'readText'>
  createClipboardItem: (data: Record<string, string>) => InstanceType<typeof ElectronClipboardItem>
  showSaveDialog: (
    window: BrowserWindow,
    options: SaveDialogOptions,
  ) => Promise<SaveDialogReturnValue>
  openExternal: (url: string) => Promise<void>
}

export class SystemEditing {
  constructor(private readonly ports: EditingPorts) {}

  writeTopics = async (contents: unknown, plainText: unknown): Promise<void> => {
    assertTopics(contents)
    assertText(plainText, 10 * 1024 * 1024)
    await this.ports.clipboard.write([
      this.ports.createClipboardItem({ 'text/plain': plainText, [CLIPBOARD_TYPE]: contents }),
    ])
  }

  readTopics = async (): Promise<string> => {
    const items = await this.ports.clipboard.read()
    for (const item of items) {
      if (!item.types.includes(CLIPBOARD_TYPE)) continue
      const blob = await item.getType(CLIPBOARD_TYPE)
      if (blob.size > CLIPBOARD_LIMIT) throw new Error('剪贴板内容过大')
      const contents = await blob.text()
      assertTopics(contents)
      return contents
    }
    const contents = await this.ports.clipboard.readText()
    assertText(contents, CLIPBOARD_LIMIT)
    return contents
  }

  exportFile = async (window: BrowserWindow, input: unknown): Promise<string | null> => {
    if (!input || typeof input !== 'object') throw new Error('导出请求无效')
    const request = input as Partial<ExportRequest>
    if (!request.format || !exportFormats.includes(request.format)) throw new Error('导出格式无效')
    assertText(request.suggestedName, 4096)
    if (!(request.bytes instanceof Uint8Array) || request.bytes.byteLength > 128 * 1024 * 1024)
      throw new Error('导出内容无效或超过 128 MiB')
    const name = safeAssetName(request.suggestedName)
    const extension = `.${request.format}`
    const result = await this.ports.showSaveDialog(window, {
      title: '导出导图',
      defaultPath: name.endsWith(extension) ? name : name + extension,
      filters: [{ name: request.format.toUpperCase(), extensions: [request.format] }],
    })
    if (result.canceled || !result.filePath) return null
    await atomicWrite(result.filePath, request.bytes)
    return result.filePath
  }

  openExternal = async (value: unknown): Promise<void> => {
    assertText(value, 4096)
    const url = new URL(value)
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password)
      throw new Error('只支持安全的网页或邮件链接')
    await this.ports.openExternal(url.href)
  }
}
