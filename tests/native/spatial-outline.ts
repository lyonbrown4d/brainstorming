import { browser, expect } from '@wdio/globals'
import { quietIndependentSpatial } from '@tests/native/independent-spatial'
import { focusNativeWindow } from '@tests/native/driver'

/** Select through the existing outline UI; this does not claim Three canvas pointer coverage. */
export const selectIndependentTopicFromOutline = async (title: string): Promise<void> => {
  const outline = () => browser.$('aside[aria-label="文档大纲"]')
  if (!(await outline().isDisplayed())) await browser.$('button[aria-label="文档大纲"]').click()
  await expect(outline()).toBeDisplayed()
  const topic = outline().$(`button=${title}`)
  await expect(topic).toBeDisplayed()
  await topic.click()
  await expect(topic).toHaveAttribute('aria-pressed', 'true')
  await outline().$('button[aria-label="关闭大纲"]').click()
  await expect(outline()).not.toExist()
  await expect(browser.$('[data-canvas-loading]')).not.toExist({ wait: 20_000 })
  await expect(browser.$('[data-slot="popover-content"]')).not.toExist()
  await quietIndependentSpatial()
  await focusNativeWindow()
  try {
    // Focus once after layout readiness and popover teardown, then observe without stealing focus.
    await browser.execute(() => {
      const panel = document.getElementById('sheet-panel')
      if (!(panel instanceof HTMLElement))
        throw new Error('Missing current independent canvas panel')
      panel.focus({ preventScroll: true })
    })
    let focusedSince = 0
    await browser.waitUntil(
      async () => {
        const focused = await browser.execute(() => {
          const panel = document.getElementById('sheet-panel')
          if (
            !(panel instanceof HTMLElement) ||
            !panel.isConnected ||
            !panel.getClientRects().length ||
            panel.closest('[inert]') ||
            document.querySelector('[data-canvas-loading], [data-slot="popover-content"]') ||
            document.visibilityState !== 'visible' ||
            !document.hasFocus()
          )
            return false
          return document.activeElement === panel
        })
        if (!focused) focusedSince = 0
        else if (!focusedSince) focusedSince = Date.now()
        return focused && Date.now() - focusedSince >= 200
      },
      { interval: 100, timeoutMsg: 'The ready independent canvas did not retain keyboard focus' },
    )
    await expect(browser.$('#sheet-panel')).toBeFocused()
  } catch (cause) {
    const state = await browser.execute(() => {
      const active = document.activeElement
      const panel = document.getElementById('sheet-panel')
      return {
        active: active?.outerHTML.slice(0, 600),
        panelConnected: panel?.isConnected,
        panelInert: Boolean(panel?.closest('[inert]')),
        loading: Boolean(document.querySelector('[data-canvas-loading]')),
        popover: Boolean(document.querySelector('[data-slot="popover-content"]')),
        focused: document.hasFocus(),
        visibility: document.visibilityState,
      }
    })
    throw new Error(`Independent canvas focus failed: ${JSON.stringify(state)}`, { cause })
  }
}
