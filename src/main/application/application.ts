import type { ResourceLifecycle } from '@main/resources/lifecycle'
import type { AIService } from '@main/ai/application'
import type { MCPService } from '@main/mcp/application'
import type { App } from 'electron'
import type { DocumentFiles } from '@main/files'
import type { OpenFileRequests } from '@main/openFiles'
import type { WindowLifecycle } from '@main/application/window'
import type { WindowSession } from '@main/application/session'
import type { ApplicationIPC } from '@main/application/ipc'
import type { NativeMenu } from '@main/application/nativeMenu'

export class DesktopApplication {
  private initialized = false
  private startup: Promise<void> | undefined
  private disposed: Promise<void> | undefined
  private readonly cleanup: (() => void)[] = []
  constructor(
    readonly session: WindowSession,
    readonly files: DocumentFiles,
    readonly requests: OpenFileRequests,
    private readonly windows: WindowLifecycle,
    private readonly ipc: ApplicationIPC,
    private readonly menu: NativeMenu,
    private readonly ai: AIService,
    private readonly mcp: MCPService,
    private readonly resources?: ResourceLifecycle,
  ) {}

  start = (): Promise<void> => {
    this.startup ??= (async () => {
      if (this.isStopping()) return
      this.windows.startSplash()
      await this.files.initialize()
      if (this.isStopping()) return
      await this.menu.initialize()
      if (this.isStopping()) return
      this.ipc.register()
      this.initialized = true
      this.windows.create()
    })()
    return this.startup
  }

  attach = (app: App, release: () => Promise<void>): void => {
    const openFile = (event: Electron.Event, path: string): void => {
      event.preventDefault()
      if (this.session.quitting || this.disposed) return
      if (this.requests.enqueue(path)) this.windows.notifyOpenFile(this.initialized)
    }
    const secondInstance = (_event: Electron.Event, arguments_: string[]): void => {
      if (this.session.quitting || this.disposed) return
      if (this.requests.enqueueArguments(arguments_)) this.windows.notifyOpenFile(this.initialized)
      else {
        const window = this.session.window
        if (window?.isMinimized()) window.restore()
        if (window?.isVisible()) window.focus()
      }
    }
    const activate = (): void => {
      if (this.initialized && !this.session.quitting && !this.disposed) this.windows.create()
    }
    const allClosed = (): void => {
      if (process.platform !== 'darwin') app.quit()
    }
    const beforeQuit = (): void => {
      this.session.quitting = true
      this.windows.dispose()
    }
    let released = false
    let releasing = false
    const willQuit = (event: Electron.Event): void => {
      if (released) return
      event.preventDefault()
      if (releasing) return
      releasing = true
      void release()
        .catch(() => undefined)
        .finally(() => {
          released = true
          // Let Electron finish canceling this native quit before requesting another one.
          setImmediate(() => {
            app.quit()
          })
        })
    }
    app.on('open-file', openFile)
    app.on('second-instance', secondInstance)
    app.on('activate', activate)
    app.on('window-all-closed', allClosed)
    app.on('before-quit', beforeQuit)
    app.on('will-quit', willQuit)
    this.cleanup.push(() => {
      app.removeListener('open-file', openFile)
      app.removeListener('second-instance', secondInstance)
      app.removeListener('activate', activate)
      app.removeListener('window-all-closed', allClosed)
      app.removeListener('before-quit', beforeQuit)
      app.removeListener('will-quit', willQuit)
    })
  }

  dispose = (): Promise<void> => {
    this.disposed ??= Promise.resolve().then(async () => {
      this.initialized = false
      this.ipc.dispose()
      this.windows.dispose()
      for (const remove of this.cleanup.splice(0)) remove()
      try {
        await Promise.all([this.ai.dispose(), this.mcp.dispose(), this.files.flush()])
      } finally {
        await this.resources?.dispose()
      }
    })
    return this.disposed
  }

  private isStopping = (): boolean => this.session.quitting || this.disposed !== undefined
}
