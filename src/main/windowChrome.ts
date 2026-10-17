import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import { nativeTheme } from 'electron'
import type { WindowState } from '@shared/window'

export const setWindowAppearance = (
  window: BrowserWindow,
  theme: unknown,
  platform = process.platform,
): void => {
  if (theme !== 'light' && theme !== 'dark') throw new Error('应用外观无效')
  const color = theme === 'dark' ? '#252830' : '#ffffff'
  window.setBackgroundColor(color)
  if (platform !== 'darwin')
    window.setTitleBarOverlay({
      color,
      symbolColor: theme === 'dark' ? '#eceff5' : '#565b69',
      height: 56,
    })
}

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
  const systemThemeChanged = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send('window:system-theme-changed')
    }
  }
  nativeTheme.on('updated', systemThemeChanged)
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
    nativeTheme.removeListener('updated', systemThemeChanged)
    window.removeListener('focus', publish)
    window.removeListener('blur', publish)
    window.removeListener('enter-full-screen', publish)
    window.removeListener('leave-full-screen', publish)
  })
}
