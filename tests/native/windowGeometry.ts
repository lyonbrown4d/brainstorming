import { browser } from '@wdio/globals'
import { fixture } from '@tests/native/driver'

interface WindowSize {
  width: number
  height: number
}

// CEF's embedded targets do not expose Chrome's Browser.getWindowForTarget.
// Resize the actual Tauri window, then wait for its renderer to reflect the size.
export const nativeWindowSize = () => fixture<WindowSize>('windowSize', {})

export const resizeNativeWindow = async (width: number, height: number): Promise<void> => {
  const actual = await fixture<WindowSize>('windowSize', { width, height })
  await browser.waitUntil(
    () =>
      browser.execute(
        (size) =>
          Math.abs(window.innerWidth - size.width) <= 1 &&
          Math.abs(window.innerHeight - size.height) <= 1,
        actual,
      ),
    { timeoutMsg: 'The renderer did not reflect the resized native window' },
  )
}
