import { browser, expect } from '@wdio/globals'
import { focusNativeWindow } from '@tests/native/driver'
import {
  quietIndependentSpatial,
  readIndependentSpatial,
  waitIndependentSpatial,
} from '@tests/native/independent-spatial'

const distance = async (): Promise<number> => {
  const text = await browser.$('.zoom-value').getText()
  const value = Number(text.replace(/[^\d]/g, ''))
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid camera distance: ${text}`)
  return value
}

/** Synthetic Ctrl+Wheel verifies the app contract, not hardware trackpad pinch delivery. */
export const verifySyntheticSpatialCtrlWheel = async (): Promise<void> => {
  await waitIndependentSpatial()
  await quietIndependentSpatial()
  await focusNativeWindow()
  // Reset is scene-relative; use its settled distance instead of an earlier entry fit.
  await browser.$('button[aria-label="重置视距"]').click()
  await quietIndependentSpatial()
  const before = await distance()
  const position = (await readIndependentSpatial()).camera?.position
  if (!position) throw new Error('Missing perspective camera position before synthetic Ctrl+Wheel')
  // The embedded driver's wheel action omits modifiers, even with a held Control key.
  const prevented = await browser.execute(() => {
    const canvas = document.querySelector('canvas[data-spatial-canvas="three"]')
    if (!canvas) throw new Error('Missing independent Three canvas')
    const rect = canvas.getBoundingClientRect()
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: rect.x + rect.width / 2,
      clientY: rect.y + rect.height / 2,
      deltaX: 0,
      deltaY: -40,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      ctrlKey: true,
    })
    canvas.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(prevented).toBe(true)
  await browser.waitUntil(async () => (await distance()) < before * 0.8, {
    timeoutMsg: 'Synthetic Ctrl+Wheel did not reduce the actual camera lens distance by 20%',
  })
  await quietIndependentSpatial()
  const after = (await readIndependentSpatial()).camera?.position
  if (!after) throw new Error('Missing perspective camera position after synthetic Ctrl+Wheel')
  expect(
    Math.hypot(...after.map((value, index) => value - (position[index] ?? 0))),
  ).toBeGreaterThan(before * 0.2)
  await expect(browser.$('canvas[data-spatial-canvas="three"]')).toBeDisplayed()
  await focusNativeWindow()
  await browser.$('button[aria-label="重置视距"]').click()
  await browser.waitUntil(async () => (await distance()) === before, {
    timeoutMsg: 'Reset must restore the same scene-relative distance after synthetic Ctrl+Wheel',
  })
}
