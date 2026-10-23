import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { quietIndependentSpatial, waitIndependentSpatial } from '@tests/native/independent-spatial'

const distance = async (): Promise<number> => {
  const text = await browser.$('.zoom-value').getText()
  const value = Number(text.replace(/[^\d]/g, ''))
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid camera distance: ${text}`)
  return value
}

/** WebDriver wheel actions exercise the application Ctrl-pinch contract. */
export const verifySpatialPinch = async (): Promise<void> => {
  await waitIndependentSpatial()
  await quietIndependentSpatial()
  const before = await distance()
  const point = await browser.execute(() => {
    const canvas = document.querySelector('canvas[data-spatial-canvas="three"]')
    if (!canvas) throw new Error('Missing independent Three canvas')
    const rect = canvas.getBoundingClientRect()
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
  })
  try {
    await browser.performActions([
      {
        type: 'key',
        id: 'spatial-pinch-modifier',
        actions: [
          { type: 'keyDown', value: Key.Control },
          { type: 'pause', duration: 200 },
          { type: 'keyUp', value: Key.Control },
        ],
      },
      {
        type: 'wheel',
        id: 'spatial-pinch-wheel',
        actions: [
          { type: 'pause', duration: 0 },
          { type: 'scroll', x: point.x, y: point.y, deltaX: 0, deltaY: -40, duration: 150 },
          { type: 'pause', duration: 0 },
        ],
      },
    ])
  } finally {
    await browser.releaseActions()
  }
  await browser.waitUntil(async () => (await distance()) < before * 0.8)
  await expect(browser.$('canvas[data-spatial-canvas="three"]')).toBeDisplayed()
  await browser.$('button[aria-label="重置视距"]').click()
  await browser.waitUntil(async () => (await distance()) === before)
}
