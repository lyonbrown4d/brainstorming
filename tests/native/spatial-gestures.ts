import { browser, expect } from '@wdio/globals'

const distance = async (): Promise<number> => {
  const text = await browser.$('.zoom-value').getText()
  const value = Number(text.replace(/[^\d]/g, ''))
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid camera distance: ${text}`)
  return value
}

/** Verify WebKit's pinch wheel contract; physical trackpad motion remains a manual check. */
export const verifySpatialPinch = async (): Promise<void> => {
  await expect(browser.$('[data-canvas-loading]')).not.toExist()
  await browser.waitUntil(async () => (await distance()) === 400)
  const before = await distance()
  await browser.execute(() => {
    const pane = document.querySelector('.react-flow__pane')
    if (!pane) throw new Error('Missing spatial pane')
    pane.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -40,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await browser.waitUntil(async () => (await distance()) < before * 0.8)
  await browser.$('.zoom-value').click()
  await browser.waitUntil(async () => (await distance()) === before)
}
