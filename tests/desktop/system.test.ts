import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { BrowserWindow, dialog } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetFiles } from '@main/system/assets'
import { SystemEditing } from '@main/system/editing'
import { applyCommand, createDocument, createTopicClipboard } from '@core'

let directory: string
const window = {} as BrowserWindow
const showSaveDialog = vi.fn<typeof dialog.showSaveDialog>()
const showOpenDialog = vi.fn<typeof dialog.showOpenDialog>()
const openExternal = vi.fn<(url: string) => Promise<void>>()
const writeClipboard = vi.fn<typeof Electron.clipboard.write>()
const readClipboard = vi.fn<typeof Electron.clipboard.read>()
const readText = vi.fn<typeof Electron.clipboard.readText>()
const createClipboardItem = vi.fn<(data: Record<string, string>) => Electron.ClipboardItem>()
const editing = new SystemEditing({
  clipboard: { write: writeClipboard, read: readClipboard, readText },
  createClipboardItem,
  showSaveDialog,
  openExternal,
})
const assets = new AssetFiles({ showSaveDialog, showOpenDialog, decodeImage: () => true })
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'brainstorming-system-'))
  vi.resetAllMocks()
  openExternal.mockResolvedValue()
  writeClipboard.mockResolvedValue()
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('injected native editing capabilities', () => {
  it('preserves private and plain-text clipboard payloads, rejecting malformed topics before native writes', async () => {
    const document = applyCommand(createDocument(), {
      type: 'addTopic',
      id: 'child',
      parentId: 'root',
      title: 'Branch',
      side: 'right',
    })
    const contents =
      'Brainstorming topics v1\n' + JSON.stringify(createTopicClipboard(document, ['child']))
    const item = {} as Electron.ClipboardItem
    createClipboardItem.mockReturnValue(item)
    await editing.writeTopics(contents, 'Branch')
    expect(createClipboardItem).toHaveBeenCalledWith({
      'text/plain': 'Branch',
      'web application/vnd.brainstorming.topics+json': contents,
    })
    expect(writeClipboard).toHaveBeenCalledWith([item])
    await expect(editing.writeTopics('invalid', 'Branch')).rejects.toThrow('格式无效')
    expect(writeClipboard).toHaveBeenCalledTimes(1)
  })

  it('accepts safe external links and rejects executable or credential-bearing URLs before opening', async () => {
    await editing.openExternal('https://example.com/reference')
    expect(openExternal).toHaveBeenCalledWith('https://example.com/reference')
    for (const url of [
      'file:///private/file',
      'javascript:alert(1)',
      'https://user:secret@example.com',
    ])
      await expect(editing.openExternal(url)).rejects.toThrow('安全')
    expect(openExternal).toHaveBeenCalledTimes(1)
  })

  it('writes exported bytes only to the native selected path and honors cancel', async () => {
    const output = join(directory, 'export.svg')
    const request = {
      format: 'svg',
      suggestedName: '../bad:name',
      bytes: new TextEncoder().encode('<svg/>'),
    } as const
    showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: '' })
    expect(await editing.exportFile(window, request)).toBeNull()
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: output })
    expect(await editing.exportFile(window, request)).toBe(output)
    expect(await readFile(output, 'utf8')).toBe('<svg/>')
    expect(showSaveDialog).toHaveBeenLastCalledWith(
      window,
      expect.objectContaining({ defaultPath: 'bad_name.svg' }),
    )
    await expect(editing.exportFile(window, { ...request, format: 'exe' })).rejects.toThrow(
      '格式无效',
    )
    expect(showSaveDialog).toHaveBeenCalledTimes(2)
  })

  it('keeps canceled asset imports and invalid assets from reaching native file writes', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await assets.select(window, 'image')).toBeNull()
    await expect(assets.export(window, { name: '../../invalid' })).rejects.toThrow()
    expect(showSaveDialog).not.toHaveBeenCalled()
  })
})
