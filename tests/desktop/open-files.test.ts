import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserWindow, dialog as ElectronDialog, IpcMain, IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { IPCRegistry } from '@main/application/ipcRegistry'
import { WindowSession } from '@main/application/session'
import type { DocumentFiles } from '@main/files'
import { registerIPC } from '@main/ipc'
import { OpenFileRequests } from '@main/openFiles'
import type { OpenedDocument } from '@shared/contracts'

vi.mock('electron', () => ({ nativeTheme: {} }))

const pathFor = (name: string): string => join(tmpdir(), 'trelyx-open-requests', name)
const opened = (path: string): OpenedDocument => ({ path, contents: '' })
const createFiles = () => ({
  openSelected: vi.fn((path: string): Promise<OpenedDocument> => Promise.resolve(opened(path))),
})

const setupIPC = () => {
  const requests = new OpenFileRequests()
  const files = createFiles()
  const frame = {}
  const webContents = { mainFrame: frame, isDestroyed: vi.fn(() => false), send: vi.fn() }
  const window = { webContents, isDestroyed: vi.fn(() => false) }
  const session = new WindowSession()
  session.window = window as unknown as BrowserWindow
  const handlers = new Map<string, Parameters<IpcMain['handle']>[1]>()
  const ipc = {
    handle: (channel: string, handler: Parameters<IpcMain['handle']>[1]) => {
      handlers.set(channel, handler)
    },
    on: vi.fn(),
  } as unknown as IpcMain
  registerIPC(
    new IPCRegistry(ipc),
    session,
    files as unknown as DocumentFiles,
    requests,
    {} as Pick<typeof ElectronDialog, 'showOpenDialog' | 'showSaveDialog'>,
  )
  const event = { sender: webContents, senderFrame: frame } as unknown as IpcMainInvokeEvent
  const take = (input = event): Promise<unknown> => {
    const handler = handlers.get('document:take-open-file')
    if (!handler) throw new Error('Missing open-file handler')
    return Promise.resolve().then((): unknown => handler(input))
  }
  return { requests, files, window, webContents, event, take }
}

describe('operating-system document open queue', () => {
  it('keeps every valid argument in order and deduplicates normalized absolute paths', async () => {
    const requests = new OpenFileRequests()
    const files = createFiles()
    const first = pathFor('first.trelyx')
    const second = pathFor('second.XMIND')
    expect(
      requests.enqueueArguments([
        '--inspect',
        'relative.trelyx',
        pathFor('ignored.txt'),
        first,
        `${first}/../first.trelyx`,
        second,
      ]),
    ).toBe(true)
    expect(await requests.take(files)).toEqual(opened(first))
    expect(await requests.take(files)).toEqual(opened(second))
    expect(requests.hasPending()).toBe(false)
    expect(await requests.take(files)).toBeNull()
    expect(files.openSelected).toHaveBeenCalledTimes(2)
  })

  it('limits pending requests to 32 without replacing earlier requests', async () => {
    const requests = new OpenFileRequests()
    const files = createFiles()
    const paths = Array.from({ length: 33 }, (_, index) => pathFor(`${index}.trelyx`))
    expect(requests.enqueueArguments(paths)).toBe(true)
    expect(requests.enqueue(pathFor('overflow.trelyx'))).toBe(false)
    const documents: (OpenedDocument | null)[] = []
    while (requests.hasPending()) documents.push(await requests.take(files))
    expect(documents).toEqual(paths.slice(0, 32).map(opened))
    const overflow = pathFor('32.trelyx')
    expect(requests.enqueue(overflow)).toBe(true)
    expect(await requests.take(files)).toEqual(opened(overflow))
  })

  it('rejects malformed requests and consumes a failed file without losing the next request', async () => {
    const requests = new OpenFileRequests()
    const files = createFiles()
    expect(requests.enqueueArguments(['', 'relative.xmind', pathFor('nul\0.trelyx')])).toBe(false)
    expect(requests.hasPending()).toBe(false)
    requests.enqueueArguments([pathFor('damaged.trelyx'), pathFor('valid.trelyx')])
    files.openSelected.mockRejectedValueOnce(new Error('damaged ZIP'))
    await expect(requests.take(files)).rejects.toThrow('damaged ZIP')
    expect(requests.hasPending()).toBe(true)
    expect(await requests.take(files)).toEqual(opened(pathFor('valid.trelyx')))
  })
})

describe('queued open-file IPC', () => {
  it('notifies the renderer after a successful take while more paths remain', async () => {
    const { requests, webContents, take } = setupIPC()
    requests.enqueueArguments([pathFor('first.trelyx'), pathFor('second.trelyx')])
    expect(await take()).toEqual(opened(pathFor('first.trelyx')))
    expect(webContents.send).toHaveBeenCalledExactlyOnceWith('document:open-file-ready')
    expect(await take()).toEqual(opened(pathFor('second.trelyx')))
    expect(webContents.send).toHaveBeenCalledTimes(1)
  })

  it('notifies after a rejected take so a later valid file can still open', async () => {
    const { requests, files, webContents, take } = setupIPC()
    requests.enqueueArguments([pathFor('damaged.trelyx'), pathFor('valid.trelyx')])
    files.openSelected.mockRejectedValueOnce(new Error('damaged ZIP'))
    await expect(take()).rejects.toThrow('damaged ZIP')
    expect(webContents.send).toHaveBeenCalledExactlyOnceWith('document:open-file-ready')
    expect(await take()).toEqual(opened(pathFor('valid.trelyx')))
  })

  it('rejects other senders and child frames before consuming any queued capability', async () => {
    const { requests, files, webContents, event, take } = setupIPC()
    requests.enqueue(pathFor('private.trelyx'))
    for (const invalid of [
      { ...event, sender: {} },
      { ...event, senderFrame: {} },
    ]) {
      await expect(take(invalid as IpcMainInvokeEvent)).rejects.toThrow('不受信任')
    }
    expect(requests.hasPending()).toBe(true)
    expect(files.openSelected).not.toHaveBeenCalled()
    expect(webContents.send).not.toHaveBeenCalled()
  })

  it('does not publish to destroyed windows or web contents', async () => {
    for (const target of ['window', 'webContents'] as const) {
      const fixture = setupIPC()
      fixture[target].isDestroyed.mockReturnValue(true)
      fixture.requests.enqueueArguments([pathFor('first.trelyx'), pathFor('second.trelyx')])
      expect(await fixture.take()).toEqual(opened(pathFor('first.trelyx')))
      expect(fixture.requests.hasPending()).toBe(true)
      expect(fixture.webContents.send).not.toHaveBeenCalled()
    }
  })
})
