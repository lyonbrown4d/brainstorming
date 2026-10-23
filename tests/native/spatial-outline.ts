import { browser, expect } from '@wdio/globals'
import { quietIndependentSpatial } from '@tests/native/independent-spatial'

/** Select through the existing outline UI; this does not claim Three canvas pointer coverage. */
export const selectIndependentTopicFromOutline = async (title: string): Promise<void> => {
  const outline = () => browser.$('aside[aria-label="文档大纲"]')
  if (!(await outline().isDisplayed())) await browser.$('button[aria-label="文档大纲"]').click()
  await expect(outline()).toBeDisplayed()
  const topic = outline().$(`button=${title}`)
  await expect(topic).toBeDisplayed()
  if ((await topic.getAttribute('aria-pressed')) !== 'true') await topic.click()
  await expect(topic).toHaveAttribute('aria-pressed', 'true')
  await outline().$('button[aria-label="关闭大纲"]').click()
  await expect(outline()).not.toExist()
  await quietIndependentSpatial()
  // The embedded driver can focus DOM controls even though its pointer actions emit MouseEvents.
  await browser.$('#sheet-panel').execute((element) => {
    element.focus({ preventScroll: true })
  })
  await expect(browser.$('#sheet-panel')).toBeFocused()
}
