import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import type { WindowState } from '@shared/window'

/** Let the OS own caption buttons, resizing, snapping, and native close behavior. */
export const windowChromeOptions = (platform: NodeJS.Platform): BrowserWindowConstructorOptions => {
  return platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 21 } }
    : {
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#ffffff', symbolColor: '#6f778c', height: 56 },
        autoHideMenuBar: true,
      }
}

export const readWindowState = (window: BrowserWindow): WindowState => {
  return { focused: window.isFocused(), fullScreen: window.isFullScreen() }
}

export const installWindowChrome = (window: BrowserWindow): void => {
  const publish = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send('window:state-changed', readWindowState(window))
    }
  }
  window.on('focus', publish)
  window.on('blur', publish)
  window.on('enter-full-screen', publish)
  window.on('leave-full-screen', publish)
  window.once('closed', () => {
    window.removeListener('focus', publish)
    window.removeListener('blur', publish)
    window.removeListener('enter-full-screen', publish)
    window.removeListener('leave-full-screen', publish)
  })
}
