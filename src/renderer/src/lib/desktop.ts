import type { DesktopAPI } from '@shared/contracts'

declare global {
  interface Window {
    trelyx?: DesktopAPI
  }
}

/** System capabilities are available only through the sandboxed Electron preload. */
export const requireDesktopAPI = (): DesktopAPI => {
  if (typeof window === 'undefined' || !window.trelyx)
    throw new Error('Trelyx 需要 Electron 桌面环境，请从桌面应用打开。')
  return window.trelyx
}
