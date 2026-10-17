import type { BrowserWindow, IpcMainInvokeEvent, IpcMainEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, input?: unknown) => unknown>(),
  notifications: new Map<
    string,
    (event: IpcMainEvent, dirty: unknown, preserveRecovery?: unknown) => void
  >(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
}))
vi.mock('../../src/main/ai', () => ({ registerAIIPC: vi.fn() }))
vi.mock('electron', () => ({
  app: { on: vi.fn() },
  dialog: { showOpenDialog: mocks.showOpenDialog, showSaveDialog: mocks.showSaveDialog },
  ipcMain: {
    handle: (channel: string, handler: (event: IpcMainInvokeEvent, input?: unknown) => unknown) =>
      mocks.handlers.set(channel, handler),
    on: (
      channel: string,
      handler: (event: IpcMainEvent, dirty: unknown, preserveRecovery?: unknown) => void,
    ) => {
      mocks.notifications.set(channel, handler)
    },
  },
}))

import { DocumentFiles } from '@main/files'
import { registerIPC } from '@main/ipc'
import { createDocument, createWorkbook, serializeWorkbook } from '@core'

const setup = () => {
  const frame = {}
  const webContents = { mainFrame: frame }
  const window = {
    webContents,
    setBackgroundColor: vi.fn(),
    setTitleBarOverlay: vi.fn(),
    isFocused: () => false,
    isFullScreen: () => true,
  } as unknown as BrowserWindow
  const event = { sender: webContents, senderFrame: frame } as unknown as IpcMainInvokeEvent
  const files = new DocumentFiles('/unused-test-storage')
  const setDirty = vi.fn()
  registerIPC(
    () => window,
    files,
    setDirty,
    () => Promise.resolve(null),
    () => false,
  )
  return { event, files, setDirty }
}

const invoke = (channel: string, event: IpcMainInvokeEvent, input?: unknown) => {
  const handler = mocks.handlers.get(channel)
  if (!handler) throw new Error('Missing IPC handler')
  return Promise.resolve().then(() => handler(event, input))
}

describe('桌面 IPC 信任与取消', () => {
  it('只允许当前主框架读取原生窗口状态', async () => {
    const { event } = setup()
    expect(await invoke('window:state', event)).toEqual({ focused: false, fullScreen: true })
    for (const invalid of [
      { ...event, sender: {} },
      { ...event, senderFrame: {} },
    ]) {
      await expect(invoke('window:state', invalid as IpcMainInvokeEvent)).rejects.toThrow(
        '不受信任',
      )
    }
  })
  it('外观更新只允许主框架提交浅色或深色枚举', async () => {
    const { event } = setup()
    await expect(invoke('window:appearance', event, 'dark')).resolves.toBeUndefined()
    await expect(invoke('window:appearance', event, 'light')).resolves.toBeUndefined()
    await expect(invoke('window:appearance', event, 'system')).rejects.toThrow('外观无效')
    await expect(
      invoke('window:appearance', { ...event, senderFrame: {} } as IpcMainInvokeEvent, 'dark'),
    ).rejects.toThrow('不受信任')
  })
  it('取消打开或另存为返回 null，不触碰文档存储', async () => {
    const { event, files } = setup()
    const open = vi.spyOn(files, 'openSelected')
    const save = vi.spyOn(files, 'save')
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    mocks.showSaveDialog.mockResolvedValue({ canceled: true })
    expect(await invoke('document:open', event)).toBeNull()
    expect(
      await invoke('document:save', event, {
        path: null,
        suggestedName: '新导图',
        contents: serializeWorkbook(createWorkbook(createDocument())),
      }),
    ).toBeNull()
    expect(open).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('其他窗口或子框架不能读取恢复内容', async () => {
    const { event } = setup()
    await expect(
      invoke('recovery:read', { ...event, sender: {} } as IpcMainInvokeEvent),
    ).rejects.toThrow('不受信任')
    await expect(
      invoke('recovery:read', { ...event, senderFrame: {} } as IpcMainInvokeEvent),
    ).rejects.toThrow('不受信任')
  })
})

describe('桌面保存与恢复边界', () => {
  it('已有保存路径不依赖未使用的超长文件名建议', async () => {
    const { event, files } = setup()
    const path = '/selected/existing.trelyx'
    const save = vi.spyOn(files, 'save').mockResolvedValue(path)
    const contents = serializeWorkbook(createWorkbook(createDocument('标题'.repeat(300))))
    expect(
      await invoke('document:save', event, {
        path,
        contents,
        suggestedName: '标题'.repeat(300),
      }),
    ).toBe(path)
    expect(save).toHaveBeenCalledWith(path, contents)
  })

  it('另存为建议限制 UTF-8 字节长度且不切断字符', async () => {
    const { event } = setup()
    mocks.showSaveDialog.mockResolvedValue({ canceled: true })
    expect(
      await invoke('document:save', event, {
        path: null,
        contents: serializeWorkbook(createWorkbook(createDocument('长标题'))),
        suggestedName: '题😀/'.repeat(300),
      }),
    ).toBeNull()
    const call = mocks.showSaveDialog.mock.lastCall as unknown[] | undefined
    const options = call?.[1] as { defaultPath: string }
    expect(Buffer.byteLength(options.defaultPath)).toBeLessThanOrEqual(200)
    expect(options.defaultPath.endsWith('.trelyx')).toBe(true)
    expect(options.defaultPath).not.toContain('/')
    expect(options.defaultPath).not.toContain('�')
  })

  it('传递恢复保护状态并拒绝非布尔值和其他框架', () => {
    const { event, setDirty } = setup()
    const handler = mocks.notifications.get('document:dirty')
    if (!handler) throw new Error('Missing dirty handler')
    const notification = event as unknown as IpcMainEvent
    handler(notification, true, true)
    handler(notification, false)
    expect(setDirty.mock.calls).toEqual([
      [true, true],
      [false, false],
    ])
    handler(notification, true, 'false')
    handler(notification, 'true', false)
    handler({ ...notification, senderFrame: {} } as IpcMainEvent, true, false)
    expect(setDirty).toHaveBeenCalledTimes(2)
  })
})
