import { expect, type Locator, type Page } from '@playwright/test'

/** Chromium creates native composition/input events; no application state is injected. */
export const composeChinese = async (page: Page, input: Locator, text: string) => {
  await input.press('ControlOrMeta+A')
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Input.imeSetComposition', {
      text: 'zhongwen',
      selectionStart: 8,
      selectionEnd: 8,
    })
    await expect(input).toContainText('zhongwen')
    // Candidate-confirming key events must not invoke mind-map Enter/Tab actions.
    for (const key of ['Enter', 'Tab', 'Escape'])
      await input.dispatchEvent('keydown', {
        key,
        keyCode: 229,
        isComposing: true,
        bubbles: true,
      })
    await session.send('Input.insertText', { text })
    await expect(input).toHaveText(text)
  } finally {
    await session.detach()
  }
}
