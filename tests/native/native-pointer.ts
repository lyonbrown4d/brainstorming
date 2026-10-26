import { browser } from '@wdio/globals'
import { focusNativeWindow } from '@tests/native/driver'
import type { SpatialDragChoice } from '@tests/native/independent-spatial'

/** ChromeDriver's CEF input keeps a held gesture on the same protocol client. */
export const startNativePointer = async (choice: SpatialDragChoice) => {
  await focusNativeWindow()
  const send = (
    type: 'mouseMoved' | 'mousePressed' | 'mouseReleased',
    x: number,
    y: number,
    held = true,
  ) =>
    browser.sendCommand('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      pointerType: 'mouse',
      modifiers: 0,
      button: held ? 'left' : 'none',
      buttons: type === 'mouseReleased' || !held ? 0 : 1,
      ...(type === 'mouseMoved' ? {} : { clickCount: 1 }),
    })
  await send('mouseMoved', choice.start.x, choice.start.y, false)
  await send('mousePressed', choice.start.x, choice.start.y)
  try {
    const steps = 180
    for (let index = 1; index <= steps; index++) {
      await send(
        'mouseMoved',
        choice.start.x + ((choice.end.x - choice.start.x) * index) / steps,
        choice.start.y + ((choice.end.y - choice.start.y) * index) / steps,
      )
      await browser.pause(8)
    }
  } catch (error) {
    await send('mouseReleased', choice.end.x, choice.end.y)
    throw error
  }
  return {
    held: () => Promise.resolve(),
    release: async () => {
      await send('mouseReleased', choice.end.x, choice.end.y)
    },
  }
}
