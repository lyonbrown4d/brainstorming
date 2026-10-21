import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { nativeArtifact } from '@tests/native/artifacts'
import {
  artifact,
  closeSaved,
  create,
  dockAction,
  ensureProperties,
  home,
  named,
  openSaved,
  root,
  rootHasText,
  save,
} from '@tests/native/driver'

// Real IPC, command history and SQLite complement the canvas pointer tests.
describe('native proportional topic scale', () => {
  it('scales a topic once, restores history, and preserves its scale after reopening', async () => {
    await home()
    await create('整体缩放验收')
    await root().click()
    await expect(browser.$$('.react-flow__resize-control')).toBeElementsArrayOfSize(4)
    await ensureProperties()
    const scale = () => browser.$('input[aria-label="主题缩放"]')
    await expect(scale()).toHaveValue('100')
    const before = await root().getSize('width')
    await scale().setValue('175')
    await browser.keys(Key.Enter)
    await expect(scale()).toHaveValue('175')
    await browser.waitUntil(
      async () => Math.abs((await root().getSize('width')) / before - 1.75) < 0.02,
    )
    await dockAction('撤销')
    await expect(scale()).toHaveValue('100')
    await dockAction('重做')
    await expect(scale()).toHaveValue('175')
    await browser.saveScreenshot(await nativeArtifact('brainstorming-native-topic-scale.png'))

    const name = artifact('topic-scale')
    const workbook = await save(name)
    const style = workbook.sheets[0]?.document.topics.root?.style
    expect(style?.scale).toBe(1.75)
    expect(style?.fontSize).toBeUndefined()
    expect(style?.width).toBeUndefined()
    await closeSaved()
    await openSaved(name)
    await rootHasText('整体缩放验收')
    await root().click()
    await ensureProperties()
    await expect(scale()).toHaveValue('175')
    await named('重置为 100%').click()
    await expect(scale()).toHaveValue('100')
    await browser.waitUntil(
      async () => Math.abs((await root().getSize('width')) / before - 1) < 0.02,
    )
    await dockAction('撤销')
    await expect(scale()).toHaveValue('175')
  })
})
