import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'node:path'
import { desktopConfig } from './config'
import { DocumentFiles } from './files'
import { registerIPC } from './ipc'
import { installMenu } from './menu'

app.setName('Trelyx')
let window: BrowserWindow | null = null
let dirty = false
let preserveRecovery = true
let closing = false
let confirming = false
let quitting = false
let files: DocumentFiles

function createWindow(): void {
  dirty = false
  preserveRecovery = true
  closing = false
  window = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: 'Trelyx',
    backgroundColor: '#f5f5f4',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })
  const current = window
  current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  current.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })
  current.webContents.on('will-redirect', (event) => {
    event.preventDefault()
  })
  current.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
  current.on('page-title-updated', (event) => {
    event.preventDefault()
  })
  current.on('close', (event) => {
    if (closing) return
    event.preventDefault()
    if (confirming) return
    confirming = true
    void (async () => {
      try {
        if (dirty) {
          const result = await dialog.showMessageBox(current, {
            type: 'warning',
            title: '关闭思维导图',
            message: '当前导图有未保存的更改。',
            detail: '关闭将丢弃这些更改。返回后可先保存文件。',
            buttons: ['返回编辑', '丢弃并关闭'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          })
          if (result.response !== 1) {
            quitting = false
            return
          }
        }
        // Preserve a startup recovery the renderer has not yet restored.
        if (dirty && !preserveRecovery) await files.clearRecovery()
        closing = true
        current.close()
      } catch {
        dialog.showErrorBox('无法关闭', '自动恢复文件清理失败，请重试。当前导图仍保留在窗口中。')
      } finally {
        confirming = false
      }
    })()
  })
  current.on('closed', () => {
    window = null
    if (quitting) app.quit()
  })
  const rendererURL = app.isPackaged ? undefined : desktopConfig.rendererURL
  const loading = rendererURL
    ? current.loadURL(rendererURL)
    : current.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  void loading.catch(() => {
    dialog.showErrorBox('无法打开 Trelyx', '界面加载失败，请重新启动应用。')
  })
}

void app
  .whenReady()
  .then(async () => {
    files = new DocumentFiles(app.getPath('userData'))
    await files.initialize()
    registerIPC(
      () => window,
      files,
      (value, preserve) => {
        dirty = value
        preserveRecovery = preserve
        window?.setDocumentEdited(value)
        window?.setTitle(`${value ? '● ' : ''}Trelyx`)
      },
    )
    installMenu((action) => window?.webContents.send('menu:action', action))
    createWindow()
    app.on('activate', () => {
      if (!window) createWindow()
    })
  })
  .catch(() => {
    dialog.showErrorBox('无法启动 Trelyx', '本地应用数据无法初始化，请检查存储空间与目录权限。')
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  quitting = true
})
