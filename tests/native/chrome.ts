import { browser, expect } from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import { fixture } from '@tests/native/driver'

interface NativeButton {
  x: number
  y: number
  width: number
  height: number
  centerY: number
  visible: boolean
  enabled: boolean
}
interface MacChrome {
  coordinateSystem: string
  window: { titled: boolean; fullSizeContentView: boolean; titleHidden: boolean }
  buttons: { close: NativeButton; minimize: NativeButton; zoom: NativeButton }
}

export const checkMacChrome = async (): Promise<void> => {
  if (process.platform !== 'darwin') return
  const native = await fixture<MacChrome>('macChrome', {})
  const header = await browser.execute(() => {
    const element = document.querySelector('header.toolbar')
    if (!element?.firstElementChild) throw new Error('The native titlebar content is missing')
    const bounds = element.getBoundingClientRect()
    return {
      centerY: bounds.top + bounds.height / 2,
      left: element.firstElementChild.getBoundingClientRect().left,
      height: bounds.height,
    }
  })
  await writeFile(
    '/private/tmp/brainstorming-native-chrome-metrics.json',
    JSON.stringify({ native, header }, null, 2),
  )
  expect(native.coordinateSystem).toBe('content-top-left-points')
  expect(native.window).toEqual(
    expect.objectContaining({ titled: true, fullSizeContentView: true, titleHidden: true }),
  )
  expect(header.height).toBe(56)
  for (const button of Object.values(native.buttons)) {
    expect(button.visible).toBe(true)
    expect(button.enabled).toBe(true)
    expect(Math.abs(button.centerY - header.centerY)).toBeLessThanOrEqual(2)
  }
  expect(header.left - native.buttons.zoom.x - native.buttons.zoom.width).toBeGreaterThanOrEqual(8)
}
