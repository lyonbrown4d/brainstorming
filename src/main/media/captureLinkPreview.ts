import { writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { BrowserWindow as ElectronBrowserWindow } from 'electron'
import type { PreviewURLPolicy } from '@main/media/linkPreviewPolicy'
import { normalizePreviewURL } from '@main/media/linkPreviewPolicy'
import { createPreviewNetwork } from '@main/media/linkPreviewNetwork'

export type LinkPreviewCapture = (
  url: string,
  path: string,
  signal: AbortSignal,
  allowURL: PreviewURLPolicy,
) => Promise<void>

export const captureLinkPreview: LinkPreviewCapture = async (url, path, signal, allowURL) => {
  if (!normalizePreviewURL(url)) throw new Error('Preview URL is invalid')
  const { BrowserWindow, session } = await import('electron')
  signal.throwIfAborted()
  const isolated = session.fromPartition(`link-preview-${randomUUID()}`, { cache: false })
  const controller = new AbortController()
  const abort = () => {
    controller.abort()
  }
  signal.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 20_000)
  const network = createPreviewNetwork(allowURL, controller.signal)
  let ownedWindow: ElectronBrowserWindow | undefined
  let handlesHttp = false
  let handlesHttps = false
  try {
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false)
    })
    isolated.setPermissionCheckHandler(() => false)
    isolated.on('will-download', (event) => {
      event.preventDefault()
    })
    isolated.protocol.handle('http', network.fetch)
    handlesHttp = true
    isolated.protocol.handle('https', network.fetch)
    handlesHttps = true
    const window = new BrowserWindow({
      width: 1280,
      height: 720,
      useContentSize: true,
      show: false,
      webPreferences: {
        session: isolated,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        navigateOnDragDrop: false,
        spellcheck: false,
        backgroundThrottling: false,
        disableDialogs: true,
        offscreen: true,
      },
    })
    ownedWindow = window
    const contents = window.webContents
    contents.setAudioMuted(true)
    contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-attach-webview', (event) => {
      event.preventDefault()
    })
    const checkNavigation = (event: Electron.Event, destination: string) => {
      if (!normalizePreviewURL(destination)) event.preventDefault()
    }
    contents.on('will-navigate', checkNavigation)
    contents.on('will-redirect', checkNavigation)
    isolated.webRequest.onBeforeRequest((details, callback) => {
      if (
        !normalizePreviewURL(details.url) ||
        ['webSocket', 'media'].includes(details.resourceType)
      ) {
        callback({ cancel: true })
        return
      }
      void allowURL(details.url).then(
        (allowed) => {
          callback({ cancel: !allowed || controller.signal.aborted })
        },
        () => {
          callback({ cancel: true })
        },
      )
    })
    const stopped = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => {
          if (!window.isDestroyed()) window.destroy()
          reject(new DOMException('Link preview cancelled or timed out', 'AbortError'))
        },
        { once: true },
      )
    })
    await Promise.race([
      (async () => {
        await window.loadURL(url)
        controller.signal.throwIfAborted()
        const image = await contents.capturePage(
          { x: 0, y: 0, width: 1280, height: 720 },
          { stayHidden: true },
        )
        if (image.isEmpty()) throw new Error('Link preview produced no image')
        controller.signal.throwIfAborted()
        // Bound output pixels on Retina displays as well as the CSS viewport.
        const preview = image.resize({ width: 1280, height: 720, quality: 'good' })
        await writeFile(path, preview.toPNG())
      })(),
      stopped,
    ])
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
    controller.abort()
    if (ownedWindow && !ownedWindow.isDestroyed()) ownedWindow.destroy()
    network.dispose()
    isolated.webRequest.onBeforeRequest(null)
    isolated.removeAllListeners('will-download')
    isolated.setPermissionRequestHandler(null)
    isolated.setPermissionCheckHandler(null)
    if (handlesHttp) isolated.protocol.unhandle('http')
    if (handlesHttps) isolated.protocol.unhandle('https')
    await Promise.allSettled([
      isolated.closeAllConnections(),
      isolated.clearStorageData(),
      isolated.clearCache(),
    ])
  }
}
