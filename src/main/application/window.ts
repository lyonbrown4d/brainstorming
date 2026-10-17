import type { LanguageStore } from '@main/language'
import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  MessageBoxOptions,
  MessageBoxReturnValue,
  dialog,
} from 'electron'
import { join } from 'node:path'
import type { DocumentFiles } from '@main/files'
import type { StartupWindow } from '@main/startupWindow'
import { windowChromeOptions } from '@main/windowChrome'
import type { ApplicationOptions } from '@main/application/options'
import type { WindowSession } from '@main/application/session'

export interface WindowPorts {
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow
  createStartup: (cancel: () => void, complete: () => void) => StartupWindow
  installChrome: (window: BrowserWindow) => void
  showMessageBox: (
    window: BrowserWindow,
    options: MessageBoxOptions,
  ) => Promise<MessageBoxReturnValue>
  showErrorBox: typeof dialog.showErrorBox
  quit: () => void
}

export class WindowLifecycle {
  private startup: StartupWindow | null = null
  private closing = false
  private confirming = false
  constructor(
    private readonly session: WindowSession,
    private readonly files: Pick<DocumentFiles, 'clearRecovery'>,
    private readonly options: ApplicationOptions,
    private readonly ports: WindowPorts,
    private readonly language: LanguageStore,
  ) {}

  startSplash = (): void => {
    if (this.startup) return
    this.startup = this.ports.createStartup(
      () => {
        this.dispose()
        this.session.window?.destroy()
        this.ports.quit()
      },
      () => {
        this.startup = null
      },
    )
  }

  notifyOpenFile = (initialized: boolean): void => {
    if (!this.session.window && initialized) this.create()
    const window = this.session.window
    if (window?.isMinimized()) window.restore()
    if (window?.isVisible()) window.focus()
    window?.webContents.send('document:open-file-ready')
  }

  create = (): void => {
    if (this.session.window) return
    this.startSplash()
    this.session.dirty = false
    this.session.preserveRecovery = true
    this.closing = false
    const current = this.ports.createWindow({
      width: 1280,
      height: 850,
      minWidth: 800,
      minHeight: 600,
      title: 'Trelyx',
      show: false,
      backgroundColor: '#f3f2f8',
      ...windowChromeOptions(this.options.platform),
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/index.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    })
    this.session.window = current
    this.startup?.attach(current)
    this.ports.installChrome(current)
    current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const prevent = (event: Electron.Event): void => {
      event.preventDefault()
    }
    current.webContents.on('will-navigate', prevent)
    current.webContents.on('will-redirect', prevent)
    current.webContents.on('will-attach-webview', prevent)
    current.on('page-title-updated', prevent)
    current.on('close', (event) => {
      if (this.closing) return
      event.preventDefault()
      if (this.confirming) return
      this.confirming = true
      void this.close(current).finally(() => {
        this.confirming = false
      })
    })
    current.on('closed', () => {
      this.session.window = null
      this.startup = null
      if (this.session.quitting) this.ports.quit()
    })
    const loading = this.options.rendererURL
      ? current.loadURL(this.options.rendererURL)
      : current.loadFile(join(import.meta.dirname, '../renderer/index.html'))
    void loading.catch(() => {
      if (!current.isDestroyed()) this.startup?.fail()
    })
  }

  private close = async (current: BrowserWindow): Promise<void> => {
    const language = await this.language.get()
    const text = (zh: string, en: string): string => (language === 'zh-CN' ? zh : en)
    try {
      if (this.session.dirty) {
        const result = await this.ports.showMessageBox(current, {
          type: 'warning',
          title: text('关闭 Trelyx', 'Close Trelyx'),
          message: text('有打开的导图尚未保存。', 'Some open maps have unsaved changes.'),
          detail: text(
            '关闭窗口将丢弃所有未保存的更改。可返回编辑并逐一保存导图。',
            'Closing the window discards all unsaved changes. Return to editing to save your maps first.',
          ),
          buttons: [text('返回编辑', 'Return to editing'), text('丢弃并关闭', 'Discard and close')],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        })
        if (result.response !== 1) {
          this.session.quitting = false
          return
        }
      }
      if (this.session.dirty && !this.session.preserveRecovery) await this.files.clearRecovery()
      this.closing = true
      current.close()
    } catch {
      this.session.quitting = false
      this.ports.showErrorBox(
        text('无法关闭', 'Unable to close'),
        text(
          '自动恢复文件清理失败，请重试。所有打开的导图仍保留在窗口中。',
          'Could not clear recovery files. Please try again. All open maps remain in the window.',
        ),
      )
    }
  }

  dispose = (): void => {
    this.startup?.dispose()
    this.startup = null
  }
}
