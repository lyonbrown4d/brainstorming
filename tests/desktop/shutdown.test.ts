import { EventEmitter } from 'node:events'
import type { App } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopApplication } from '@main/application/application'
import { WindowSession } from '@main/application/session'
import type { DocumentFiles } from '@main/files'
import type { OpenFileRequests } from '@main/openFiles'
import type { WindowLifecycle } from '@main/application/window'
import type { ApplicationIPC } from '@main/application/ipc'
import type { NativeMenu } from '@main/application/nativeMenu'
import type { AIService } from '@main/ai/application'
import type { MCPService } from '@main/mcp/application'

const applications: DesktopApplication[] = []
const setup = (release: () => Promise<void>) => {
  const application = new DesktopApplication(
    new WindowSession(),
    { flush: () => Promise.resolve() } as DocumentFiles,
    {} as OpenFileRequests,
    { dispose: () => undefined } as unknown as WindowLifecycle,
    { dispose: () => undefined } as unknown as ApplicationIPC,
    {} as NativeMenu,
    { dispose: () => Promise.resolve() } as AIService,
    { dispose: () => Promise.resolve() } as MCPService,
  )
  const app = Object.assign(new EventEmitter(), { quit: vi.fn() })
  application.attach(app as unknown as App, release)
  applications.push(application)
  return { app, application }
}
const nextTurn = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(() => {
      setImmediate(resolve)
    })
  })
afterEach(async () => {
  await Promise.all(applications.splice(0).map((application) => application.dispose()))
})

describe('native graceful shutdown', () => {
  it('retries native quit on a fresh event-loop turn after cleanup has completed', async () => {
    const release = vi.fn(() => Promise.resolve())
    const { app } = setup(release)
    let nativeQuitting = true
    let exited = false
    app.quit.mockImplementation(() => {
      if (!nativeQuitting) exited = true
    })
    const event = { preventDefault: vi.fn() }
    app.emit('will-quit', event)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
    expect(app.quit).not.toHaveBeenCalled()
    // Electron clears its native quitting flag after the canceled event has returned.
    nativeQuitting = false
    await nextTurn()
    expect(app.quit).toHaveBeenCalledOnce()
    expect(exited).toBe(true)
  })

  it('coalesces repeated quit requests while asynchronous cleanup is pending', async () => {
    let finish: (() => void) | undefined
    const release = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const { app } = setup(release)
    app.emit('will-quit', { preventDefault: vi.fn() })
    app.emit('will-quit', { preventDefault: vi.fn() })
    expect(release).toHaveBeenCalledOnce()
    expect(app.quit).not.toHaveBeenCalled()
    if (!finish) throw new Error('Cleanup was not started')
    finish()
    await nextTurn()
    expect(app.quit).toHaveBeenCalledOnce()
    const later = { preventDefault: vi.fn() }
    app.emit('will-quit', later)
    expect(later.preventDefault).not.toHaveBeenCalled()
  })

  it('completes the native exit retry even if cleanup rejects', async () => {
    const { app } = setup(() => Promise.reject(new Error('cleanup failed')))
    app.emit('will-quit', { preventDefault: vi.fn() })
    await nextTurn()
    expect(app.quit).toHaveBeenCalledOnce()
  })
})
