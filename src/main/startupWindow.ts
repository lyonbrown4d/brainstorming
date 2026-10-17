import { BrowserWindow, dialog, ipcMain, type IpcMainEvent } from 'electron'
import { join } from 'node:path'
import type { StartupPhase } from '@shared/startup'

/** Owns the native splash and the first-paint handoff; it never accesses document storage. */
export class StartupWindow {
  private readonly splash: BrowserWindow
  private main: BrowserWindow | null = null
  private painted = false
  private rendered = false
  private disposed = false
  private phase: StartupPhase = 'loading'
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    rendererURL: string | undefined,
    private readonly cancel: () => void,
    private readonly complete: () => void,
  ) {
    this.splash = new BrowserWindow({
      width: 440,
      height: 400,
      title: 'Trelyx — 正在启动',
      show: false,
      frame: false,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: '#f3f2f8',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/splash.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    })
    this.splash.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const prevent = (event: Electron.Event): void => {
      event.preventDefault()
    }
    this.splash.webContents.on('will-navigate', prevent)
    this.splash.webContents.on('will-redirect', prevent)
    this.splash.webContents.on('will-attach-webview', prevent)
    this.splash.once('ready-to-show', () => {
      if (!this.disposed) this.splash.show()
    })
    this.splash.on('close', () => {
      if (!this.disposed) this.cancel()
    })
    ipcMain.on('startup:ready', this.ready)
    ipcMain.on('startup:splash-mounted', this.mounted)
    ipcMain.on('startup:failed', this.failed)
    ipcMain.on('startup:retry', this.retry)
    ipcMain.on('startup:quit', this.quit)
    this.startTimer()
    const loading = rendererURL
      ? this.splash.loadURL(new URL('splash.html', rendererURL).href)
      : this.splash.loadFile(join(import.meta.dirname, '../renderer/splash.html'))
    void loading.catch(() => {
      if (this.disposed) return
      dialog.showErrorBox('无法启动 Trelyx', '启动画面加载失败，请重新启动应用。')
      this.cancel()
    })
  }

  attach = (main: BrowserWindow): void => {
    this.main = main
    main.once('ready-to-show', () => {
      this.painted = true
      this.reveal()
    })
    main.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) this.fail()
    })
    main.webContents.on('render-process-gone', () => {
      this.fail()
    })
    main.on('closed', () => {
      this.dispose()
    })
  }

  fail = (): void => {
    if (!this.disposed) {
      clearTimeout(this.timer)
      this.publish('failed')
    }
  }

  dispose = (): void => {
    if (this.disposed) return
    this.disposed = true
    clearTimeout(this.timer)
    ipcMain.removeListener('startup:ready', this.ready)
    ipcMain.removeListener('startup:splash-mounted', this.mounted)
    ipcMain.removeListener('startup:failed', this.failed)
    ipcMain.removeListener('startup:retry', this.retry)
    ipcMain.removeListener('startup:quit', this.quit)
    if (!this.splash.isDestroyed()) this.splash.destroy()
  }

  private trusted = (event: IpcMainEvent, window: BrowserWindow | null): boolean => {
    return Boolean(
      window &&
      !window.isDestroyed() &&
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame,
    )
  }

  private readonly ready = (event: IpcMainEvent): void => {
    if (this.trusted(event, this.main)) {
      this.rendered = true
      this.reveal()
    }
  }

  private readonly mounted = (event: IpcMainEvent): void => {
    if (this.trusted(event, this.splash)) this.publish(this.phase)
  }

  private readonly failed = (event: IpcMainEvent): void => {
    if (this.trusted(event, this.main)) this.fail()
  }

  private readonly retry = (event: IpcMainEvent): void => {
    if (!this.trusted(event, this.splash) || !this.main || this.main.isDestroyed()) return
    this.rendered = false
    this.publish('loading')
    this.startTimer()
    this.main.webContents.reload()
  }

  private readonly quit = (event: IpcMainEvent): void => {
    if (this.trusted(event, this.splash)) this.cancel()
  }

  private reveal = (): void => {
    if (this.disposed || !this.painted || !this.rendered || !this.main || this.main.isDestroyed())
      return
    this.main.show()
    this.dispose()
    this.complete()
  }

  private publish = (phase: StartupPhase): void => {
    this.phase = phase
    if (!this.disposed && !this.splash.isDestroyed())
      this.splash.webContents.send('startup:phase', phase)
  }

  private startTimer = (): void => {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      if (!this.disposed) this.publish('slow')
    }, 15_000)
  }
}
