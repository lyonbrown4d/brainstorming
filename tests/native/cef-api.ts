import type * as TauriCore from '@tauri-apps/api/core'
import type * as TauriWindow from '@tauri-apps/api/window'
import { browser } from '@wdio/globals'

declare global {
  interface Window {
    __TAURI__?: {
      core: Pick<typeof TauriCore, 'invoke'>
      window: Pick<typeof TauriWindow, 'getCurrentWindow'>
    }
  }
}

export const invokeNative = async <T>(command: string, args: Record<string, unknown>): Promise<T> =>
  browser.execute(
    async (name, request) => {
      if (!window.__TAURI__) throw new Error('The selected page has no native Tauri API')
      return window.__TAURI__.core.invoke<T>(name, request)
    },
    command,
    args,
  )

export const nativeWindows = async (): Promise<string[]> => {
  const labels: string[] = []
  for (const handle of await browser.getWindowHandles()) {
    try {
      await browser.switchToWindow(handle)
      const label = await browser.execute(() => window.__TAURI__?.window.getCurrentWindow().label)
      if (label) labels.push(label)
    } catch {
      /* A splash or closing secondary window may disappear during enumeration. */
    }
  }
  return labels
}

export const switchNativeWindow = async (label: string): Promise<void> => {
  await browser.waitUntil(
    async () => {
      for (const handle of await browser.getWindowHandles()) {
        try {
          await browser.switchToWindow(handle)
          if (
            (await browser.execute(() => window.__TAURI__?.window.getCurrentWindow().label)) ===
            label
          )
            return true
        } catch {
          /* Retry live targets without bypassing readiness. */
        }
      }
      return false
    },
    { timeoutMsg: `The native CEF window ${label} did not become available` },
  )
}
